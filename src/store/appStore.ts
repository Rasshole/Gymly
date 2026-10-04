/**
 * App State Store
 * Global application state management using Zustand
 */

import {create} from 'zustand';
import {User} from '@/types/user.types';
import {AuthTokens} from '@/types/auth.types';
import SecureStorage from '@/services/security/SecureStorage';
import AuthService from '@/services/auth/AuthService';
import {supabase} from '@/services/supabase/supabaseClient';
import {mergeProfileUsernameIntoUser, upsertMyProfile} from '@/services/supabase/friendService';
import {useBadgeStore} from '@/store/badgeStore';
import {useTrainingStatsStore} from '@/store/trainingStatsStore';
import {completeWorkoutSession} from '@/services/session/completeWorkoutSession';
import {
  fetchUserHomeGymIds,
  syncUserHomeGymsAfterSave,
} from '@/services/supabase/homeGymsService';
import {
  clearAllUserStores,
  clearLocalUserSession,
  resetNavigationToLogin,
} from '@/services/auth/sessionCleanup';
import {isPasswordRecoveryActive} from '@/services/auth/authDeepLink';
import {getOnboardingStateFromMetadata} from '@/services/onboarding/onboardingState';
import {safeDisplayName} from '@/utils/displayName';

function syncPublicProfileToSupabase(user: User) {
  upsertMyProfile(user).catch(err => {
    if (__DEV__) {
      console.warn('[appStore] upsertMyProfile', err);
    }
  });
}

interface AppState {
  // Authentication state
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  /** null while unknown / loading; drives RootNavigator onboarding gate */
  onboardingComplete: boolean | null;

  // Actions
  initialize: () => Promise<void>;
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  setUser: (user: User, options?: {skipProfileSync?: boolean}) => void;
  setLoading: (loading: boolean) => void;
  setFavoriteGyms: (gymIds: string[]) => void;
  refreshOnboardingState: () => Promise<void>;
  markOnboardingComplete: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  tokens: null,
  /** true indtil første `initialize()` — undgår ét frame med forkert stack (kan give tom/hvid UI). */
  isLoading: true,
  onboardingComplete: null,

  /**
   * Initialize app - check for existing session
   */
  initialize: async () => {
    set({isLoading: true, onboardingComplete: null});

    try {
      // Source of truth: Supabase persisted session (AsyncStorage).
      const {
        data: {session},
      } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('getSession timed out')),
            10000,
          );
        }),
      ]);

      if (
        session?.user &&
        session.access_token &&
        session.refresh_token &&
        !isPasswordRecoveryActive()
      ) {
        const fromAuth = AuthService.getMappedUser(session.user);
        const storedUser = await SecureStorage.getUserData();
        /** SecureStorage har seneste “Rediger profil”-data; JWT-metadata kan være bagud. */
        let mergedUser: User = storedUser
          ? {
              ...fromAuth,
              ...storedUser,
              id: fromAuth.id,
              email: fromAuth.email || storedUser.email,
            }
          : fromAuth;
        mergedUser = await withTimeout(
          mergeProfileUsernameIntoUser(mergedUser),
          8000,
          'mergeProfileUsername',
        ).catch(() => mergedUser);
        try {
          const centerIds = await withTimeout(
            fetchUserHomeGymIds(
              mergedUser.id,
              mergedUser.favoriteGyms ?? storedUser?.favoriteGyms,
            ),
            8000,
            'fetchUserHomeGymIds',
          );
          if (centerIds.length > 0) {
            mergedUser = {
              ...mergedUser,
              favoriteGyms: centerIds,
              updatedAt: new Date(),
            };
          }
        } catch {
          /* keep stored favoriteGyms */
        }
        const tokens: AuthTokens = {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt:
            (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
        };

        await withTimeout(
          SecureStorage.saveTokens(tokens),
          4000,
          'saveTokens',
        ).catch(() => {});
        await withTimeout(
          SecureStorage.saveUserData(mergedUser),
          4000,
          'saveUserData',
        ).catch(() => {});

        const onboarding = await withTimeout(
          getOnboardingStateFromMetadata(
            mergedUser,
            session.user.user_metadata as Record<string, unknown> | undefined,
          ),
          8000,
          'onboarding state',
        ).catch(() => ({status: 'INCOMPLETE' as const}));

        set({
          isAuthenticated: true,
          user: mergedUser,
          tokens,
          isLoading: false,
          onboardingComplete: onboarding.status === 'COMPLETE',
        });

        useBadgeStore
          .getState()
          .hydrate()
          .then(() => {
            useBadgeStore
              .getState()
              .syncBadgesForUser(
                mergedUser.id,
                safeDisplayName(mergedUser.displayName),
              );
          })
          .catch(() => {});
        void useTrainingStatsStore
          .getState()
          .hydrate()
          .then(() => useTrainingStatsStore.getState().load(mergedUser.id))
          .catch(() => {});
        syncPublicProfileToSupabase(mergedUser);
        return;
      }

      if (session?.user && isPasswordRecoveryActive()) {
        set({isLoading: false, onboardingComplete: null});
        return;
      }

      // No Supabase session — never restore from Keychain/AsyncStorage alone (ghost login).
      clearAllUserStores();
      void SecureStorage.clearAll().catch(() => {});
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
        onboardingComplete: null,
      });
    } catch (error) {
      console.error('Initialization error:', error);
      clearAllUserStores();
      void SecureStorage.clearAll().catch(() => {});
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
        onboardingComplete: null,
      });
    }
  },

  /**
   * Login user
   */
  login: (user: User, tokens: AuthTokens) => {
    set({
      isAuthenticated: true,
      user,
      tokens,
      onboardingComplete: null,
    });
    SecureStorage.saveTokens(tokens).catch(err => {
      if (__DEV__) {
        console.warn('[appStore] saveTokens', err);
      }
    });
    SecureStorage.saveUserData(user).catch(err => {
      if (__DEV__) {
        console.warn('[appStore] saveUserData', err);
      }
    });
    useBadgeStore
      .getState()
      .hydrate()
      .then(() => {
        useBadgeStore
          .getState()
          .syncBadgesForUser(
            user.id,
            safeDisplayName(user.displayName),
          );
      })
      .catch(() => {});
    void useTrainingStatsStore
      .getState()
      .hydrate()
      .then(() => useTrainingStatsStore.getState().load(user.id))
      .catch(() => {});
    syncPublicProfileToSupabase(user);
    void get().refreshOnboardingState();
  },

  refreshOnboardingState: async () => {
    const user = get().user;
    if (!user) {
      set({onboardingComplete: null});
      return;
    }
    try {
      const {
        data: {user: authUser},
      } = await supabase.auth.getUser();
      const onboarding = await getOnboardingStateFromMetadata(
        user,
        authUser?.user_metadata as Record<string, unknown> | undefined,
      );
      set({onboardingComplete: onboarding.status === 'COMPLETE'});
    } catch {
      set({onboardingComplete: false});
    }
  },

  markOnboardingComplete: () => {
    set({onboardingComplete: true});
  },

  /**
   * Logout user
   */
  logout: async () => {
    const currentUserId = get().user?.id ?? null;
    try {
      if (currentUserId) {
        await completeWorkoutSession({
          reason: 'logout',
          userId: currentUserId,
        });
      }
      await AuthService.logout();
    } catch (error) {
      console.error('Logout error:', error);
      await SecureStorage.clearAll().catch(() => {});
      await supabase.auth.signOut().catch(() => {});
    } finally {
      clearAllUserStores(currentUserId);
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        onboardingComplete: null,
      });
      resetNavigationToLogin();
    }
  },

  /**
   * Delete account permanently (Guideline 5.1.1(v))
   */
  deleteAccount: async () => {
    const currentUserId = get().user?.id ?? null;
    try {
      if (currentUserId) {
        await completeWorkoutSession({
          reason: 'logout',
          userId: currentUserId,
        });
      }
      await AuthService.deleteAccount();
    } catch (error) {
      console.error('Delete account error:', error);
      await SecureStorage.clearAll().catch(() => {});
      await supabase.auth.signOut().catch(() => {});
    } finally {
      clearLocalUserSession({
        previousUserId: currentUserId,
        navigate: true,
      });
      set({onboardingComplete: null});
    }
  },

  /**
   * Update user data
   */
  setUser: (user: User, options?: {skipProfileSync?: boolean}) => {
    set({user});
    SecureStorage.saveUserData(user);
    if (!options?.skipProfileSync) {
      syncPublicProfileToSupabase(user);
    }
  },

  /**
   * Set loading state
   */
  setLoading: (loading: boolean) => {
    set({isLoading: loading});
  },

  /**
   * Set favorite gyms (top 3)
   */
  setFavoriteGyms: (gymIds: string[]) => {
    const state = get();
    if (!state.user?.id) {
      return;
    }
    const userId = state.user.id;
    void syncUserHomeGymsAfterSave(userId, gymIds)
      .then(({user: updatedUser}) => {
        if (updatedUser?.id === userId) {
          set({user: updatedUser});
        }
      })
      .catch(err => {
        if (__DEV__) {
          console.warn('[appStore] setFavoriteGyms', err);
        }
      });
  },
}));

