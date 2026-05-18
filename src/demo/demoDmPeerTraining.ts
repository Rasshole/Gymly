/**
 * Demo-only: fake "live" tjek-ind for DM-header (matcher ikke Supabase).
 */

import {DEMO_PROFILES} from '@/demo/demoPersonas';

export type DemoRecipientTrainingHeader = {
  gymName: string;
  workoutType: string | null;
  startedAt: string;
};

function workoutKeyFromDemoUsername(username: string): string {
  const u = username.toLowerCase();
  if (u.includes('cardio') || u.includes('løb') || u.includes('spin')) {
    return 'cardio';
  }
  if (u.includes('ben') || u.includes('leg')) {
    return 'ben';
  }
  if (u.includes('bryst') || u.includes('push')) {
    return 'bryst,triceps';
  }
  if (u.includes('biceps')) {
    return 'biceps,ryg';
  }
  if (u.includes('ryg')) {
    return 'ryg';
  }
  if (u.includes('skulder')) {
    return 'skulder';
  }
  if (u.includes('mave') || u.includes('core')) {
    return 'mave';
  }
  if (u.includes('triceps')) {
    return 'triceps';
  }
  if (u.includes('pilates')) {
    return 'pilates';
  }
  if (u.includes('reformer')) {
    return 'reformer';
  }
  return 'bryst';
}

/**
 * Returnerer syntetisk aktiv session til demo-DM-header, eller null når "ikke tjekket ind".
 */
export function getDemoPeerLiveTrainingForFriend(friendId: string): DemoRecipientTrainingHeader | null {
  const idx = DEMO_PROFILES.findIndex(f => f.id === friendId);
  if (idx < 0) {
    return null;
  }
  if (idx % 3 === 2) {
    return null;
  }
  const p = DEMO_PROFILES[idx]!;
  const centers = [
    'SATS — Valby',
    'PureGym Nørrebro',
    'SATS Frederiksberg',
    'Fitness World Amager',
    'Loop Fitness Østerbro',
  ];
  const gymName = centers[idx % centers.length]!;
  const workoutType = workoutKeyFromDemoUsername(p.username);
  const startedMinutesAgo = 18 + (idx % 67);
  const startedAt = new Date(Date.now() - startedMinutesAgo * 60_000).toISOString();
  return {gymName, workoutType, startedAt};
}
