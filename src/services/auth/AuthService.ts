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
import {User, UserLogin, UserRegistration, type ConsentType} from '@/types/user.types';
import SecureStorage from '../security/SecureStorage';
import {supabase} from '@/services/supabase/supabaseClient';
import {getLocalDateString} from '@/utils/streakUtils';
import {SUPABASE_PASSWORD_RESET_REDIRECT} from '@/config/supabaseConfig';
import {User as SupabaseUser} from '@supabase/supabase-js';
import {assertPasswordPolicy} from '@/services/auth/passwordPolicy';
import {normalizeDanishPhone} from '@/utils/phoneUtils';
import {
  getUsernameFormatErrorDa,
  normalizeUsernameForStorage,
} from '@/utils/usernameRules';
import {isUsernameAvailableInSupabase} from '@/services/supabase/usernameAvailabilityService';
import {mergeProfileUsernameIntoUser} from '@/services/supabase/friendService';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';
import {fetchUserHomeGymIds} from '@/services/supabase/homeGymsService';
import {persistUserHomeGyms} from '@/services/supabase/userCentersService';
import {displayNameFromAuthMetadata, firstUsableDisplayName} from '@/utils/displayName';
import {recordMyAccountJourney} from '@/services/productJourney/productJourneyService';

class AuthService {
  private readonly API_URL = 'https://api.gymly.app'; // TODO: Replace with actual API URL

  /** Public helper to map Supabase user to app User (e.g. after Apple sign-in) */
  getMappedUser(supabaseUser: SupabaseUser): User {
    return this.mapSupabaseUser(supabaseUser);
  }

  private parseGdprFromMetadata(raw: unknown, fallbackDate: Date): User['gdprConsent'] {
    if (!raw || typeof raw !== 'object') {
      return {
        privacyPolicyAccepted: true,
        termsOfServiceAccepted: true,
        dataRetentionConsent: true,
        marketingConsent: false,
        analyticsConsent: false,
        locationTrackingConsent: false,
        consentDate: fallbackDate,
        privacyPolicyVersion: '1.0.0',
        termsOfServiceVersion: '1.0.0',
        consentHistory: [],
      };
    }
    const g = raw as Record<string, unknown>;
    const historyRaw = Array.isArray(g.consentHistory) ? g.consentHistory : [];
    return {
      privacyPolicyAccepted: Boolean(g.privacyPolicyAccepted),
      termsOfServiceAccepted: Boolean(g.termsOfServiceAccepted),
      dataRetentionConsent: Boolean(g.dataRetentionConsent),
      marketingConsent: Boolean(g.marketingConsent),
      analyticsConsent: Boolean(g.analyticsConsent),
      locationTrackingConsent: Boolean(g.locationTrackingConsent),
      consentDate: g.consentDate ? new Date(String(g.consentDate)) : fallbackDate,
      privacyPolicyVersion: String(g.privacyPolicyVersion ?? '1.0.0'),
      termsOfServiceVersion: String(g.termsOfServiceVersion ?? '1.0.0'),
      consentHistory: historyRaw.map((c: Record<string, unknown>) => ({
        id: String(c.id ?? ''),
        type: c.type as ConsentType,
        accepted: Boolean(c.accepted),
        version: String(c.version ?? ''),
        timestamp: c.timestamp ? new Date(String(c.timestamp)) : fallbackDate,
        ipAddress: typeof c.ipAddress === 'string' ? c.ipAddress : undefined,
      })),
    };
  }

  private serializeGdprConsentForMetadata(consent: User['gdprConsent']): Record<string, unknown> {
    return {
      ...consent,
      consentDate:
        consent.consentDate instanceof Date
          ? consent.consentDate.toISOString()
          : consent.consentDate,
      consentHistory: (consent.consentHistory ?? []).map(c => ({
        ...c,
        timestamp: c.timestamp instanceof Date ? c.timestamp.toISOString() : c.timestamp,
      })),
    };
  }

  private mapSupabaseUser(user: SupabaseUser): User {
    const metadata = user.user_metadata || {};
    const now = new Date();
    const weightRaw = metadata.weight;
    const weight =
      typeof weightRaw === 'number'
        ? weightRaw
        : typeof weightRaw === 'string' && weightRaw.trim() !== ''
          ? Number(weightRaw)
          : undefined;
    // Provider fields actually seen from Google/Apple → Supabase metadata:
    // Google: full_name, name, given_name, family_name (never use email).
    // Apple: full_name / given_name / family_name when first authorized; often absent later.
    const metaDisplayName = displayNameFromAuthMetadata(metadata);
    const metaUsername =
      typeof metadata.username === 'string' && metadata.username.trim()
        ? metadata.username.trim()
        : 'gymly_user';
    return {
      id: user.id,
      email: user.email || '',
      username: metaUsername,
      displayName: metaDisplayName ?? '',
      phoneNumber:
        typeof metadata.phoneNumber === 'string' ? metadata.phoneNumber : undefined,
      profileImageUrl: metadata.profileImageUrl,
      bicepsEmoji: metadata.bicepsEmoji || '💪🏻',
      bio: typeof metadata.bio === 'string' ? metadata.bio : undefined,
      birthYear:
        metadata.birthYear ??
        (metadata.dateOfBirth
          ? new Date(metadata.dateOfBirth as string).getFullYear()
          : undefined),
      dateOfBirth: metadata.dateOfBirth
        ? new Date(metadata.dateOfBirth as string)
        : undefined,
      trainingGoal: metadata.trainingGoal,
      weight: Number.isFinite(weight) ? weight : undefined,
      gender:
        metadata.gender === 'male' ||
        metadata.gender === 'female' ||
        metadata.gender === 'other' ||
        metadata.gender === 'prefer_not_to_say'
          ? metadata.gender
          : undefined,
      city: typeof metadata.city === 'string' ? metadata.city : undefined,
      favoriteGyms: metadata.favoriteGyms,
      privacySettings: metadata.privacySettings || {
        profileVisibility: 'friends',
        locationSharingEnabled: true,
        showWorkoutHistory: true,
        allowFriendRequests: true,
        showOnlineStatus: true,
      },
      gdprConsent: this.parseGdprFromMetadata(metadata.gdprConsent, now),
      usernameRequiresChange: Boolean(metadata.usernameRequiresChange),
      featuredBadgeIds: Array.isArray(metadata.featuredBadgeIds)
        ? (metadata.featuredBadgeIds as string[]).slice(0, 3)
        : undefined,
      createdAt: user.created_at ? new Date(user.created_at) : now,
      updatedAt: now,
      lastLoginAt: now,
      ...(metadata.gymlyOnboardingComplete === true
        ? ({_rawOnboardingComplete: true} as {_rawOnboardingComplete: true})
        : {}),
    } as User;
  }

  /**
   * Skriver profilfelter til auth.users.user_metadata så session/initialize matcher
   * det der gemmes lokalt og i public.profiles (venner, feed, …).
   */
  async syncProfileMetadataFromUser(appUser: User): Promise<User> {
    const dob =
      appUser.dateOfBirth instanceof Date
        ? getLocalDateString(appUser.dateOfBirth)
        : appUser.dateOfBirth
          ? String(appUser.dateOfBirth)
          : undefined;
    const meta: Record<string, unknown> = {
      username: appUser.username,
      displayName: appUser.displayName,
      phoneNumber: appUser.phoneNumber,
      profileImageUrl: appUser.profileImageUrl,
      bicepsEmoji: appUser.bicepsEmoji,
      bio: appUser.bio,
      birthYear: appUser.birthYear,
      dateOfBirth: dob,
      trainingGoal: appUser.trainingGoal,
      favoriteGyms: appUser.favoriteGyms,
      weight: appUser.weight,
      gender: appUser.gender,
      city: appUser.city,
      privacySettings: appUser.privacySettings,
      usernameRequiresChange: appUser.usernameRequiresChange === true,
      featuredBadgeIds: appUser.featuredBadgeIds,
      gdprConsent: this.serializeGdprConsentForMetadata(appUser.gdprConsent),
    };
    const {data, error} = await supabase.auth.updateUser({data: meta});
    if (error) {
      throw new Error(this.humanizeAuthMessage(error.message));
    }
    if (!data.user) {
      throw new Error('Kunne ikke opdatere bruger-session');
    }
    return this.mapSupabaseUser(data.user);
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
    if (
      lower.includes('email not confirmed') ||
      lower.includes('email_not_confirmed')
    ) {
      return 'E-mail-bekræftelse er stadig aktiveret i Supabase. Slå «Confirm email» fra under Authentication → Providers → Email, gem, og prøv igen.';
    }
    if (
      lower.includes('redirect') &&
      (lower.includes('not allowed') ||
        lower.includes('invalid') ||
        lower.includes('whitelist') ||
        lower.includes('configured'))
    ) {
      return `Reset-mail kunne ikke sendes, fordi redirect-URL ikke er godkendt i Supabase.\n\nTilføj præcis denne URL under Authentication → URL Configuration → Redirect URLs:\n${SUPABASE_PASSWORD_RESET_REDIRECT}`;
    }
    if (
      lower.includes('rate limit') ||
      lower.includes('only request this') ||
      lower.includes('too many') ||
      lower.includes('email rate')
    ) {
      return 'Der er sendt for mange mails på kort tid. Vent et øjeblik og prøv igen.';
    }
    if (
      lower.includes('duplicate key') ||
      lower.includes('unique constraint') ||
      lower.includes('profiles_username_lower')
    ) {
      return 'Brugernavnet er allerede taget';
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

      const normalizedUsername = normalizeUsernameForStorage(data.username);
      const usernameFree = await isUsernameAvailableInSupabase(normalizedUsername, null);
      if (!usernameFree) {
        throw new Error('Brugernavn er allerede taget');
      }

      const signUpOnce = () =>
        supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              username: normalizedUsername,
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
              gymlyOnboardingComplete: true,
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

      let user: User;
      if (signupData.user) {
        user = await mergeProfileUsernameIntoUser(this.mapSupabaseUser(signupData.user));
      } else {
        user = {
          id: Date.now().toString(),
          email: data.email,
          username: normalizedUsername,
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
      }

      let session = signupData.session;

      if (!session) {
        const signInAfterSignup = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInAfterSignup.error) {
          await SecureStorage.saveUserData(user);
          throw new Error(
            this.humanizeAuthMessage(signInAfterSignup.error.message),
          );
        }
        if (!signInAfterSignup.data.session || !signInAfterSignup.data.user) {
          throw new Error(
            'Konto oprettet, men login mislykkedes. Prøv at logge ind med din e-mail og adgangskode.',
          );
        }
        session = signInAfterSignup.data.session;
        user = await mergeProfileUsernameIntoUser(
          this.mapSupabaseUser(signInAfterSignup.data.user),
        );
      }

      const tokens = this.mapSessionTokens(session);
      if (user.id) {
        const gymIds = (data.favoriteGyms ?? []).filter(Boolean);
        if (gymIds.length > 0) {
          try {
            if (__DEV__) {
              console.log('[homeGyms] Auth.register_save_start', {userId: user.id, gymIds});
            }
            const savedIds = await persistUserHomeGyms(user.id, gymIds);
            user = {...user, favoriteGyms: savedIds, updatedAt: new Date()};
            emitProfileCentersChanged(user.id);
            if (__DEV__) {
              console.log('[homeGyms] Auth.register_save_success', {userId: user.id, savedIds});
            }
          } catch (gymErr) {
            logAuthDebug('[AuthService] persistUserHomeGyms after register', gymErr);
            if (__DEV__) {
              console.warn('[homeGyms] Auth.register_save_failed', {
                userId: user.id,
                message: gymErr instanceof Error ? gymErr.message : String(gymErr),
              });
            }
            throw new Error(
              gymErr instanceof Error
                ? gymErr.message
                : 'Could not save your home gyms. Check your connection and try again.',
            );
          }
        } else {
          user = {...user, favoriteGyms: [], updatedAt: new Date()};
        }
      }
      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);
      recordMyAccountJourney(false);

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
        throw new Error(this.humanizeAuthMessage(error.message || 'Login fejlede. Prøv igen.'));
      }

      if (!data.session || !data.user) {
        throw new Error('Login fejlede. Prøv igen.');
      }

      let user = this.mapSupabaseUser(data.user);
      user = await mergeProfileUsernameIntoUser(user);
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
    this.validateEmail(email);
    console.log('Calling resetPasswordForEmail', email);
    try {
      const {data, error} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: SUPABASE_PASSWORD_RESET_REDIRECT,
      });
      console.log('Reset response:', error ?? null, data ?? null);
      if (error) {
        throw new Error(this.humanizeAuthMessage(error.message));
      }
    } catch (e) {
      console.log('Network error:', e);
      logAuthDebug('[AuthService] password reset request failed', e);
      if (e instanceof Error) {
        throw new Error(this.humanizeAuthMessage(e.message));
      }
      throw e;
    }
  }

  private async sessionFromSupabaseUser(
    session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>,
  ): Promise<AuthResponse> {
    let user = this.mapSupabaseUser(session.user);
    user = await mergeProfileUsernameIntoUser(user);
    const stored = await SecureStorage.getUserData();
    const gymIds =
      (user.favoriteGyms?.length ? user.favoriteGyms : stored?.favoriteGyms) ?? [];
    if (user.id) {
      try {
        const resolved = await fetchUserHomeGymIds(user.id, gymIds);
        if (resolved.length > 0) {
          user = {...user, favoriteGyms: resolved, updatedAt: new Date()};
        } else if (gymIds.length > 0) {
          const savedIds = await persistUserHomeGyms(user.id, gymIds);
          user = {...user, favoriteGyms: savedIds, updatedAt: new Date()};
          emitProfileCentersChanged(user.id);
        }
      } catch (gymErr) {
        logAuthDebug('[AuthService] home gyms after session', gymErr);
      }
    }
    const tokens = this.mapSessionTokens(session);
    await SecureStorage.saveTokens(tokens);
    await SecureStorage.saveUserData(user);
    return {user, tokens};
  }

  /**
   * Validate registration data
   */
  private validateRegistration(data: UserRegistration): void {
    this.validateEmail(data.email);
    this.validatePassword(data.password);
    this.validateUsername(data.username);
    if (data.phoneNumber && String(data.phoneNumber).trim()) {
      this.validatePhoneNumber(data.phoneNumber);
    }

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
    assertPasswordPolicy(password);
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
    const u = normalizeUsernameForStorage(username);
    const err = getUsernameFormatErrorDa(u);
    if (err) {
      throw new Error(err);
    }
  }

  /**
   * Sign in with Apple (iOS only).
   * Full name/email may only arrive on first authorization — persist once, never overwrite later Gymly edits.
   */
  async signInWithApple(): Promise<AuthResponse> {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple er kun tilgængelig på iOS');
    }
    const {
      SocialAuthCancelledError,
    } = require('@/services/auth/socialAuthErrors') as typeof import('@/services/auth/socialAuthErrors');
    const {ensureGymlyProfile} = require('@/services/onboarding/ensureGymlyProfile') as typeof import('@/services/onboarding/ensureGymlyProfile');
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
        nonceEnabled: false,
      });

      if (!credential.identityToken) {
        throw new Error('Apple godkendelse returnerede ikke et token');
      }

      const {data, error} = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        throw new Error(error.message);
      }
      if (!data.session || !data.user) {
        throw new Error('Kunne ikke logge ind med Apple');
      }

      const given = credential.fullName?.givenName || undefined;
      const family = credential.fullName?.familyName || undefined;
      const fullName = firstUsableDisplayName(
        [given, family].filter(Boolean).join(' '),
      );
      const meta = data.user.user_metadata || {};
      const alreadyHasName = Boolean(
        firstUsableDisplayName(
          typeof meta.displayName === 'string' ? meta.displayName : undefined,
          typeof meta.display_name === 'string' ? meta.display_name : undefined,
          typeof meta.full_name === 'string' ? meta.full_name : undefined,
        ),
      );

      if (fullName && !alreadyHasName) {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            given_name: given,
            family_name: family,
            displayName: fullName,
          },
        });
        const refreshed = await supabase.auth.getUser();
        if (refreshed.data.user) {
          data.user = refreshed.data.user;
        }
      }

      let user = await mergeProfileUsernameIntoUser(this.mapSupabaseUser(data.user));
      user = await ensureGymlyProfile(user, {
        displayName: fullName || undefined,
        givenName: given,
        familyName: family,
      });
      const tokens = this.mapSessionTokens(data.session);
      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);
      return {user, tokens};
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        throw new SocialAuthCancelledError('apple');
      }
      if (__DEV__) {
        console.warn('Apple sign in error:', error?.message || error);
      }
      throw error;
    }
  }

  /**
   * Sign in with Google via native Google Sign-In → Supabase id_token.
   * Requires GOOGLE_WEB_CLIENT_ID (and iOS client id) in native env — see MANUAL_SETUP.
   */
  async signInWithGoogle(): Promise<AuthResponse> {
    const {
      SocialAuthCancelledError,
    } = require('@/services/auth/socialAuthErrors') as typeof import('@/services/auth/socialAuthErrors');
    const {ensureGymlyProfile} = require('@/services/onboarding/ensureGymlyProfile') as typeof import('@/services/onboarding/ensureGymlyProfile');
    const {
      getGoogleWebClientId,
      getGoogleIosClientId,
      isGoogleSignInConfigured,
    } = require('@/config/googleAuthConfig') as typeof import('@/config/googleAuthConfig');

    if (!isGoogleSignInConfigured()) {
      // Stable code for UI localization — never expose env key names to users.
      throw new Error('GOOGLE_SIGN_IN_NOT_CONFIGURED');
    }

    let statusCodes: {SIGN_IN_CANCELLED?: string} | undefined;
    try {
      const googleSignIn = require('@react-native-google-signin/google-signin');
      const {GoogleSignin} = googleSignIn;
      statusCodes = googleSignIn.statusCodes;
      GoogleSignin.configure({
        webClientId: getGoogleWebClientId(),
        iosClientId: getGoogleIosClientId() || undefined,
        offlineAccess: false,
      });
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
      const response = await GoogleSignin.signIn();
      const idToken =
        response?.data?.idToken ??
        response?.idToken ??
        null;
      if (!idToken) {
        throw new Error('Google returnerede ikke et id-token');
      }

      const {data, error} = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (!data.session || !data.user) {
        throw new Error('Kunne ikke logge ind med Google');
      }

      const meta = data.user.user_metadata || {};
      const providerName = firstUsableDisplayName(
        typeof meta.full_name === 'string' ? meta.full_name : undefined,
        typeof meta.name === 'string' ? meta.name : undefined,
        [meta.given_name, meta.family_name]
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .join(' '),
      );
      const avatar =
        typeof meta.avatar_url === 'string'
          ? meta.avatar_url
          : typeof meta.picture === 'string'
            ? meta.picture
            : undefined;

      let user = await mergeProfileUsernameIntoUser(this.mapSupabaseUser(data.user));
      user = await ensureGymlyProfile(user, {
        displayName: providerName,
        avatarUrl: avatar,
      });
      const tokens = this.mapSessionTokens(data.session);
      await SecureStorage.saveTokens(tokens);
      await SecureStorage.saveUserData(user);
      return {user, tokens};
    } catch (error: any) {
      const cancelled =
        error instanceof SocialAuthCancelledError ||
        error?.code === 'SIGN_IN_CANCELLED' ||
        error?.code === statusCodes?.SIGN_IN_CANCELLED ||
        (typeof error?.message === 'string' &&
          /cancel|annuller/i.test(error.message));
      if (cancelled) {
        throw new SocialAuthCancelledError('google');
      }
      if (__DEV__) {
        console.warn('Google sign in error:', error?.message || error);
      }
      throw error;
    }
  }

  /**
   * Persist remaining Gymly onboarding fields for an already-authenticated user.
   */
  async completeGymlyOnboarding(
    data: Omit<UserRegistration, 'email' | 'password'> & {email?: string},
  ): Promise<User> {
    const {
      data: {user: authUser},
    } = await supabase.auth.getUser();
    if (!authUser) {
      throw new Error('Ingen aktiv session');
    }

    const normalizedUsername = normalizeUsernameForStorage(data.username);
    this.validateUsername(normalizedUsername);
    const usernameFree = await isUsernameAvailableInSupabase(
      normalizedUsername,
      authUser.id,
    );
    if (!usernameFree) {
      throw new Error('Brugernavn er allerede taget');
    }

    const gymIds = (data.favoriteGyms ?? []).filter(Boolean);

    const {error: updateError} = await supabase.auth.updateUser({
      data: {
        username: normalizedUsername,
        phoneNumber: data.phoneNumber,
        displayName: data.displayName,
        bicepsEmoji: data.bicepsEmoji || '💪🏻',
        favoriteGyms: gymIds,
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
        gymlyOnboardingComplete: true,
      },
    });
    if (updateError) {
      throw new Error(this.humanizeAuthMessage(updateError.message));
    }

    const {
      data: {user: refreshed},
    } = await supabase.auth.getUser();
    let user = await mergeProfileUsernameIntoUser(
      this.mapSupabaseUser(refreshed ?? authUser),
    );
    user = {
      ...user,
      username: normalizedUsername,
      displayName: data.displayName,
      phoneNumber: data.phoneNumber,
      bicepsEmoji: data.bicepsEmoji || '💪🏻',
      bio: data.bio,
      birthYear: data.birthYear,
      dateOfBirth: data.dateOfBirth
        ? new Date(data.dateOfBirth)
        : user.dateOfBirth,
      trainingGoal: data.trainingGoal,
      profileImageUrl: data.profileImageUrl ?? user.profileImageUrl,
      usernameRequiresChange: false,
      gdprConsent: {
        ...user.gdprConsent,
        privacyPolicyAccepted: data.gdprConsent.privacyPolicyAccepted,
        termsOfServiceAccepted: data.gdprConsent.termsOfServiceAccepted,
        marketingConsent: data.gdprConsent.marketingConsent,
        analyticsConsent: data.gdprConsent.analyticsConsent,
        locationTrackingConsent:
          data.gdprConsent.locationTrackingConsent ?? false,
        dataRetentionConsent: true,
      },
    };

    const {upsertMyProfile} = require('@/services/supabase/friendService') as typeof import('@/services/supabase/friendService');
    await upsertMyProfile(user);
    if (gymIds.length > 0) {
      const savedIds = await persistUserHomeGyms(user.id, gymIds);
      user = {...user, favoriteGyms: savedIds, updatedAt: new Date()};
      emitProfileCentersChanged(user.id);
    } else {
      user = {...user, favoriteGyms: [], updatedAt: new Date()};
    }
    await SecureStorage.saveUserData(user);
    recordMyAccountJourney(true);
    return user;
  }

  /**
   * Social login (Apple/Google) — establishes session only; Gymly onboarding is separate.
   */
  async socialLogin(
    provider: 'apple' | 'google',
    _data?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      username?: string;
      bicepsEmoji?: string;
      favoriteGyms?: string[];
    },
  ): Promise<AuthResponse> {
    if (provider === 'apple') {
      return this.signInWithApple();
    }
    if (provider === 'google') {
      return this.signInWithGoogle();
    }
    throw new Error('Ukendt login-udbyder');
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

