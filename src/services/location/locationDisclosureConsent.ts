/**
 * Persist whether the user explicitly accepted the Gymly location prominent disclosure.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@gymly/location_prominent_disclosure_v2_accepted';

let memoryAccepted: boolean | null = null;

export async function hasAcceptedLocationProminentDisclosure(): Promise<boolean> {
  if (memoryAccepted === true) {
    return true;
  }
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    memoryAccepted = v === '1';
    return memoryAccepted;
  } catch {
    return false;
  }
}

export async function markLocationProminentDisclosureAccepted(): Promise<void> {
  memoryAccepted = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function __resetLocationProminentDisclosureForTests(): Promise<void> {
  memoryAccepted = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
