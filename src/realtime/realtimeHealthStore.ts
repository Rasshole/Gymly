/**
 * Dev-only: lightweight health snapshot for Gymly Realtime.
 * Use from debugger or future dev screen.
 */

import {create} from 'zustand';

type RealtimeHealthState = {
  hubChannelName: string | null;
  hubStatus: string | null;
  hubLastError: string | null;
  lastEventAt: number | null;
  lastEventLabel: string | null;
  activeSubscriptionCount: number;
  setHubMeta: (name: string | null, status: string | null, err?: string | null) => void;
  recordEvent: (label: string) => void;
  setActiveCount: (n: number) => void;
  reset: () => void;
};

export const useRealtimeHealthStore = create<RealtimeHealthState>(set => ({
  hubChannelName: null,
  hubStatus: null,
  hubLastError: null,
  lastEventAt: null,
  lastEventLabel: null,
  activeSubscriptionCount: 0,

  setHubMeta: (name, status, err) =>
    set({
      hubChannelName: name,
      hubStatus: status,
      hubLastError: err ?? null,
    }),

  recordEvent: label =>
    set({
      lastEventAt: Date.now(),
      lastEventLabel: label,
    }),

  setActiveCount: n => set({activeSubscriptionCount: n}),

  reset: () =>
    set({
      hubChannelName: null,
      hubStatus: null,
      hubLastError: null,
      lastEventAt: null,
      lastEventLabel: null,
      activeSubscriptionCount: 0,
    }),
}));

/** Call from dev menu / console */
export function logRealtimeHealthSummary(): void {
  if (!__DEV__) {
    return;
  }
  const s = useRealtimeHealthStore.getState();
  console.log('[Realtime][health]', {
    hub: s.hubChannelName,
    status: s.hubStatus,
    lastError: s.hubLastError,
    lastEventAt: s.lastEventAt,
    lastEvent: s.lastEventLabel,
    activeSubs: s.activeSubscriptionCount,
  });
}
