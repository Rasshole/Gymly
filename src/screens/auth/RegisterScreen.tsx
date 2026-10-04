/**
 * Gymly onboarding V2 — Create account → Profile → Gym → Home.
 * Also used post-auth (Apple/Google) via OnboardingNavigator.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import type {OnboardingStackParamList} from '@/navigation/OnboardingNavigator';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import {
  getPasswordIssue,
  isPasswordPolicyError,
  type PasswordIssue,
} from '@/services/auth/passwordPolicy';
import {navigationRef} from '@/navigation/navigationRef';
import Icon from 'react-native-vector-icons/Ionicons';
import GymlyLogo from '@/components/GymlyLogo';
import {AuthLanguageButton} from '@/components/auth/AuthLanguageButton';
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import {scheduleGymSearchWarmup} from '@/services/gymSearch/gymSearchIndex';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import {
  normalizeUsernameForStorage,
  normalizeUsernameInput,
} from '@/utils/usernameRules';
import {useUsernameAvailability} from '@/hooks/useUsernameAvailability';
import {useTranslation} from '@/i18n';
import {
  OnboardingPrimaryButton,
  OnboardingGymPicker,
  ONBOARDING,
} from '@/components/onboarding';
import {SocialContinueButtons} from '@/components/auth/SocialContinueButtons';
import {
  getOnboardingState,
  type OnboardingStepId,
} from '@/services/onboarding/onboardingState';

const REG_PICKER_GYMS = getActiveDanishGyms();
scheduleGymSearchWarmup(REG_PICKER_GYMS);

type Step = 'entry' | 'profile' | 'gym';

type NavProp = StackNavigationProp<AuthStackParamList, 'Register'>;

function stepFromOnboardingId(id: OnboardingStepId): Step {
  return id === 'gym' ? 'gym' : 'profile';
}

const RegisterScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<
    RouteProp<AuthStackParamList, 'Register'> | RouteProp<OnboardingStackParamList, 'CompleteProfile'>
  >();
  const insets = useSafeAreaInsets();
  const {login, setUser, markOnboardingComplete, user: storeUser} = useAppStore();
  const {t} = useTranslation();
  const scrollRef = useRef<ScrollView>(null);

  const isPostAuth =
    (route.params as {mode?: string} | undefined)?.mode === 'postAuth' ||
    route.name === 'CompleteProfile';

  const [step, setStep] = useState<Step>(isPostAuth ? 'profile' : 'entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [profileImageUri, setProfileImageUri] = useState<string | undefined>();
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const usernameNorm = normalizeUsernameForStorage(username);
  const {
    formatError: usernameFormatError,
    available: usernameAvailable,
    checking: usernameChecking,
    canProceed: usernameCanProceed,
  } = useUsernameAvailability({
    rawUsername: username,
    excludeUserId: isPostAuth ? storeUser?.id ?? null : null,
    unchangedNormalized:
      isPostAuth && storeUser?.username
        ? normalizeUsernameForStorage(storeUser.username)
        : null,
  });

  const profileReady =
    displayName.trim().length >= 2 && usernameCanProceed;

  useEffect(() => {
    if (!isPostAuth || !storeUser) {
      return;
    }
    if (storeUser.displayName && !displayName) {
      setDisplayName(storeUser.displayName);
    }
    if (storeUser.username && !username && !storeUser.usernameRequiresChange) {
      const u = normalizeUsernameInput(storeUser.username);
      if (u && !/^u_[a-f0-9]/i.test(u)) {
        setUsername(u);
      }
    }
    if (storeUser.profileImageUrl && !profileImageUri) {
      setProfileImageUri(storeUser.profileImageUrl);
    }
    void getOnboardingState(storeUser).then(state => {
      if (state.status === 'INCOMPLETE') {
        setStep(stepFromOnboardingId(state.firstMissingStep));
      }
    });
    // Soft-accept terms for social; required checkboxes only on email entry.
    setPrivacyAccepted(true);
    setTermsAccepted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPostAuth, storeUser?.id]);

  const passwordIssue = getPasswordIssue(password);

  const passwordHintKey = (issue: PasswordIssue): string => {
    switch (issue) {
      case 'minLength':
        return 'register.passwordMinLength';
      case 'upper':
        return 'register.passwordUpper';
      case 'lower':
        return 'register.passwordLower';
      case 'digit':
        return 'register.passwordDigit';
    }
  };

  const showPasswordError = passwordAttempted && passwordIssue !== null;

  const progress = useMemo(() => {
    if (step === 'entry') {
      return {current: 0, total: 2, show: false};
    }
    if (step === 'profile') {
      return {current: 1, total: 2, show: true};
    }
    return {current: 2, total: 2, show: true};
  }, [step]);

  const handlePickPhoto = () => {
    launchImageLibrary(
      {mediaType: 'photo', quality: 0.8, selectionLimit: 1},
      (res: ImagePickerResponse) => {
        const uri = res.assets?.[0]?.uri;
        if (uri) {
          setProfileImageUri(uri);
        }
      },
    );
  };

  const finishToHome = useCallback(
    (user: Parameters<typeof login>[0], tokens?: Parameters<typeof login>[1]) => {
      if (tokens) {
        login(user, tokens);
      } else {
        setUser(user);
      }
      markOnboardingComplete();
      if (navigationRef.isReady()) {
        navigationRef.reset({index: 0, routes: [{name: 'Main'}]});
      }
    },
    [login, markOnboardingComplete, setUser],
  );

  const handleEntryContinue = () => {
    if (email.trim().length <= 3 || !privacyAccepted || !termsAccepted) {
      return;
    }
    if (passwordIssue) {
      setPasswordAttempted(true);
      passwordRef.current?.focus();
      return;
    }
    setStep('profile');
    scrollRef.current?.scrollTo({y: 0, animated: false});
  };

  const surfaceRegistrationError = (e: unknown) => {
    if (isPasswordPolicyError(e)) {
      setPasswordAttempted(true);
      setStep('entry');
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    const message = e instanceof Error ? e.message : t('common.retry');
    if (/adgangskode|password/i.test(message)) {
      setPasswordAttempted(true);
      setStep('entry');
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    Alert.alert(t('common.error'), message);
  };

  const handleProfileContinue = () => {
    if (!profileReady) {
      return;
    }
    setStep('gym');
    scrollRef.current?.scrollTo({y: 0, animated: false});
  };

  const buildConsent = () => ({
    privacyPolicyAccepted: privacyAccepted || isPostAuth,
    termsOfServiceAccepted: termsAccepted || isPostAuth,
    marketingConsent: false,
    analyticsConsent: false,
    locationTrackingConsent: false,
  });

  const completeEmailRegistration = async (gymIds: string[]) => {
    const {user, tokens} = await AuthService.register({
      email: email.trim(),
      password,
      username: usernameNorm,
      displayName: displayName.trim(),
      phoneNumber: undefined,
      profileImageUrl: profileImageUri,
      favoriteGyms: gymIds,
      bicepsEmoji: '💪🏻',
      gdprConsent: buildConsent(),
    });
    if (!tokens) {
      throw new Error(t('auth.sessionFailed'));
    }
    finishToHome(user, tokens);
  };

  const completePostAuth = async (gymIds: string[]) => {
    const user = await AuthService.completeGymlyOnboarding({
      username: usernameNorm,
      displayName: displayName.trim(),
      phoneNumber: undefined,
      profileImageUrl: profileImageUri,
      favoriteGyms: gymIds,
      bicepsEmoji: '💪🏻',
      gdprConsent: buildConsent(),
    });
    finishToHome(user);
  };

  /** One-tap gym → persist first → Home. Never mark complete on failure. */
  const handleGymPicked = async (gym: DanishGym) => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const gymIds = [gym.id];
      if (isPostAuth) {
        await completePostAuth(gymIds);
      } else {
        await completeEmailRegistration(gymIds);
      }
    } catch (e) {
      surfaceRegistrationError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipGym = async () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (isPostAuth) {
        await completePostAuth([]);
      } else {
        await completeEmailRegistration([]);
      }
    } catch (e) {
      surfaceRegistrationError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'gym') {
      setStep('profile');
      return;
    }
    if (step === 'profile') {
      if (isPostAuth) {
        return;
      }
      setStep('entry');
      return;
    }
    navigation.navigate('Login');
  };

  const renderProgress = () => {
    if (!progress.show) {
      return null;
    }
    return (
      <View style={styles.progressWrap}>
        <View style={styles.progressDots}>
          <View
            style={[
              styles.dot,
              progress.current >= 1 ? styles.dotOn : styles.dotOff,
            ]}
          />
          <View style={styles.progressLine} />
          <View
            style={[
              styles.dot,
              progress.current >= 2 ? styles.dotOn : styles.dotOff,
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>
          {t('register.progressOf', {
            current: String(progress.current),
            total: String(progress.total),
          })}
        </Text>
      </View>
    );
  };

  const renderEntry = () => (
    <View>
      <Text style={styles.title}>{t('register.v2EntryTitle')}</Text>
      <Text style={styles.subtitle}>{t('register.v2EntrySub')}</Text>

      <SocialContinueButtons
        divider="after"
        disabled={isSubmitting}
        onBusyChange={setSocialBusy}
      />

      <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
      <TextInput
        style={[styles.input, focused === 'email' && styles.inputFocused]}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        placeholder={t('register.emailPlaceholder')}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused('email')}
        onBlur={() => setFocused(null)}
      />

      <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
      <TextInput
        ref={passwordRef}
        style={[
          styles.input,
          focused === 'password' && styles.inputFocused,
          showPasswordError && styles.inputError,
        ]}
        value={password}
        onChangeText={value => {
          setPassword(value);
        }}
        secureTextEntry
        placeholder={t('register.passwordPlaceholder')}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused('password')}
        onBlur={() => {
          setFocused(null);
          if (password.length > 0) {
            setPasswordAttempted(true);
          }
        }}
      />
      {passwordIssue ? (
        <Text style={showPasswordError ? styles.hintError : styles.hintMuted}>
          {t(passwordHintKey(passwordIssue))}
        </Text>
      ) : password.length > 0 ? (
        <Text style={styles.hintOk}>{t('register.passwordStrong')}</Text>
      ) : null}

      <Pressable
        style={styles.checkRow}
        onPress={() => setTermsAccepted(v => !v)}>
        <View style={[styles.checkBox, termsAccepted && styles.checkBoxOn]}>
          {termsAccepted ? (
            <Icon name="checkmark" size={14} color={colors.white} />
          ) : null}
        </View>
        <Text style={styles.checkText}>
          {t('register.consentAccept')}{' '}
          <Text
            style={styles.link}
            onPress={() => navigation.navigate('Terms')}>
            {t('register.consentTerms')}
          </Text>
        </Text>
      </Pressable>
      <Pressable
        style={styles.checkRow}
        onPress={() => setPrivacyAccepted(v => !v)}>
        <View style={[styles.checkBox, privacyAccepted && styles.checkBoxOn]}>
          {privacyAccepted ? (
            <Icon name="checkmark" size={14} color={colors.white} />
          ) : null}
        </View>
        <Text style={styles.checkText}>
          {t('register.consentAccept')}{' '}
          <Text
            style={styles.link}
            onPress={() => navigation.navigate('PrivacyPolicy')}>
            {t('register.consentPrivacy')}
          </Text>
        </Text>
      </Pressable>

      <OnboardingPrimaryButton
        label={t('register.continue')}
        onPress={handleEntryContinue}
        disabled={email.trim().length <= 3 || !privacyAccepted || !termsAccepted || socialBusy}
      />
    </View>
  );

  const renderProfile = () => (
    <View>
      {renderProgress()}
      <View style={styles.brandRow}>
        <GymlyLogo size={28} />
      </View>
      <Text style={styles.title}>{t('register.v2ProfileTitle')}</Text>
      <Text style={styles.subtitle}>{t('register.v2ProfileSub')}</Text>

      <Text style={styles.fieldLabel}>{t('register.name')}</Text>
      <TextInput
        style={[styles.input, focused === 'name' && styles.inputFocused]}
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        placeholder={t('register.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused('name')}
        onBlur={() => setFocused(null)}
      />

      <Text style={styles.fieldLabel}>{t('register.username')}</Text>
      <TextInput
        style={[styles.input, focused === 'username' && styles.inputFocused]}
        value={username}
        onChangeText={v => setUsername(normalizeUsernameInput(v))}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('register.username')}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused('username')}
        onBlur={() => setFocused(null)}
      />
      {usernameFormatError ? (
        <Text style={styles.hintError}>{usernameFormatError}</Text>
      ) : usernameChecking ? (
        <Text style={styles.hintMuted}>{t('register.usernameChecking')}</Text>
      ) : usernameAvailable === false ? (
        <Text style={styles.hintError}>{t('register.usernameTaken')}</Text>
      ) : usernameAvailable === true ? (
        <Text style={styles.hintOk}>{t('register.usernameAvailable')}</Text>
      ) : (
        <Text style={styles.hintMuted}>{t('register.usernameRules')}</Text>
      )}

      <View style={styles.photoBlock}>
        <Pressable style={styles.photoCircle} onPress={handlePickPhoto}>
          {profileImageUri ? (
            <Image source={{uri: profileImageUri}} style={styles.photoImg} />
          ) : (
            <Icon name="camera-outline" size={28} color={colors.primary} />
          )}
        </Pressable>
        <View style={styles.photoActions}>
          <Pressable onPress={handlePickPhoto}>
            <Text style={styles.photoActionPrimary}>{t('register.addPhoto')}</Text>
          </Pressable>
          {profileImageUri ? (
            <Pressable onPress={() => setProfileImageUri(undefined)}>
              <Text style={styles.photoActionSkip}>{t('register.skipPhoto')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.photoActionSkip}>{t('register.skipPhoto')}</Text>
          )}
        </View>
      </View>

      <OnboardingPrimaryButton
        label={t('register.continue')}
        onPress={handleProfileContinue}
        disabled={!profileReady}
      />
    </View>
  );

  const renderGym = () => (
    <View style={styles.gymStep}>
      {renderProgress()}
      <Text style={styles.title}>{t('register.v2GymTitle')}</Text>

      <OnboardingGymPicker
        allGyms={REG_PICKER_GYMS}
        onSelectGym={gym => {
          void handleGymPicked(gym);
        }}
        disabled={isSubmitting}
      />

      <Pressable
        style={styles.skipBtn}
        onPress={() => {
          void handleSkipGym();
        }}
        disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <Text style={styles.skipText}>{t('register.skipForNow')}</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + spacing.sm}]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          {!isPostAuth || step !== 'profile' ? (
            <Pressable
              style={styles.backBtn}
              onPress={handleBack}
              hitSlop={12}
              accessibilityLabel={t('register.back')}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.backBtnSpacer} />
          )}
          {step === 'entry' && !isPostAuth ? (
            <AuthLanguageButton />
          ) : (
            <View style={styles.topBarSide} />
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            {paddingBottom: insets.bottom + spacing.xl},
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {step === 'entry'
            ? renderEntry()
            : step === 'profile'
              ? renderProfile()
              : renderGym()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  flex: {flex: 1},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
  },
  topBarSide: {width: 40},
  backBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  backBtnSpacer: {height: 36, width: 40},
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  brandRow: {marginBottom: spacing.md},
  progressWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {width: 8, height: 8, borderRadius: 4},
  dotOn: {backgroundColor: colors.primary},
  dotOff: {backgroundColor: ONBOARDING.progressTrack},
  progressLine: {
    width: 28,
    height: 2,
    backgroundColor: ONBOARDING.progressTrack,
    marginHorizontal: 6,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  title: {
    fontSize: 28,
    fontWeight: ONBOARDING.titleWeight,
    color: colors.text,
    letterSpacing: -0.6,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: ONBOARDING.inputBorder,
    borderRadius: ONBOARDING.inputRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  inputFocused: {
    borderColor: ONBOARDING.inputBorderFocus,
  },
  inputError: {
    borderColor: colors.error,
  },
  hintMuted: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  hintError: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  hintOk: {
    ...typography.caption,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  photoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  photoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ONBOARDING.lavenderTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImg: {width: 72, height: 72},
  photoActions: {flex: 1, gap: 6},
  photoActionPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  photoActionSkip: {
    fontSize: 14,
    color: colors.textMuted,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkText: {
    flex: 1,
    ...typography.small,
    color: colors.textSecondary,
  },
  link: {color: colors.primary, fontWeight: '600'},
  gymStep: {flexGrow: 1, minHeight: 420},
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RegisterScreen;
