import {NativeModules} from 'react-native';
import {
  sanitizePickerResult,
  type ContactPickerResult,
  type PickedContact,
} from '@/services/referral/inviteFromContacts';

type NativeContactPicker = {
  pickContacts?: () => Promise<{
    cancelled?: boolean;
    contacts?: Array<{displayName?: string; phoneNumbers?: string[]}>;
  }>;
};

/**
 * Opens the platform contact picker.
 * The native side must return only the contact the user selected.
 */
export async function pickDeviceContacts(): Promise<ContactPickerResult> {
  const native = NativeModules.GymlyContactPicker as NativeContactPicker | undefined;
  if (!native?.pickContacts) {
    throw new Error('CONTACT_PICKER_UNAVAILABLE');
  }
  const raw = await native.pickContacts();
  const contacts: PickedContact[] = Array.isArray(raw?.contacts)
    ? raw.contacts.map(contact => ({
        displayName: typeof contact?.displayName === 'string' ? contact.displayName : '',
        phoneNumbers: Array.isArray(contact?.phoneNumbers)
          ? contact.phoneNumbers.filter((phone): phone is string => typeof phone === 'string')
          : [],
      }))
    : [];
  return sanitizePickerResult({
    cancelled: raw?.cancelled === true,
    contacts,
  });
}
