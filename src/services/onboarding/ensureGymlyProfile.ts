/**
 * Idempotent Gymly profile bootstrap after auth session exists.
 * Never overwrites established displayName/username/avatar with provider data.
 */

import type {User} from '@/types/user.types';
import {supabase} from '@/services/supabase/supabaseClient';
import {upsertMyProfile} from '@/services/supabase/friendService';
import {fetchUserHomeGymIds} from '@/services/supabase/homeGymsService';
import {
  hasUsableDisplayName,
  hasUsableUsername,
} from '@/services/onboarding/onboardingState';
import {
  firstUsableDisplayName,
  isUsablePublicDisplayName,
} from '@/utils/displayName';

export type ProviderProfileHint = {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  /** Only applied when profiles.avatar_url is empty */
  avatarUrl?: string;
};

/**
 * Ensure a profiles row exists for the auth user without duplicating rows.
 * Provider hints apply only when Gymly profile fields are still unset.
 */
export async function ensureGymlyProfile(
  user: User,
  hint?: ProviderProfileHint,
): Promise<User> {
  let next: User = {...user};

  const {data: existing} = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, favorite_gym_ids, username_requires_change')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) {
    if (existing.username) {
      next = {
        ...next,
        username: String(existing.username),
        usernameRequiresChange: existing.username_requires_change === true,
      };
    }
    const existingName = firstUsableDisplayName(
      typeof existing.display_name === 'string' ? existing.display_name : undefined,
    );
    if (existingName) {
      // Prefer stored Gymly profile name over auth/session mapping.
      next = {...next, displayName: existingName};
    } else if (!isUsablePublicDisplayName(next.displayName)) {
      // Drop email / invalid stored names so onboarding can collect a real name.
      next = {...next, displayName: ''};
    }
    if (existing.avatar_url && !next.profileImageUrl) {
      next = {...next, profileImageUrl: String(existing.avatar_url)};
    }
    if (Array.isArray(existing.favorite_gym_ids) && existing.favorite_gym_ids.length) {
      next = {
        ...next,
        favoriteGyms: existing.favorite_gym_ids.filter(
          (id: unknown): id is string => typeof id === 'string',
        ),
      };
    }
  } else {
    // First profile row — apply provider display name if we lack one.
    if (!hasUsableDisplayName(next) && hint?.displayName?.trim()) {
      const fromHint = firstUsableDisplayName(hint.displayName);
      if (fromHint) {
        next = {...next, displayName: fromHint};
      }
    } else if (
      !hasUsableDisplayName(next) &&
      (hint?.givenName || hint?.familyName)
    ) {
      const composed = firstUsableDisplayName(
        [hint.givenName, hint.familyName].filter(Boolean).join(' '),
      );
      if (composed) {
        next = {...next, displayName: composed};
      }
    }
    if (!isUsablePublicDisplayName(next.displayName)) {
      next = {...next, displayName: ''};
    }
    if (!next.profileImageUrl && hint?.avatarUrl) {
      next = {...next, profileImageUrl: hint.avatarUrl};
    }
  }

  // Upsert requires a username string; use a temporary unique placeholder only
  // for row creation — onboarding still requires a real Gymly username.
  if (!hasUsableUsername(next)) {
    const temp = `u_${user.id.replace(/-/g, '').slice(0, 14)}`;
    next = {
      ...next,
      username: temp,
      usernameRequiresChange: true,
    };
  }

  await upsertMyProfile(next);

  try {
    const gymIds = await fetchUserHomeGymIds(user.id, next.favoriteGyms);
    if (gymIds.length) {
      next = {...next, favoriteGyms: gymIds};
    }
  } catch {
    /* ignore */
  }

  return next;
}
