import {Alert, Linking, Platform, Share} from 'react-native';
import type {TranslateFn} from '@/i18n/translate';
import {pickDeviceContacts} from '@/services/referral/contactPicker';
import {
  buildSmsComposerUrl,
  runContactInvite,
} from '@/services/referral/inviteFromContacts';
import {getMyReferralProgress} from '@/services/supabase/referralService';

function ask(title: string, body: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(title, body, [
      {text: cancelLabel, style: 'cancel', onPress: () => resolve(false)},
      {text: confirmLabel, onPress: () => resolve(true)},
    ]);
  });
}

/**
 * Find venner → system contact picker → the existing invite text.
 * The message app or share sheet stays open until the user sends or dismisses it.
 */
export function startContactInvite(t: TranslateFn) {
  const cancelLabel = t('friendsScreen.contactsNotNow');
  return runContactInvite({
    loadMessage: async () => {
      const progress = await getMyReferralProgress();
      if (!progress.url || !progress.code) {
        throw new Error('CONTACT_INVITE_NO_LINK');
      }
      return t('inviteFive.shareMessage', {
        code: progress.code,
        url: progress.url,
      });
    },
    pickContacts: pickDeviceContacts,
    openComposer: async (phones, message) => {
      await Linking.openURL(buildSmsComposerUrl(Platform.OS, phones, message));
    },
    openShareSheet: async message => {
      await Share.share({message});
    },
    confirmSkipped: skippedNames =>
      ask(
        t('friendsScreen.contactsSkippedTitle'),
        t('friendsScreen.contactsSkippedBody', {names: skippedNames.join(', ')}),
        t('friendsScreen.contactsContinue'),
        cancelLabel,
      ),
    confirmMissingNumber: name =>
      ask(
        t('friendsScreen.contactsMissingNumberTitle'),
        t('friendsScreen.contactsMissingNumberBody', {
          name: name || t('friendsScreen.contactsUnnamed'),
        }),
        t('friendsScreen.contactsShareLink'),
        cancelLabel,
      ),
    confirmChooseNumber: (name, phones) =>
      new Promise(resolve => {
        const choices = phones.slice(0, 2).map(phone => ({
          text: phone,
          onPress: () => resolve(phone),
        }));
        Alert.alert(
          t('friendsScreen.contactsChooseNumberTitle'),
          t('friendsScreen.contactsChooseNumberBody', {
            name: name || t('friendsScreen.contactsUnnamed'),
          }),
          [
            ...choices,
            {text: cancelLabel, style: 'cancel', onPress: () => resolve(null)},
          ],
        );
      }),
    confirmComposerFallback: () =>
      ask(
        t('friendsScreen.contactsComposerFailedTitle'),
        t('friendsScreen.contactsComposerFailedBody'),
        t('friendsScreen.contactsShareLink'),
        cancelLabel,
      ),
    report: kind => {
      if (kind === 'empty') {
        Alert.alert(
          t('friendsScreen.contactsEmptyTitle'),
          t('friendsScreen.contactsEmptyBody'),
        );
        return;
      }
      if (kind === 'picker_failed') {
        Alert.alert(
          t('friendsScreen.contactsPickerFailedTitle'),
          t('friendsScreen.contactsPickerFailedBody'),
        );
        return;
      }
      Alert.alert(
        t('friendsScreen.contactsInviteFailedTitle'),
        t('friendsScreen.contactsInviteFailedBody'),
      );
    },
  });
}
