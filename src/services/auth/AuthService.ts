/**
 * Authentication Service
 * Handles user authentication with security best practices
 */

import {AuthTokens, AuthResponse} from '@/types/auth.types';
import {User, UserLogin, UserRegistration} from '@/types/user.types';
import SecureStorage from '../security/SecureStorage';

class AuthService {
  private readonly API_URL = 'https://api.gymly.app'; // TODO: Replace with actual API URL

  /**
   * Register new user
   */
  async register(data: UserRegistration): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateRegistration(data);

      // TODO: Implement actual API call
      // For now, return mock data
      const mockUser: User = {
        id: Date.now().toString(),
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        privacySettings: {
          profileVisibility: 'friends',
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

      // TODO: Implement actual API call
      // For now, return mock data
      const mockUser: User = {
        id: '1',
        email: credentials.email,
        username: 'testuser',
        displayName: 'Test Bruger',
        privacySettings: {
          profileVisibility: 'friends',
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
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // TODO: Implement API call to invalidate token on backend
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
      // TODO: Implement API call for password reset
      console.log('Password reset requested for:', email);
    } catch (error) {
      console.error('Password reset request error:', error);
      throw error;
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
   * Generate mock token (for development)
   */
  private generateMockToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

export default new AuthService();

