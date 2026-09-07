import React from 'react';
import {useBadgeStore} from '@/store/badgeStore';
import {BadgeUnlockModal} from './BadgeUnlockModal';

/**
 * Root-level host — viser unlock-kø én badge ad gangen.
 * Server-awarded celebrations are marked consumed only after Modal onShow.
 */
export function BadgeUnlockModalHost() {
  const current = useBadgeStore(s => s.unlockModalQueue[0]);
  const dismiss = useBadgeStore(s => s.dismissUnlockModal);

  return (
    <BadgeUnlockModal
      visible={current != null}
      badge={current ?? null}
      onDismiss={dismiss}
      onDisplayed={badgeId => {
        const def = current;
        if (!def || def.id !== badgeId) {
          return;
        }
        if (def.requirement_type !== 'manual_server') {
          return;
        }
        void import('@/services/referral/serverBadgeUnlockModal').then(m =>
          m.markServerBadgeUnlockModalDisplayed(badgeId),
        );
      }}
    />
  );
}
