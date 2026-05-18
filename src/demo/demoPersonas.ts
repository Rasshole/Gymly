/**
 * Fiktive, realistiske demo-profiler (kun til intern optagelse — ikke rigtige brugere).
 */

import type {PublicProfile} from '@/services/supabase/friendService';

export function demoProfileAvatarSeed(username: string): string {
  return `https://picsum.photos/seed/gymly-${encodeURIComponent(username)}/256/256`;
}

function demoUuid(suffix: number): string {
  const h = Math.max(0, suffix).toString(16).padStart(12, '0').slice(0, 12);
  return `f0000000-0000-4000-8000-${h}`;
}

const RAW: {n: number; username: string; displayName: string}[] = [
  {n: 1, username: 'emil_kbhn', displayName: 'Emil Hansen'},
  {n: 2, username: 'sofiefrb', displayName: 'Sofie Larsen'},
  {n: 3, username: 'tobias_push', displayName: 'Tobias Jensen'},
  {n: 4, username: 'clara_m', displayName: 'Clara Madsen'},
  {n: 5, username: 'sarafrb', displayName: 'Sara Mortensen'},
  {n: 6, username: 'tobias_push', displayName: 'Tobias Larsen'},
  {n: 7, username: 'clara_pilates', displayName: 'Clara Andersen'},
  {n: 8, username: 'magnusryg', displayName: 'Magnus Poulsen'},
  {n: 9, username: 'sofie_cardio', displayName: 'Sofie Christensen'},
  {n: 10, username: 'noah_sats', displayName: 'Noah Jensen'},
  {n: 11, username: 'ida_pure', displayName: 'Ida Thomsen'},
  {n: 12, username: 'viktor_ben', displayName: 'Viktor Madsen'},
  {n: 13, username: 'julie_skulder', displayName: 'Julie Holm'},
  {n: 14, username: 'oscar_biceps', displayName: 'Oscar Berg'},
  {n: 15, username: 'emma_mave', displayName: 'Emma Krogh'},
  {n: 16, username: 'william_triceps', displayName: 'William Dahl'},
  {n: 17, username: 'alma_reformer', displayName: 'Alma Nygaard'},
  {n: 18, username: 'frederik_gym', displayName: 'Frederik Vestergaard'},
  {n: 19, username: 'mathilde_løb', displayName: 'Mathilde Frandsen'},
  {n: 20, username: 'elias_valby', displayName: 'Elias Kjær'},
  {n: 21, username: 'karla_fisken', displayName: 'Karla Winther'},
  {n: 22, username: 'anton_vanloese', displayName: 'Anton Gregersen'},
  {n: 23, username: 'nora_fitnessx', displayName: 'Nora Svendsen'},
  {n: 24, username: 'oliver_bryst', displayName: 'Oliver Brandt'},
  {n: 25, username: 'liv_streak', displayName: 'Liv Damgaard'},
  {n: 26, username: 'mikkel_aften', displayName: 'Mikkel Toft'},
  {n: 27, username: 'amalie_core', displayName: 'Amalie Birk'},
  {n: 28, username: 'rasmus_solid', displayName: 'Rasmus Egede'},
  {n: 29, username: 'petra_pushday', displayName: 'Petra Iversen'},
  {n: 30, username: 'jonas_kettle', displayName: 'Jonas Falk'},
  {n: 31, username: 'celine_yoga', displayName: 'Celine Roux'},
  {n: 32, username: 'henrik_legday', displayName: 'Henrik Møller'},
  {n: 33, username: 'mette_spin', displayName: 'Mette Lauridsen'},
  {n: 34, username: 'simon_pr', displayName: 'Simon Hjorth'},
  {n: 35, username: 'tina_roed', displayName: 'Tina Rømer'},
  {n: 36, username: 'kasper_gains', displayName: 'Kasper Foged'},
  {n: 37, username: 'linea_loop', displayName: 'Linea Holst'},
  {n: 38, username: 'victor_pure', displayName: 'Victor Nguyen'},
  {n: 39, username: 'naja_fx', displayName: 'Naja Østergaard'},
  {n: 40, username: 'filip_amager', displayName: 'Filip Søndergaard'},
];

export const DEMO_PROFILES: PublicProfile[] = RAW.map(r => ({
  id: demoUuid(r.n),
  username: r.username,
  displayName: r.displayName,
  avatarUrl: demoProfileAvatarSeed(r.username),
  avatarUpdatedAt: null,
}));

export function getDemoProfileById(id: string): PublicProfile | undefined {
  return DEMO_PROFILES.find(p => p.id === id);
}
