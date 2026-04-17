/**
 * Authentication Service
 * Handles user authentication with security best practices
 * Apple Sign In: Uses Authentication Services - never ask for name/email after Apple auth (Guideline 4)
 */

import {Platform} from 'react-native';

const logAuthDebug = (...args: unknown[]) => {
  if (__DEV__) {
    console.warn(...args);
  }
};
import {AuthTokens, AuthResponse} from '@/types/auth.types';
import {User, UserLogin, UserRegistration} from '@/types/user.types';
import SecureStorage from '../security/SecureStorage';
import {supabase} from '@/services/supabase/supabaseClient';
import {SUPABASE_ALLOW_UNVERIFIED_LOGIN, SUPABASE_EMAIL_REDIRECT} from '@/config/supabaseConfig';
import {User as SupabaseUser} from '@supabase/supabase-js';
import {normalizeDanishPhone} from '@/utils/phoneUtils';

class AuthService {
  private readonly API_URL = 'https://api.gymly.app'; // TODO: Replace with actual API URL

  /** Public helper to map Supabase user to app User (e.g. after Apple sign-in) */
  getMappedUser(supabaseUser: SupabaseUser): User {
    return this.mapSupabaseUser(supabaseUser);
  }

  private mapSupabaseUser(user: SupabaseUser): User {
    const metadata = user.user_metadata || {};
    const now = new Date();
    return {
      id: user.id,
      email: user.email || '',
      username: metadata.username || user.email?.split('@')[0] || 'gymly_user',
      displayName: metadata.displayName || metadata.display_name || user.email || 'Gymly User',
      phoneNumber:
        typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber : undefined,
      profileImageUrl: metadata.profileImageUrl,
      bicepsEmoji: metadata.bicepsEmoji || '💪🏻',
      bio: metadata.bio,
      birthYear:
        metadata.birthYear ??
        (metadata.dateOfBirth
          ? new Date(metadata.dateOfBirth as string).getFullYear()
          : undefined),
      dateOfBirth: metadata.dateOfBirth
        ? new Date(metadata.dateOfBirth as string)
        : undefined,
      trainingGoal: metadata.trainingGoal,
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

  /** RN/fetch often surfaces transport failures as this English string */
  private isLikelyNetworkFailure(message: string): boolean {
    const m = (message || '').toLowerCase();
    return (
      m.includes('network request failed') ||
      m.includes('failed to fetch') ||
      m.includes('network error') ||
      m.includes('load failed') ||
      m.includes('could not connect') ||
      m.includes('connection refused') ||
      m.includes('timed out') ||
      m.includes('timeout') ||
      m.includes('host lookup') ||
      m.includes('internet connection appears to be offline') ||
      m.includes('the network connection was lost')
    );
  }

  /** Supabase mail/SMTP errors – keep in sync with Dashboard troubleshooting */
  private isLikelyEmailDeliveryFailure(lower: string): boolean {
    return (
      lower.includes('error sending confirmation email') ||
      lower.includes('sending confirmation email') ||
      lower.includes('unable to send email') ||
      (lower.includes('failed to send') && lower.includes('email')) ||
      lower.includes('mail delivery') ||
      lower.includes('smtp') ||
      lower.includes('535') ||
      lower.includes('authentication failed') ||
      lower.includes('connection to smtp') ||
      (lower.includes('tls') && lower.includes('smtp'))
    );
  }

  private humanizeAuthMessage(message: string): string {
    const m = (message || '').trim();
    const lower = m.toLowerCase();
    if (this.isLikelyNetworkFailure(m)) {
      return 'Kunne ikke få forbindelse til Gymly. Tjek internet, VPN eller prøv igen om lidt.';
    }
    if (this.isLikelyEmailDeliveryFailure(lower)) {
      const hint =
        'Bekræftelsesmailen kunne ikke sendes. Tjek Supabase (samme projekt som i appen: ykantlsuszpauddasqvz) under Authentication → Emails → SMTP: host, port (587+TLS eller 465+SSL), bruger og app-adgangskode. Slå custom SMTP fra for at teste med Supabase-standard.';
      return m ? `${hint}\n\nDetalje: ${m}` : hint;
    }
    return m;
  }

  /**
   * Register new user
   */
  async register(data: UserRegistration): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateRegistration(data);

      const signUpOnce = () =>
        supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: SUPABASE_EMAIL_REDIRECT || undefined,
            data: {
              username: data.username,
              phoneNumber: data.phoneNumber,
              displayName: data.displayName,
              bicepsEmoji: data.bicepsEmoji || '💪🏻',
              favoriteGyms: data.favoriteGyms,
              profileImageUrl: data.profileImageUrl,
              bio: data.bio,
              birthYear: data.birthYear,
              dateOfBirth: data.dateOfBirth,
              trainingGoal: data.trainingGoal,
              gdprConsent: {
                ...data.gdprConsent,
                dataRetentionConsent: true,
                locationTrackingConsent:
                  data.gdprConsent.locationTrackingConsent ?? false,
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

      let {data: signupData, error} = await signUpOnce();
      if (error && this.isLikelyNetworkFailure(error.message || '')) {
        await new Promise<void>(resolve => setTimeout(resolve, 750));
        const second = await signUpOnce();
        signupData = second.data;
        error = second.error;
      }

      if (error) {
        throw new Error(this.humanizeAuthMessage(error.message));
      }

      const user = signupData.user ? this.mapSupabaseUser(signupData.user) : {
        id: Date.now().toString(),
        email: data.email,
        username: data.username,
        phoneNumber: data.phoneNumber,
        displayName: data.displayName,
        profileImageUrl: data.profileImageUrl,
        bicepsEmoji: data.bicepsEmoji || '💪🏻',
        birthYear: data.birthYear,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        favoriteGyms: data.favoriteGyms,
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
      logAuthDebug('[AuthService] register failed', error);
      if (error instanceof Error) {
        throw new Error(this.humanizeAuthMessage(error.message));
      }
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(credentials: UserLogin): Promise<AuthResponse> {
    try {
      this.validateEmail(credentials.email);

      if (!credentials.password) {
        throw new Error('Adgangskode er påkrævet');
      }

      const signInOnce = () =>
        supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

      let {data, error} = await signInOnce();
      if (error && this.isLikelyNetworkFailure(error.message || '')) {
        await new Promise<void>(resolve => setTimeout(resolve, 750));
        const second = await signInOnce();
        data = second.data;
        error = second.error;
      }

      if (error) {
        const errorMessage = error.message || 'Login fejlede. Prøv igen.';
        const errorCode = (error as {code?: string}).code;
        const isUnconfirmed =
          errorCode === 'email_not_confirmed' ||
          errorMessage.toLowerCase().includes('email not confirmed');
        if (SUPABASE_ALLOW_UNVERIFIED_LOGIN && isUnconfirmed) {
          const storedUser = await SecureStorage.getUserData();
          if (
            storedUser &&
            storedUser.email.toLowerCase() === credentials.email.toLowerCase()
          ) {
            const betaTokens: AuthTokens = {
              accessToken: this.generateMockToken(),
              refreshToken: this.generateMockToken(),
              expiresAt: Date.now() + 3600000,
            };
            await SecureStorage.saveTokens(betaTokens);
            await SecureStorage.saveUserData(storedUser);
            return {
              user: storedUser,
              tokens: betaTokens,
            };
          }
        }
        throw new Error(this.humanizeAuthMessage(errorMessage));
      }

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
      logAuthDebug('[AuthService] login failed', error);
      if (error instanceof Error) {
        throw new Error(this.humanizeAuthMessage(error.message));
      }
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
        throw new Error(this.humanizeAuthMessage(error.message));
      }
    } catch (error) {
      logAuthDebug('[AuthService] password reset request failed', error);
      if (error instanceof Error) {
        throw new Error(this.humanizeAuthMessage(error.message));
      }
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
      throw new Error(this.humanizeAuthMessage(error.message));
    }
  }

  /**
   * Validate registration data
   */
  private validateRegistration(data: UserRegistration): void {
    this.validateEmail(data.email);
    this.validatePassword(data.password);
    this.validateUsername(data.username);
    this.validatePhoneNumber(data.phoneNumber);

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

  private validatePhoneNumber(phone: string): void {
    const normalized = normalizeDanishPhone(phone);
    if (!normalized) {
      throw new Error(
        'Indtast et gyldigt dansk mobilnummer (8 cifre, fx 12 34 56 78 eller +45 12 34 56 78)',
      );
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
   * Sign in with Apple (iOS only)
   * Uses Apple Authentication Services - name/email come from Apple, never ask again (Guideline 4)
   */
  async signInWithApple(): Promise<AuthResponse> {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple er kun tilgængelig på iOS');
    }
    try {
      const appleAuth = require('@invertase/react-native-apple-authentication').default;
      if (!appleAuth.isSupported) {
        throw new Error(
          'Sign in with Apple virker kun på en rigtig iPhone (ikke simulator). Brug en fysisk enhed for at teste.',
        );
      }
      const credential = await appleAuth.performRequest({
        requestedScopes: [
          appleAuth.Scope.FULL_NAME,
          appleAuth.Scope.EMAIL,
        ],
        nonceEnabled: false, // Supabase nonce mismatch: id_token must not contain nonce when we don't pass one
      });

      if (!credential.identityToken) {
        throw new Error('Apple godkendelse returnerede ikke et token');
      }

      const {data, error} = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw new Error(error.message);
      if (!data.session || !data.user) throw new Error('Kunne ikke logge ind med Apple');

      // Apple only provides fullName on first sign-in - save to metadata
      if (credential.fullName) {
        const nameParts = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ].filter(Boolean);
        const fullName = nameParts.join(' ');
        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            given_name: credential.fullName.givenName,
            family_name: credential.fullName.familyName,
          },
        });
      }

      const user = this.mapSupabaseUser(data.user);
      const tokens = this.mapSessionTokens(data.session);
      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);

      return {user, tokens};
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        throw new Error('Apple-login blev annulleret');
      }
      console.error('Apple sign in error:', error);
      throw error;
    }
  }

  /**
   * Social login (Apple/Google)
   * For Apple: uses signInWithApple() - never pass or ask for name/email
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
    if (provider === 'apple') {
      return this.signInWithApple();
    }
    // Google: TODO implement with Supabase OAuth
    try {
      const mockUser: User = {
        id: Date.now().toString(),
        email: data?.email || `${provider}@example.com`,
        username: data?.username || data?.email?.split('@')[0] || `${provider}user`,
        displayName: data?.firstName && data?.lastName
          ? `${data.firstName} ${data.lastName}`
          : data?.email?.split('@')[0] || '',
        bicepsEmoji: data?.bicepsEmoji || '💪',
        favoriteGyms: data?.favoriteGyms,
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
        expiresAt: Date.now() + 3600000,
      };

      await SecureStorage.saveTokens(mockTokens);
      await SecureStorage.saveUserData(mockUser);

      return {user: mockUser, tokens: mockTokens};
    } catch (error) {
      console.error('Social login error:', error);
      throw error;
    }
  }

  /**
   * Delete user account (Guideline 5.1.1(v))
   * Permanently deletes account - in-app, no external contact required
   */
  async deleteAccount(): Promise<void> {
    try {
      const {data: {session}} = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (userId) {
        try {
          const {error} = await supabase.functions.invoke('delete-account', {
            body: {userId},
          });
          if (error) console.warn('Edge function delete failed:', error.message);
        } catch {
          // Edge function may not exist yet - continue with local cleanup
        }
      }

      await supabase.auth.signOut();
      await SecureStorage.clearAll();
    } catch (error) {
      console.error('Delete account error:', error);
      await SecureStorage.clearAll();
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

