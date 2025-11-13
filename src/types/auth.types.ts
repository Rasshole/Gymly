/**
 * Authentication Types
 */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

import {User} from './user.types';

