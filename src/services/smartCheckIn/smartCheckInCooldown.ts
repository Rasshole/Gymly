import AsyncStorage from '@react-native-async-storage/async-storage';
import {cooldownMapAfterDismiss} from '@/services/smartCheckIn/smartCheckInRules';

const STORAGE_KEY = 'gymly.smartCheckIn.cooldown.v1';

type CooldownFile = Record<string, Record<string, number>>;

async function readFile(): Promise<CooldownFile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as CooldownFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function readSmartCheckInCooldowns(
  userId: string,
): Promise<Record<string, number>> {
  const file = await readFile();
  const mine = file[userId];
  if (!mine || typeof mine !== 'object') {
    return {};
  }
  const now = Date.now();
  const active: Record<string, number> = {};
  for (const [gymId, until] of Object.entries(mine)) {
    if (typeof until === 'number' && until > now) {
      active[gymId] = until;
    }
  }
  return active;
}

export async function dismissSmartCheckInGyms(
  userId: string,
  gymIds: readonly string[],
  nowMs = Date.now(),
): Promise<void> {
  const file = await readFile();
  file[userId] = cooldownMapAfterDismiss(file[userId] ?? {}, gymIds, nowMs);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}
