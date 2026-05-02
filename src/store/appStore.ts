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
import {upsertMyProfile} from '@/services/supabase/friendService';
import {useFriendStore} from '@/store/friendStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useSessionStore} from '@/store/sessionStore';
import {useBadgeStore} from '@/store/badgeStore';

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

  // Actions
  initialize: () => Promise<void>;
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  setFavoriteGyms: (gymIds: string[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  tokens: null,
  isLoading: false,

  /**
   * Initialize app - check for existing session
   */
  initialize: async () => {
    set({isLoading: true});

    try {
      // Source of truth: Supabase persisted session (AsyncStorage).
      const {
        data: {session},
      } = await supabase.auth.getSession();

      if (session?.user && session.access_token && session.refresh_token) {
        const fromAuth = AuthService.getMappedUser(session.user);
        const storedUser = await SecureStorage.getUserData();
        const mergedUser = (() => {
          if (!storedUser) {
            return fromAuth;
          }
          const fallbackDisplayName =
            (storedUser.displayName || '').trim().length > 0
              ? storedUser.displayName
              : fromAuth.displayName;
          const fallbackGyms =
            Array.isArray(storedUser.favoriteGyms) &&
            storedUser.favoriteGyms.length > 0
              ? storedUser.favoriteGyms
              : fromAuth.favoriteGyms;
          return {
            ...fromAuth,
            displayName: fallbackDisplayName,
            favoriteGyms: fallbackGyms,
          };
        })();
        const tokens: AuthTokens = {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt:
            (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
        };

        await SecureStorage.saveTokens(tokens);
        await SecureStorage.saveUserData(mergedUser);

        set({
          isAuthenticated: true,
          user: mergedUser,
          tokens,
          isLoading: false,
        });

        useBadgeStore
          .getState()
          .hydrate()
          .then(() => {
            useBadgeStore
              .getState()
              .syncBadgesForUser(
                mergedUser.id,
                (mergedUser.displayName || '').trim() || 'Bruger',
              );
          })
          .catch(() => {});
        syncPublicProfileToSupabase(mergedUser);
        return;
      }

      // Fallback for legacy local token storage when session restore fails.
      const tokens = await SecureStorage.getTokens();
      const isValid = await SecureStorage.areTokensValid();
      const user = await SecureStorage.getUserData();
      if (tokens && isValid && user) {
        set({
          isAuthenticated: true,
          user,
          tokens,
          isLoading: false,
        });
        return;
      }

      // No valid session found.
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
      });
    } catch (error) {
      console.error('Initialization error:', error);
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
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
    });
    useBadgeStore
      .getState()
      .hydrate()
      .then(() => {
        useBadgeStore
          .getState()
          .syncBadgesForUser(
            user.id,
            (user.displayName || '').trim() || 'Bruger',
          );
      })
      .catch(() => {});
    syncPublicProfileToSupabase(user);
  },

  /**
   * Logout user
   */
  logout: async () => {
    try {
      await AuthService.logout();
      useSessionStore.getState().endSession();
      useFriendStore.getState().reset();
      useInAppNotificationStore.getState().reset();
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  /**
   * Delete account permanently (Guideline 5.1.1(v))
   */
  deleteAccount: async () => {
    try {
      await AuthService.deleteAccount();
      useSessionStore.getState().endSession();
      useFriendStore.getState().reset();
      useInAppNotificationStore.getState().reset();
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
      });
    } catch (error) {
      console.error('Delete account error:', error);
      useSessionStore.getState().endSession();
      useFriendStore.getState().reset();
      useInAppNotificationStore.getState().reset();
      set({
        isAuthenticated: false,
        user: null,
        tokens: null,
      });
    }
  },

  /**
   * Update user data
   */
  setUser: (user: User) => {
    set({user});
    SecureStorage.saveUserData(user);
    syncPublicProfileToSupabase(user);
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
    if (state.user) {
      const updatedUser = {
        ...state.user,
        favoriteGyms: gymIds.slice(0, 3), // Max 3 gyms
        updatedAt: new Date(),
      };
      set({user: updatedUser});
      SecureStorage.saveUserData(updatedUser);
      syncPublicProfileToSupabase(updatedUser);
    }
  },
}));

