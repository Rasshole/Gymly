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

function syncPublicProfileToSupabase(user: User) {
  void upsertMyProfile(user).catch(err => {
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
      // Check if tokens exist and are valid
      const tokens = await SecureStorage.getTokens();
      const isValid = await SecureStorage.areTokensValid();
      
      if (tokens && isValid) {
        let user = await SecureStorage.getUserData();
        
        if (user) {
          const dn = (user.displayName || '').trim().toLowerCase();
          const isGenericName =
            !dn ||
            dn === 'user' ||
            dn.includes('google user') ||
            dn.includes('gymly user');
          if (isGenericName) {
            user = {...user, displayName: ''};
            await SecureStorage.saveUserData(user);
          }
          try {
            const {
              data: {session},
            } = await supabase.auth.getSession();
            if (session?.user) {
              const fromAuth = AuthService.getMappedUser(session.user);
              const metaGyms = fromAuth.favoriteGyms;
              const localGyms = user.favoriteGyms;
              if (
                Array.isArray(metaGyms) &&
                metaGyms.length > 0 &&
                (!Array.isArray(localGyms) || localGyms.length === 0)
              ) {
                user = {...user, favoriteGyms: metaGyms};
                await SecureStorage.saveUserData(user);
              }
            }
          } catch {
            // session merge er best-effort
          }
          set({
            isAuthenticated: true,
            user,
            tokens,
            isLoading: false,
          });
          syncPublicProfileToSupabase(user);
          return;
        }
      }
      
      // No valid session found
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

