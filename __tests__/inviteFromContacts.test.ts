import fs from 'fs';
import path from 'path';
import {
  buildSmsComposerUrl,
  planContactInvite,
  runContactInvite,
  sanitizePickerResult,
  usablePhone,
  type ContactInviteDeps,
  type ContactPickerResult,
} from '@/services/referral/inviteFromContacts';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function deps(
  picked: ContactPickerResult,
  overrides: Partial<ContactInviteDeps> = {},
): ContactInviteDeps & {
  composer: string[][];
  shares: string[];
} {
  const composer: string[][] = [];
  const shares: string[] = [];
  return {
    composer,
    shares,
    loadMessage: async () => 'Træn med mig på Gymly! https://gymlyapp.com/invite/CQVIEWER5F70',
    pickContacts: async () => picked,
    openComposer: async phones => {
      composer.push(phones);
    },
    openShareSheet: async message => {
      shares.push(message);
    },
    confirmSkipped: async () => true,
    confirmMissingNumber: async () => false,
    confirmChooseNumber: async (_name, phones) => phones[0] ?? null,
    confirmComposerFallback: async () => false,
    report: () => undefined,
    ...overrides,
  };
}

describe('invite from contacts', () => {
  it('keeps only a dialable number from the selected contact', () => {
    expect(usablePhone(' 12 34 56 78 ')).toBe('12345678');
    expect(usablePhone('+45 12 34 56 78')).toBe('+4512345678');
    expect(usablePhone('ingen nummer')).toBeNull();
    expect(usablePhone('123')).toBeNull();
  });

  it('drops every field except name and phone numbers', () => {
    const raw = sanitizePickerResult({
      cancelled: false,
      contacts: [
        {
          displayName: ' Kontakt QA ',
          phoneNumbers: ['+45 11 11 00 01', 'ikke et nummer'],
          email: 'secret@example.com',
        } as never,
      ],
    });
    expect(raw.contacts[0]).toEqual({
      displayName: 'Kontakt QA',
      phoneNumbers: ['+45 11 11 00 01', 'ikke et nummer'],
    });
    expect(JSON.stringify(raw)).not.toContain('secret@example.com');
  });

  it('does nothing when the picker is cancelled', async () => {
    const flow = deps({cancelled: true, contacts: []});
    await expect(runContactInvite(flow)).resolves.toBe('cancelled');
    expect(flow.composer).toEqual([]);
    expect(flow.shares).toEqual([]);
  });

  it('explains an empty contact and does not open a composer', async () => {
    const reports: string[] = [];
    const flow = deps(
      {cancelled: false, contacts: [{displayName: '  ', phoneNumbers: []}]},
      {report: kind => reports.push(kind)},
    );
    await expect(runContactInvite(flow)).resolves.toBe('empty');
    expect(reports).toEqual(['empty']);
    expect(flow.composer).toEqual([]);
  });

  it('does not share a contact without a number unless the user asks', async () => {
    const flow = deps({
      cancelled: false,
      contacts: [{displayName: 'Uden nummer', phoneNumbers: []}],
    });
    await expect(runContactInvite(flow)).resolves.toBe('cancelled');
    expect(flow.shares).toEqual([]);

    const share = deps(
      {cancelled: false, contacts: [{displayName: 'Uden nummer', phoneNumbers: []}]},
      {confirmMissingNumber: async () => true},
    );
    await expect(runContactInvite(share)).resolves.toBe('shared');
    expect(share.shares).toHaveLength(1);
    expect(share.composer).toEqual([]);
  });

  it('opens one composer for the chosen number and does not send by itself', async () => {
    const flow = deps({
      cancelled: false,
      contacts: [{displayName: 'Kontakt QA', phoneNumbers: ['+45 11 11 00 01']}],
    });
    await expect(runContactInvite(flow)).resolves.toBe('composed');
    expect(flow.composer).toEqual([['+4511110001']]);
    expect(flow.shares).toEqual([]);
    expect(buildSmsComposerUrl('ios', ['+4511110001'], 'Hej https://gymlyapp.com/invite/X')).toBe(
      'sms:+4511110001&body=Hej%20https%3A%2F%2Fgymlyapp.com%2Finvite%2FX',
    );
    expect(buildSmsComposerUrl('android', ['+4511110001'], 'Hej')).toBe(
      'sms:+4511110001?body=Hej',
    );
  });

  it('asks before a second number and stops if that choice is dismissed', async () => {
    const plan = planContactInvite(
      {
        cancelled: false,
        contacts: [{displayName: 'Kontakt QA', phoneNumbers: ['11110001', '22220002']}],
      },
      'link',
    );
    expect(plan.kind).toBe('choose_number');
    const flow = deps(
      {
        cancelled: false,
        contacts: [{displayName: 'Kontakt QA', phoneNumbers: ['11110001', '22220002']}],
      },
      {confirmChooseNumber: async () => null},
    );
    await expect(runContactInvite(flow)).resolves.toBe('cancelled');
    expect(flow.composer).toEqual([]);
  });

  it('falls back to the share sheet only after the user confirms', async () => {
    const blocked = deps(
      {cancelled: false, contacts: [{displayName: 'Kontakt QA', phoneNumbers: ['11110001']}]},
      {openComposer: async () => {
        throw new Error('no messages app');
      }},
    );
    await expect(runContactInvite(blocked)).resolves.toBe('cancelled');
    expect(blocked.shares).toEqual([]);

    const allowed = deps(
      {cancelled: false, contacts: [{displayName: 'Kontakt QA', phoneNumbers: ['11110001']}]},
      {
        openComposer: async () => {
          throw new Error('no messages app');
        },
        confirmComposerFallback: async () => true,
      },
    );
    await expect(runContactInvite(allowed)).resolves.toBe('shared');
    expect(allowed.shares).toHaveLength(1);
  });

  it('keeps the entry behind the invite surface and does not request the address book', () => {
    const friends = read('src/screens/main/FriendsScreen.tsx');
    const gate = friends.indexOf('isInviteFiveFriendsSurfaceEnabled() && !isSearching');
    const button = friends.indexOf('invite-from-contacts');
    expect(gate).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(gate);

    const plist = read('ios/GymlyFresh/Info.plist');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const swift = read('ios/GymlyFresh/Contacts/GymlyContactPicker.swift');
    const kotlin = read('android/app/src/main/java/com/gymly/app/contacts/GymlyContactPickerModule.kt');
    expect(plist).not.toMatch(/NSContactsUsageDescription/);
    expect(manifest).not.toMatch(/READ_CONTACTS/);
    expect(manifest).not.toMatch(/SEND_SMS/);
    expect(swift).not.toMatch(/CNContactStore/);
    expect(swift).toMatch(/CNContactPickerViewController/);
    expect(kotlin).toMatch(/Intent\.ACTION_PICK/);
    expect(kotlin).not.toMatch(/READ_CONTACTS/);
    expect(read('src/config/launchSurfaceConfig.ts')).toMatch(
      /INVITE_5_FRIENDS_ENABLED = false/,
    );
    expect(read('src/i18n/translations/da.ts')).toMatch(/inviteFromContacts: 'Inviter fra kontakter'/);
    expect(read('src/i18n/translations/en.ts')).toMatch(/inviteFromContacts: 'Invite from contacts'/);
  });

  it('shares the invite code as readable text through the system share sheet', () => {
    const screen = read('src/screens/main/InviteFiveFriendsScreen.tsx');
    const da = read('src/i18n/translations/da.ts');
    const en = read('src/i18n/translations/en.ts');
    expect(screen).toMatch(/Share\.share\(\{/);
    expect(screen).toMatch(/t\('inviteFive\.shareMessage'/);
    expect(screen).not.toMatch(/react-native-share|FBSDK|shareSingle/);
    expect(da).toMatch(/shareMessage: 'Træn med mig på Gymly!\\nInvite-kode: \{\{code\}\}\\n\{\{url\}\}'/);
    expect(en).toMatch(/shareMessage: 'Train with me on Gymly!\\nInvite code: \{\{code\}\}\\n\{\{url\}\}'/);
    expect(read('package.json')).not.toMatch(/react-native-fbsdk|react-native-fb-sdk/);
  });
});
