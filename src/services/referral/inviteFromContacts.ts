/**
 * Invite selected contacts with the personal Gymly link.
 * The platform picker supplies only the contacts the user chose.
 * Nothing here reads an address book, uploads numbers, or sends a message.
 */

export type PickedContact = {
  displayName: string;
  phoneNumbers: string[];
};

export type ContactPickerResult = {
  cancelled: boolean;
  contacts: PickedContact[];
};

export type ContactInvitePlan =
  | {kind: 'cancelled'}
  | {kind: 'empty'}
  | {kind: 'missing_number'; name: string}
  | {kind: 'choose_number'; name: string; phones: string[]; message: string}
  | {
      kind: 'compose';
      phones: string[];
      names: string[];
      skippedNames: string[];
      message: string;
    };

const MAX_PHONES_PER_CONTACT = 8;

/** Keep a dialable number. Display text and short fragments are not addresses. */
export function usablePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) {
    return null;
  }
  return compact.startsWith('+') ? `+${digits}` : digits;
}

export function sanitizePickerResult(raw: ContactPickerResult): ContactPickerResult {
  const contacts = Array.isArray(raw.contacts) ? raw.contacts : [];
  return {
    cancelled: raw.cancelled === true,
    contacts: contacts.map(contact => {
      const phones = Array.isArray(contact?.phoneNumbers) ? contact.phoneNumbers : [];
      return {
        displayName: typeof contact?.displayName === 'string' ? contact.displayName.trim() : '',
        phoneNumbers: phones
          .filter((phone): phone is string => typeof phone === 'string')
          .slice(0, MAX_PHONES_PER_CONTACT),
      };
    }),
  };
}

function phonesFor(contact: PickedContact): string[] {
  const unique: string[] = [];
  for (const raw of contact.phoneNumbers) {
    const phone = usablePhone(raw);
    if (phone && !unique.includes(phone)) {
      unique.push(phone);
    }
  }
  return unique;
}

/**
 * Decide the next step from the contacts the user just picked.
 * An empty picker result is not treated as "everyone in the address book".
 */
export function planContactInvite(
  raw: ContactPickerResult,
  message: string,
): ContactInvitePlan {
  const result = sanitizePickerResult(raw);
  if (result.cancelled) {
    return {kind: 'cancelled'};
  }
  const contacts = result.contacts.filter(
    contact => contact.displayName.length > 0 || phonesFor(contact).length > 0,
  );
  if (contacts.length === 0) {
    return {kind: 'empty'};
  }

  const ready = contacts
    .map(contact => ({
      name: contact.displayName,
      phones: phonesFor(contact),
    }))
    .filter(contact => contact.phones.length > 0);
  const skippedNames = contacts
    .filter(contact => phonesFor(contact).length === 0)
    .map(contact => contact.displayName)
    .filter(name => name.length > 0);

  if (ready.length === 0) {
    return {kind: 'missing_number', name: skippedNames[0] || contacts[0].displayName};
  }

  if (ready.length === 1 && ready[0].phones.length > 1) {
    return {
      kind: 'choose_number',
      name: ready[0].name,
      phones: ready[0].phones,
      message,
    };
  }

  const phones = ready.flatMap(contact =>
    contact.phones.length === 1 ? contact.phones : [contact.phones[0]],
  );
  return {
    kind: 'compose',
    phones,
    names: ready.map(contact => contact.name).filter(name => name.length > 0),
    skippedNames,
    message,
  };
}

export function buildSmsComposerUrl(
  platform: string,
  phones: string[],
  message: string,
): string {
  const recipients = phones.map(phone => usablePhone(phone)).filter((phone): phone is string => Boolean(phone));
  if (recipients.length === 0) {
    throw new Error('CONTACT_INVITE_NO_RECIPIENT');
  }
  const body = encodeURIComponent(message);
  const list = recipients.join(',');
  if (platform === 'ios') {
    return `sms:${list}&body=${body}`;
  }
  return `sms:${list}?body=${body}`;
}

export type ContactInviteDeps = {
  loadMessage: () => Promise<string>;
  pickContacts: () => Promise<ContactPickerResult>;
  openComposer: (phones: string[], message: string) => Promise<void>;
  openShareSheet: (message: string) => Promise<void>;
  confirmSkipped: (skippedNames: string[]) => Promise<boolean>;
  confirmMissingNumber: (name: string) => Promise<boolean>;
  confirmChooseNumber: (name: string, phones: string[]) => Promise<string | null>;
  confirmComposerFallback: () => Promise<boolean>;
  report: (kind: 'empty' | 'invite_failed' | 'picker_failed') => void;
};

/**
 * Picker, then the system composer or share sheet.
 * Each send path waits for a user confirmation and never transmits by itself.
 */
export async function runContactInvite(
  deps: ContactInviteDeps,
): Promise<'cancelled' | 'empty' | 'composed' | 'shared' | 'failed'> {
  let message: string;
  try {
    message = (await deps.loadMessage()).trim();
  } catch {
    deps.report('invite_failed');
    return 'failed';
  }
  if (!message) {
    deps.report('invite_failed');
    return 'failed';
  }

  let picked: ContactPickerResult;
  try {
    picked = await deps.pickContacts();
  } catch {
    deps.report('picker_failed');
    return 'failed';
  }

  const plan = planContactInvite(picked, message);
  if (plan.kind === 'cancelled') {
    return 'cancelled';
  }
  if (plan.kind === 'empty') {
    deps.report('empty');
    return 'empty';
  }
  if (plan.kind === 'missing_number') {
    const share = await deps.confirmMissingNumber(plan.name);
    if (!share) {
      return 'cancelled';
    }
    await deps.openShareSheet(message);
    return 'shared';
  }
  if (plan.kind === 'choose_number') {
    const phone = await deps.confirmChooseNumber(plan.name, plan.phones);
    if (!phone) {
      return 'cancelled';
    }
    return openComposerOrShare(deps, [phone], plan.message);
  }

  if (plan.skippedNames.length > 0) {
    const proceed = await deps.confirmSkipped(plan.skippedNames);
    if (!proceed) {
      return 'cancelled';
    }
  }
  return openComposerOrShare(deps, plan.phones, plan.message);
}

async function openComposerOrShare(
  deps: ContactInviteDeps,
  phones: string[],
  message: string,
): Promise<'composed' | 'shared' | 'cancelled' | 'failed'> {
  try {
    await deps.openComposer(phones, message);
    return 'composed';
  } catch {
    const share = await deps.confirmComposerFallback();
    if (!share) {
      return 'cancelled';
    }
    try {
      await deps.openShareSheet(message);
      return 'shared';
    } catch {
      deps.report('invite_failed');
      return 'failed';
    }
  }
}
