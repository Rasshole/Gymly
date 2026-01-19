/**
 * Authentication Service
 * Handles user authentication with security best practices
 */

import {AuthTokens, AuthResponse} from '@/types/auth.types';
import {User, UserLogin, UserRegistration} from '@/types/user.types';
import SecureStorage from '../security/SecureStorage';
import {API_URL, USE_MOCK_API} from '@/config/environment';

class AuthService {
  private readonly API_URL = API_URL;

  private mapSupabaseUser(user: SupabaseUser): User {
    const metadata = user.user_metadata || {};
    const now = new Date();
    return {
      id: user.id,
      email: user.email || '',
      username: metadata.username || user.email?.split('@')[0] || 'gymly_user',
      displayName: metadata.displayName || metadata.display_name || user.email || 'Gymly User',
      profileImageUrl: metadata.profileImageUrl,
      bicepsEmoji: metadata.bicepsEmoji || '💪🏻',
      favoriteGyms: metadata.favoriteGyms,
      privacySettings: metadata.privacySettings || {
        profileVisibility: 'friends',
        locationSharingEnabled: true,
        showWorkoutHistory: true,
        allowFriendRequests: true,
        showOnlineStatus: true,
      },
      gdprConsent: metadata.gdprConsent || {
        privacyPolicyAccepted: true,
        termsOfServiceAccepted: true,
        dataRetentionConsent: true,
        marketingConsent: false,
        analyticsConsent: false,
        locationTrackingConsent: false,
        consentDate: now,
        privacyPolicyVersion: '1.0.0',
        termsOfServiceVersion: '1.0.0',
        consentHistory: [],
      },
      createdAt: user.created_at ? new Date(user.created_at) : now,
      updatedAt: now,
      lastLoginAt: now,
    };
  }

  private mapSessionTokens(session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  }): AuthTokens {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    };
  }

  /**
   * Register new user
   */
  async register(data: UserRegistration): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateRegistration(data);

      const {data: signupData, error} = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: SUPABASE_EMAIL_REDIRECT || undefined,
          data: {
            username: data.username,
            displayName: data.displayName,
            bicepsEmoji: data.bicepsEmoji || '💪🏻',
            favoriteGyms: data.favoriteGyms,
            profileImageUrl: data.profileImageUrl,
            gdprConsent: {
              ...data.gdprConsent,
              dataRetentionConsent: true,
              locationTrackingConsent: false,
              consentDate: new Date().toISOString(),
              privacyPolicyVersion: '1.0.0',
              termsOfServiceVersion: '1.0.0',
              consentHistory: [],
            },
            privacySettings: {
              profileVisibility: 'friends',
              locationSharingEnabled: true,
              showWorkoutHistory: true,
              allowFriendRequests: true,
              showOnlineStatus: true,
            },
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      const user = signupData.user ? this.mapSupabaseUser(signupData.user) : {
        id: Date.now().toString(),
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        profileImageUrl: data.profileImageUrl,
        bicepsEmoji: data.bicepsEmoji || '💪🏻',
        favoriteGyms: data.favoriteGyms,
        privacySettings: {
          profileVisibility: 'everyone',
          locationSharingEnabled: true,
          showWorkoutHistory: true,
          allowFriendRequests: true,
          showOnlineStatus: true,
        },
        gdprConsent: {
          privacyPolicyAccepted: data.gdprConsent.privacyPolicyAccepted,
          termsOfServiceAccepted: data.gdprConsent.termsOfServiceAccepted,
          dataRetentionConsent: true,
          marketingConsent: data.gdprConsent.marketingConsent,
          analyticsConsent: data.gdprConsent.analyticsConsent,
          locationTrackingConsent: false,
          consentDate: new Date(),
          privacyPolicyVersion: '1.0.0',
          termsOfServiceVersion: '1.0.0',
          consentHistory: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (!signupData.session) {
        await SecureStorage.saveUserData(user);
        return {
          user,
          tokens: undefined,
          needsEmailConfirmation: true,
        };
      }

      const tokens = this.mapSessionTokens(signupData.session);
      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);

      return {
        user,
        tokens,
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(credentials: UserLogin): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateEmail(credentials.email);
      
      if (!credentials.password) {
        throw new Error('Adgangskode er påkrævet');
      }

      const {data, error} = await supabase.auth.signInWithPassword({
        email: credentials.email,
        username: 'testuser',
        displayName: 'Test Bruger',
        privacySettings: {
          profileVisibility: 'everyone',
          locationSharingEnabled: true,
          showWorkoutHistory: true,
          allowFriendRequests: true,
          showOnlineStatus: true,
        },
        gdprConsent: {
          privacyPolicyAccepted: true,
          termsOfServiceAccepted: true,
          dataRetentionConsent: true,
          marketingConsent: false,
          analyticsConsent: false,
          locationTrackingConsent: false,
          consentDate: new Date(),
          privacyPolicyVersion: '1.0.0',
          termsOfServiceVersion: '1.0.0',
          consentHistory: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      };

      if (!data.session || !data.user) {
        throw new Error('Login fejlede. Prøv igen.');
      }

      const user = this.mapSupabaseUser(data.user);
      const tokens = this.mapSessionTokens(data.session);

      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);

      return {
        user,
        tokens,
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
      await SecureStorage.clearAll();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<AuthTokens> {
    try {
      const tokens = await SecureStorage.getTokens();
      if (!tokens) {
        throw new Error('No refresh token available');
      }

      // TODO: Implement API call to refresh token
      const newTokens: AuthTokens = {
        accessToken: this.generateMockToken(),
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + 3600000,
      };

      await SecureStorage.saveTokens(newTokens);
      return newTokens;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      this.validateEmail(email);
      const {error} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: SUPABASE_EMAIL_REDIRECT || undefined,
      });
      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      throw error;
    }
  }

  async resendEmailConfirmation(email: string): Promise<void> {
    const {error} = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: SUPABASE_EMAIL_REDIRECT || undefined,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Validate registration data
   */
  private validateRegistration(data: UserRegistration): void {
    this.validateEmail(data.email);
    this.validatePassword(data.password);
    this.validateUsername(data.username);
    
    if (!data.displayName || data.displayName.length < 2) {
      throw new Error('Navn skal være mindst 2 tegn');
    }

    if (!data.gdprConsent.privacyPolicyAccepted) {
      throw new Error('Du skal acceptere privatlivspolitikken');
    }

    if (!data.gdprConsent.termsOfServiceAccepted) {
      throw new Error('Du skal acceptere servicevilkårene');
    }
  }

  /**
   * Validate email
   */
  private validateEmail(email: string): void {
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(email)) {
      throw new Error('Ugyldig email adresse');
    }
  }

  /**
   * Validate password
   */
  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Adgangskoden skal være mindst 8 tegn');
    }

    if (!/[A-Z]/.test(password)) {
      throw new Error('Adgangskoden skal indeholde mindst ét stort bogstav');
    }

    if (!/[a-z]/.test(password)) {
      throw new Error('Adgangskoden skal indeholde mindst ét lille bogstav');
    }

    if (!/[0-9]/.test(password)) {
      throw new Error('Adgangskoden skal indeholde mindst ét tal');
    }
  }

  /**
   * Validate username
   */
  private validateUsername(username: string): void {
    if (username.length < 3) {
      throw new Error('Brugernavn skal være mindst 3 tegn');
    }

    if (username.length > 20) {
      throw new Error('Brugernavn må højst være 20 tegn');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Brugernavn må kun indeholde bogstaver, tal og underscore');
    }
  }

  /**
   * Social login (Apple/Google)
   */
  async socialLogin(
    provider: 'apple' | 'google',
    data?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      username?: string;
      bicepsEmoji?: string;
      favoriteGyms?: number[];
    },
  ): Promise<AuthResponse> {
    try {
      // TODO: Implement actual API call for social login
      // For now, return mock data
      const mockUser: User = {
        id: Date.now().toString(),
        email: data?.email || `${provider}@example.com`,
        username: data?.username || data?.email?.split('@')[0] || `${provider}user`,
        displayName: data?.firstName && data?.lastName
          ? `${data.firstName} ${data.lastName}`
          : `${provider} User`,
        bicepsEmoji: data?.bicepsEmoji || '💪',
        favoriteGyms: data?.favoriteGyms, // Save favorite gyms from registration
        privacySettings: {
          profileVisibility: 'everyone',
          locationSharingEnabled: true,
          showWorkoutHistory: true,
          allowFriendRequests: true,
          showOnlineStatus: true,
        },
        gdprConsent: {
          privacyPolicyAccepted: true,
          termsOfServiceAccepted: true,
          dataRetentionConsent: true,
          marketingConsent: false,
          analyticsConsent: false,
          locationTrackingConsent: false,
          consentDate: new Date(),
          privacyPolicyVersion: '1.0.0',
          termsOfServiceVersion: '1.0.0',
          consentHistory: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      };

      const mockTokens: AuthTokens = {
        accessToken: this.generateMockToken(),
        refreshToken: this.generateMockToken(),
        expiresAt: Date.now() + 3600000, // 1 hour
      };

      // Save tokens securely
      await SecureStorage.saveTokens(mockTokens);
      await SecureStorage.saveUserData(mockUser);

      return {
        user: mockUser,
        tokens: mockTokens,
      };
    } catch (error) {
      console.error('Social login error:', error);
      throw error;
    }
  }

  /**
   * Generate mock token (for development)
   */
  private generateMockToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

export default new AuthService();

