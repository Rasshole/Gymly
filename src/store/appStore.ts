/**
 * App State Store
 * Global application state management using Zustand
 */

import {create} from 'zustand';
import {User} from '@/types/user.types';
import {AuthTokens} from '@/types/auth.types';
import SecureStorage from '@/services/security/SecureStorage';
import AuthService from '@/services/auth/AuthService';

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
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  setFavoriteGyms: (gymIds: number[]) => void; // Set top 3 favorite gyms
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
        const user = await SecureStorage.getUserData();
        
        if (user) {
          set({
            isAuthenticated: true,
            user,
            tokens,
            isLoading: false,
          });
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
  },

  /**
   * Logout user
   */
  logout: async () => {
    try {
      await AuthService.logout();
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
   * Update user data
   */
  setUser: (user: User) => {
    set({user});
    SecureStorage.saveUserData(user);
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
  setFavoriteGyms: (gymIds: number[]) => {
    const state = get();
    if (state.user) {
      const updatedUser = {
        ...state.user,
        favoriteGyms: gymIds.slice(0, 3), // Max 3 gyms
        updatedAt: new Date(),
      };
      set({user: updatedUser});
      SecureStorage.saveUserData(updatedUser);
    }
  },
}));

