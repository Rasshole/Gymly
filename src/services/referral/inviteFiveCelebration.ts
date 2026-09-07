import AsyncStorage from '@react-native-async-storage/async-storage';

const CELEBRATION_KEY = '@gymly/invite_five_celebration_shown';

export async function hasShownInviteFiveCelebration(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CELEBRATION_KEY);
  return raw === '1';
}

export async function markInviteFiveCelebrationShown(): Promise<void> {
  await AsyncStorage.setItem(CELEBRATION_KEY, '1');
}

/** Test helper */
export async function clearInviteFiveCelebrationShown(): Promise<void> {
  await AsyncStorage.removeItem(CELEBRATION_KEY);
}
