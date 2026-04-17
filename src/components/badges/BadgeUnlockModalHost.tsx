import React from 'react';
import {useBadgeStore} from '@/store/badgeStore';
import {BadgeUnlockModal} from './BadgeUnlockModal';

/**
 * Root-level host — viser unlock-kø én badge ad gangen.
 */
export function BadgeUnlockModalHost() {
  const current = useBadgeStore(s => s.unlockModalQueue[0]);
  const dismiss = useBadgeStore(s => s.dismissUnlockModal);

  return (
    <BadgeUnlockModal
      visible={current != null}
      badge={current ?? null}
      onDismiss={dismiss}
    />
  );
}
