/**
 * Gymly onboarding — 5 trin + færdig / e-mailbekræftelse. Email, adgangskode, fødselsdato, mobil og placeringstilladelse.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  Animated,
  Easing,
  Dimensions,
  Linking,
  Pressable,
  AppState,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import {navigationRef} from '@/navigation/navigationRef';
import {supabase} from '@/services/supabase/supabaseClient';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import GymlyLogo from '@/components/GymlyLogo';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import colors from '@/theme/colors';
import {spacing, radius, shadows} from '@/theme/designTokens';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';
import {User} from '@/types/user.types';
import {AuthTokens} from '@/types/auth.types';
import {isValidDanishMobile, normalizeDanishPhone} from '@/utils/phoneUtils';
import {gymSearchMatchesTokens} from '@/utils/gymSearch';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {useTranslation, getIntlLocale} from '@/i18n';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as streak from '@/utils/streakUtils';
import {
  getUsernameFormatError,
  normalizeUsernameForStorage,
  normalizeUsernameInput,
} from '@/utils/usernameRules';
import {useUsernameAvailability} from '@/hooks/useUsernameAvailability';
import Geolocation, {
  type GeolocationError,
  type GeolocationResponse,
} from '@react-native-community/geolocation';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
  mapLegacyLocationPermissionStatus,
  requestLocationPermissionIfNeeded,
  showLocationDeniedInAppMessage,
} from '@/services/location/locationPermission';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  OnboardingPrimaryButton,
  OnboardingGymPicker,
  ONBOARDING,
} from '@/components/onboarding';

const SPLASH_KETTLEBELL = require('@/assets/images/splash-kettlebell.png');
const REG_PICKER_GYMS = getActiveDanishGyms();

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;
type Step =
  | 'entry'
  | 'profile'
  | 'gym'
  | 'social'
  | 'done'
  | 'verification';

/** Register wizard steps (language is step 1 globally). */
const FLOW_STEPS: Step[] = ['entry', 'profile', 'gym', 'social'];
const ONBOARDING_TOTAL_STEPS = 5;
const BICEPS_OPTIONS = ['💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿', '🦾'];

const GEO_PERMISSION_DENIED = 1;
const GEO_OPTS_ONBOARD = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
};

/** Standard startalder i onboarding (~25 år); bruges som init for fødselsdato + iOS-datokladde. */
function defaultOnboardingBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d;
}

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const {login} = useAppStore();
  const {t, language} = useTranslation();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>('entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(defaultOnboardingBirthDate);
  /** iOS: spinner opdaterer kun kladden; «Vælg» skriver til dateOfBirth (pålideligt bekræftelsesflow). */
  const [dobPickerDraft, setDobPickerDraft] = useState(defaultOnboardingBirthDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [favoriteGyms, setFavoriteGyms] = useState<(DanishGym | null)[]>([null, null, null]);
  const [favoriteGymLabels, setFavoriteGymLabels] = useState<string[]>(['', '', '']);
  /** OS-placeringstilladelse — påkrævet for at gå videre fra gym-trinnet */
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    'idle' | 'granted' | 'denied'
  >('idle');
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedBiceps, setSelectedBiceps] = useState<string | null>(null);
  const [profilePhotoUri, setProfilePhotoUri] = useState('');
  const [trainingGoal, setTrainingGoal] = useState('');
  const [bio, setBio] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<{user: User; tokens: AuthTokens} | null>(null);
  const [verificationSplashVisible, setVerificationSplashVisible] = useState(false);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashLogoScale = useRef(new Animated.Value(0.45)).current;
  const splashRingScale = useRef(new Animated.Value(0.6)).current;
  const splashRingOpacity = useRef(new Animated.Value(0)).current;
  const splashFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentFade = useRef(new Animated.Value(1)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(2 / ONBOARDING_TOTAL_STEPS)).current;
  const passwordToggleAnim = useRef(new Animated.Value(1)).current;
  const bicepsScaleRef = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(BICEPS_OPTIONS.map(key => [key, new Animated.Value(1)])),
  ).current;

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push(t('register.passwordMinLength'));
    if (!/[A-Z]/.test(pwd)) errors.push(t('register.passwordUpper'));
    if (!/[a-z]/.test(pwd)) errors.push(t('register.passwordLower'));
    if (!/[0-9]/.test(pwd)) errors.push(t('register.passwordDigit'));
    return errors;
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setPasswordErrors(text.length > 0 ? validatePassword(text) : []);
  };

  const formatBirthDateLabel = (d: Date) =>
    d.toLocaleDateString(getIntlLocale(language), {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  const ageFromBirthDate = (birth: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const md = today.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const validateBirthDate = (d: Date): string | null => {
    const age = ageFromBirthDate(d);
    if (age < 13) return t('register.alertBirthDateYoung');
    if (age > 120) return t('register.alertBirthDateCheck');
    return null;
  };

  const usernameAvailability = useUsernameAvailability({
    rawUsername: username,
    excludeUserId: null,
    language,
  });

  const profileContinueEnabled = useMemo(() => {
    const dobErr = validateBirthDate(dateOfBirth);
    return (
      Boolean(firstName.trim() && lastName.trim()) &&
      dobErr === null &&
      usernameAvailability.canProceed &&
      isValidDanishMobile(phoneNumber)
    );
  }, [
    firstName,
    lastName,
    dateOfBirth,
    usernameAvailability.canProceed,
    phoneNumber,
  ]);

  const progressIndex = FLOW_STEPS.indexOf(step);
  const showProgress = progressIndex >= 0;

  const handleEntryContinue = () => {
    if (!email.trim()) {
      Alert.alert(t('register.alertEmail'), t('register.alertEmailEmpty'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert(t('register.alertEmail'), t('register.alertEmailInvalid'));
      return;
    }
    const err = validatePassword(password);
    if (err.length) {
      Alert.alert(t('register.alertPassword'), err.join('\n'));
      return;
    }
    setStep('profile');
  };

  const handleProfileContinue = () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(t('register.alertName'), t('register.alertNameEmpty'));
      return;
    }
    const dobErr = validateBirthDate(dateOfBirth);
    if (dobErr) {
      Alert.alert(t('register.alertBirthDate'), dobErr);
      return;
    }
    const uFmt = getUsernameFormatError(language, normalizeUsernameForStorage(username));
    if (uFmt) {
      Alert.alert(t('register.alertUsername'), uFmt);
      return;
    }
    if (!usernameAvailability.canProceed) {
      if (usernameAvailability.checking) {
        Alert.alert(t('register.alertUsername'), t('register.alertUsernameWait'));
        return;
      }
      if (usernameAvailability.available === false) {
        Alert.alert(t('register.alertUsername'), t('register.alertUsernameTaken'));
        return;
      }
      Alert.alert(t('register.alertUsername'), t('register.alertUsernameRetry'));
      return;
    }
    if (!isValidDanishMobile(phoneNumber)) {
      Alert.alert(t('register.alertPhone'), t('register.alertPhoneInvalid'));
      return;
    }
    setStep('gym');
  };

  const handleSelectGymAtIndex = (index: number, gym: DanishGym) => {
    const displayLabel = formatGymDisplayName(gym);
    setFavoriteGyms(prev => {
      const next = [...prev];
      next[index] = gym;
      return next;
    });
    setFavoriteGymLabels(prev => {
      const next = [...prev];
      next[index] = displayLabel;
      return next;
    });
  };

  const handleRemoveGymAtIndex = (index: number) => {
    setFavoriteGyms(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setFavoriteGymLabels(prev => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
  };

  const markLocationGranted = useCallback(() => {
    setLocationPermissionStatus('granted');
  }, []);

  const onGeolocationFailure = useCallback((error: GeolocationError) => {
    const denied = error?.code === GEO_PERMISSION_DENIED;
    if (denied) {
      setLocationPermissionStatus('denied');
      Alert.alert(
        t('register.alertLocation'),
        t('register.alertLocationDenied'),
        [
          {text: t('common.ok')},
          {text: t('register.alertLocationOpenSettings'), onPress: () => Linking.openSettings()},
        ],
      );
    } else {
      // Timeout / position ukendt — tilladelse kan stadig være givet
      markLocationGranted();
    }
  }, [markLocationGranted]);

  const requestOnboardingLocation = useCallback(async () => {
    setLocationRequesting(true);
    const finish = () => setLocationRequesting(false);
    const onPosOk = (_p: GeolocationResponse) => {
      markLocationGranted();
      finish();
    };
    const onPosErr = (err: GeolocationError) => {
      onGeolocationFailure(err);
      finish();
    };

    try {
      const status = await requestLocationPermissionIfNeeded();
      const legacy = mapLegacyLocationPermissionStatus(status);
      setLocationPermissionStatus(legacy === 'granted' ? 'granted' : 'denied');

      if (status === 'denied' || status === 'restricted') {
        finish();
        showLocationDeniedInAppMessage();
        return;
      }
      if (!isLocationAuthorized(status)) {
        finish();
        return;
      }
      Geolocation.getCurrentPosition(onPosOk, onPosErr, GEO_OPTS_ONBOARD);
    } catch {
      finish();
    }
  }, [markLocationGranted, onGeolocationFailure, t]);

  useEffect(() => {
    void getLocationPermissionStatus().then(status => {
      if (isLocationAuthorized(status)) {
        setLocationPermissionStatus('granted');
      } else if (status === 'denied' || status === 'restricted') {
        setLocationPermissionStatus('denied');
      }
    });
  }, []);

  const handleGymContinue = () => {
    const hasGym = favoriteGyms.some(g => g !== null);
    if (!hasGym) {
      Alert.alert(t('register.alertGym'), t('register.alertGymRequired'));
      return;
    }
    if (!selectedBiceps) {
      Alert.alert(t('register.alertBiceps'), t('register.alertBicepsRequired'));
      return;
    }
    setStep('social');
  };

  const handlePhotoPick = () => {
    Alert.alert(t('register.alertPhoto'), t('register.alertPhotoHow'), [
      {
        text: t('register.alertPhotoCamera'),
        onPress: async () => {
          const response: ImagePickerResponse = await launchCamera({
            mediaType: 'photo',
            cameraType: 'front',
            saveToPhotos: false,
            quality: 0.8,
          } as CameraOptions);
          const asset = response.assets?.[0];
          if (asset?.uri) setProfilePhotoUri(asset.uri);
        },
      },
      {
        text: t('register.alertPhotoLibrary'),
        onPress: async () => {
          const response = await launchImageLibrary({
            mediaType: 'photo',
            selectionLimit: 1,
            quality: 0.8,
          });
          const asset = response.assets?.[0];
          if (asset?.uri) setProfilePhotoUri(asset.uri);
        },
      },
      {text: t('common.cancel'), style: 'cancel'},
    ]);
  };

  const buildFavoriteGymIds = (): string[] => {
    const ids: string[] = [];
    favoriteGymLabels.forEach((label, index) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const selected = favoriteGyms[index];
      const gymId =
        selected?.id ??
        REG_PICKER_GYMS.find(g => {
          const haystack = [g.name, g.city ?? '', g.address ?? '', g.brand ?? ''].join(' ');
          return gymSearchMatchesTokens(haystack, trimmed);
        })?.id;
      if (gymId && !ids.includes(gymId)) ids.push(gymId);
    });
    return ids;
  };

  const handleCompleteRegistration = async () => {
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert(t('register.alertRequired'), t('register.alertConsentRequired'));
      return;
    }
    if (locationPermissionStatus !== 'granted') {
      Alert.alert(t('register.alertLocation'), t('register.alertLocationRequired'));
      return;
    }
    const dobErr = validateBirthDate(dateOfBirth);
    if (dobErr) {
      Alert.alert(t('register.alertBirthDate'), dobErr);
      return;
    }

    setIsLoading(true);
    try {
      const favoriteGymIds = buildFavoriteGymIds();
      const birthYear = dateOfBirth.getFullYear();
      const dateOfBirthIso = streak.getLocalDateString(dateOfBirth);
      const phoneNormalized = normalizeDanishPhone(phoneNumber);
      if (!phoneNormalized) {
        Alert.alert(t('register.alertPhone'), t('register.alertPhoneInvalidShort'));
        setIsLoading(false);
        return;
      }

      const {user, tokens, needsEmailConfirmation} = await AuthService.register({
        email: email.trim(),
        username: normalizeUsernameForStorage(username),
        phoneNumber: phoneNormalized,
        displayName: fullName || email.trim(),
        password,
        bicepsEmoji: selectedBiceps ?? '💪🏻',
        gdprConsent: {
          privacyPolicyAccepted: privacyAccepted,
          termsOfServiceAccepted: termsAccepted,
          marketingConsent,
          analyticsConsent,
          locationTrackingConsent: locationPermissionStatus === 'granted',
        },
        favoriteGyms: favoriteGymIds.length > 0 ? favoriteGymIds : undefined,
        profileImageUrl: profilePhotoUri || undefined,
        bio: bio.trim() || undefined,
        trainingGoal: trainingGoal.trim() || undefined,
        birthYear,
        dateOfBirth: dateOfBirthIso,
      });

      if (needsEmailConfirmation) {
        setStep('verification');
        return;
      }
      if (!tokens) throw new Error(t('register.alertRegisterRetry'));
      setPendingAuth({user, tokens});
      setStep('done');
    } catch (error: any) {
      Alert.alert(
        t('register.alertRegisterFailed'),
        error.message || t('register.alertRegisterRetry'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterGymly = () => {
    if (!pendingAuth) {
      return;
    }
    login(pendingAuth.user, pendingAuth.tokens);
    setPendingAuth(null);
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{name: 'Main'}],
      });
    }
  };

  useEffect(() => {
    if (step !== 'profile') {
      setShowDatePicker(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'verification') {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        void supabase.auth.refreshSession().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [step]);

  useEffect(
    () => () => {
      if (splashFinishTimerRef.current) {
        clearTimeout(splashFinishTimerRef.current);
        splashFinishTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 2000, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 2000, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [logoFloat]);

  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current === step) {
      return;
    }
    prevStepRef.current = step;
    contentFade.setValue(0);
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentFade, step]);

  useEffect(() => {
    if (progressIndex < 0) return;
    const target = (progressIndex + 2) / ONBOARDING_TOTAL_STEPS;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnim, progressIndex]);

  useEffect(() => {
    passwordToggleAnim.setValue(0.6);
    Animated.timing(passwordToggleAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [passwordToggleAnim, showPassword]);

  const enterAppAfterEmailConfirmed = useCallback(
    (user: User, tokens: AuthTokens) => {
      login(user, tokens);
      if (navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [{name: 'Main'}],
        });
      }
    },
    [login],
  );

  const handleVerificationContinue = () => {
    if (!email.trim() || !password) {
      Alert.alert(t('register.alertInfoMissing'), t('register.alertInfoMissingBody'));
      return;
    }
    setIsLoading(true);
    void AuthService.completeSignupAfterEmailConfirmation(email.trim(), password)
      .then(({user, tokens}) => {
        if (!tokens) {
          Alert.alert(t('register.alertNotVerified'), t('register.alertNotVerifiedBody'));
          return;
        }
        enterAppAfterEmailConfirmed(user, tokens);
      })
      .catch(error => {
        const msg =
          error instanceof Error
            ? error.message
            : t('register.alertNotVerifiedBody');
        Alert.alert(t('register.alertNotVerified'), msg);
      })
      .finally(() => setIsLoading(false));
  };

  const handleBackPress = () => {
    if (step === 'done') return;
    if (step === 'verification') {
      navigation.navigate('Login');
      return;
    }
    if (step === 'entry') {
      navigation.navigate('Language');
      return;
    }
    const i = FLOW_STEPS.indexOf(step);
    if (i > 0) setStep(FLOW_STEPS[i - 1]);
  };

  const titles: Record<Step, {title: string; sub: string}> = useMemo(
    () => ({
      entry: {
        title: t('register.stepEntryTitle'),
        sub: t('register.stepEntrySub'),
      },
      profile: {
        title: t('register.stepProfileTitle'),
        sub: t('register.stepProfileSub'),
      },
      gym: {
        title: t('register.stepGymTitle'),
        sub: t('register.stepGymSub'),
      },
      social: {
        title: t('register.stepTrainingTitle'),
        sub: t('register.stepTrainingSub'),
      },
      verification: {
        title: t('register.stepVerifyTitle'),
        sub: t('register.stepVerifySub', {
          email: email.trim() || '…',
        }),
      },
      done: {
        title: t('register.stepDoneTitle'),
        sub: t('register.stepDoneSub'),
      },
    }),
    [t, email],
  );

  const renderProgress = () => {
    if (!showProgress) return null;
    return (
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>
          {t('register.progressStep', {
            current: progressIndex + 2,
            total: ONBOARDING_TOTAL_STEPS,
          })}
        </Text>
      </View>
    );
  };

  const renderEntry = () => (
    <View style={styles.section}>
      <View style={[styles.card, shadows.sm]}>
        <TextInput
          style={styles.input}
          placeholder={t('register.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <View style={styles.passwordField}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder={t('register.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            autoComplete="password-new"
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowPassword(p => !p)}
            hitSlop={12}>
            <Animated.Text
              style={[
                styles.passwordToggleText,
                {
                  opacity: passwordToggleAnim,
                  transform: [
                    {
                      scale: passwordToggleAnim.interpolate({
                        inputRange: [0.6, 1],
                        outputRange: [0.94, 1],
                      }),
                    },
                  ],
                },
              ]}>
              {showPassword ? t('register.hidePassword') : t('register.showPassword')}
            </Animated.Text>
          </TouchableOpacity>
        </View>
      </View>
      {password.length > 0 && (
        <View style={styles.passwordHints}>
          {passwordErrors.length > 0 ? (
            passwordErrors.map((err, i) => (
              <View key={i} style={styles.hintRow}>
                <Icon name="close-circle" size={16} color={colors.error} />
                <Text style={styles.hintErr}>{err}</Text>
              </View>
            ))
          ) : (
            <View style={styles.hintRow}>
              <Icon name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={styles.hintOk}>{t('register.passwordStrong')}</Text>
            </View>
          )}
        </View>
      )}
      <OnboardingPrimaryButton
        label="Fortsæt"
        onPress={handleEntryContinue}
        disabled={!(password.length > 0 && passwordErrors.length === 0 && email.trim())}
      />
      <View style={styles.inlineLogin}>
        <Text style={styles.muted}>Har du allerede en konto? </Text>
        <Pressable
          onPress={() => navigation.navigate('Login')}
          hitSlop={12}
          style={({pressed}) => [styles.loginLinkWrap, pressed && styles.loginLinkPressed]}>
          <Text style={styles.link}>Log ind</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.section}>
      <View style={[styles.card, shadows.sm]}>
        <View style={styles.rowInputs}>
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder={t('register.firstName')}
            placeholderTextColor={colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
            textContentType="givenName"
            autoComplete="given-name"
          />
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Efternavn"
            placeholderTextColor={colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
            textContentType="familyName"
            autoComplete="family-name"
          />
        </View>
        <Text style={styles.blockTitleSmall}>{t('register.birthDate')}</Text>
        <TouchableOpacity
          style={[styles.input, styles.dobButton]}
          onPress={() => {
            setDobPickerDraft(new Date(dateOfBirth.getTime()));
            setShowDatePicker(true);
          }}
          activeOpacity={0.85}>
          <Text style={styles.dobButtonText}>
            {formatBirthDateLabel(
              showDatePicker && Platform.OS === 'ios' ? dobPickerDraft : dateOfBirth,
            )}
          </Text>
          <Icon name="calendar-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={[styles.helperMuted, styles.helperBelowDob]}>
          {t('register.birthDateRequired')}
        </Text>
        {showDatePicker && (
          <>
            <DateTimePicker
              value={Platform.OS === 'ios' ? dobPickerDraft : dateOfBirth}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') {
                  setShowDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setDateOfBirth(selectedDate);
                  }
                  return;
                }
                if (event.type === 'dismissed') {
                  return;
                }
                if (selectedDate) {
                  setDobPickerDraft(selectedDate);
                }
              }}
              minimumDate={(() => {
                const x = new Date();
                x.setFullYear(x.getFullYear() - 120);
                return x;
              })()}
              maximumDate={new Date()}
              locale={getIntlLocale(language)}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.datePickerDone}
                onPress={() => {
                  setDateOfBirth(new Date(dobPickerDraft.getTime()));
                  setShowDatePicker(false);
                }}
                activeOpacity={0.85}>
                <Text style={styles.datePickerDoneText}>{t('register.birthDatePick')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TextInput
          style={[
            styles.input,
            usernameAvailability.formatError || usernameAvailability.available === false
              ? styles.inputUsernameErr
              : usernameAvailability.available === true && !usernameAvailability.formatError
                ? styles.inputUsernameOk
                : null,
          ]}
          placeholder={t('register.username')}
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={t => setUsername(normalizeUsernameInput(t))}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          maxLength={20}
        />
        <Text style={styles.helperMuted}>
          {t('register.usernameRules')}
        </Text>
        {usernameAvailability.formatError ? (
          <View style={styles.usernameStatusRow}>
            <Icon name="close-circle" size={16} color={colors.error} />
            <Text style={styles.hintErr}>{usernameAvailability.formatError}</Text>
          </View>
        ) : usernameAvailability.checking && normalizeUsernameForStorage(username).length > 0 ? (
          <Text style={styles.helperMuted}>Tjekker …</Text>
        ) : usernameAvailability.available === false ? (
          <View style={styles.usernameStatusRow}>
            <Icon name="close-circle" size={16} color={colors.error} />
            <Text style={styles.hintErr}>{t('register.usernameTaken')}</Text>
          </View>
        ) : usernameAvailability.available === true ? (
          <View style={styles.usernameStatusRow}>
            <Icon name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.hintOk}>{t('register.usernameAvailable')}</Text>
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder={t('register.phone')}
          placeholderTextColor={colors.textMuted}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        <Text style={styles.helperMuted}>
          {t('register.phoneHint')}
        </Text>
      </View>
      <OnboardingPrimaryButton
        label={t('register.continue')}
        onPress={handleProfileContinue}
        disabled={!profileContinueEnabled}
      />
    </View>
  );

  const renderGym = () => (
    <View style={styles.section}>
      <OnboardingGymPicker
        allGyms={REG_PICKER_GYMS}
        favoriteGyms={favoriteGyms}
        favoriteGymLabels={favoriteGymLabels}
        onSelectGym={handleSelectGymAtIndex}
        onRemoveGym={handleRemoveGymAtIndex}
        selectedBiceps={selectedBiceps}
        onSelectBiceps={setSelectedBiceps}
        bicepsScaleRef={bicepsScaleRef}
      />
      <OnboardingPrimaryButton label={t('register.continue')} onPress={handleGymContinue} />
    </View>
  );

  const renderSocial = () => (
    <View style={styles.section}>
      <Pressable
        style={({pressed}) => [styles.photoRing, pressed && styles.photoRingPressed]}
        onPress={handlePhotoPick}>
        <View style={styles.photoRingGlow} pointerEvents="none" />
        {profilePhotoUri ? (
          <Image source={{uri: profilePhotoUri}} style={styles.photoImg} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialIcon name="camera-plus" size={44} color={colors.primary} />
            <Text style={styles.photoHint}>{t('register.addPhoto')}</Text>
          </View>
        )}
      </Pressable>
      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.inputLabel}>{t('register.trainingGoalLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t('register.trainingGoalPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={trainingGoal}
          onChangeText={setTrainingGoal}
          maxLength={120}
        />
        <Text style={styles.inputLabel}>{t('register.bioLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textArea, styles.textAreaTall]}
          placeholder={t('register.bioPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={bio}
          onChangeText={setBio}
          maxLength={200}
          multiline
        />
      </View>

      <View style={[styles.consentBlock, shadows.sm]}>
        <Text style={styles.consentBlockTitle}>{t('register.consentRequired')}</Text>
        <View style={styles.consentRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>{t('register.consentPrivacy')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')} hitSlop={8}>
              <Text style={styles.consentLink}>{t('register.consentPrivacyLink')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setPrivacyAccepted(!privacyAccepted)}
            hitSlop={12}
            accessibilityRole="checkbox"
            accessibilityState={{checked: privacyAccepted}}>
            <View style={[styles.checkBox, privacyAccepted && styles.checkBoxOn]}>
              {privacyAccepted ? <Icon name="checkmark" size={18} color={colors.white} /> : null}
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.consentRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>{t('register.consentTerms')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Terms')} hitSlop={8}>
              <Text style={styles.consentLink}>{t('register.consentTermsLink')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setTermsAccepted(!termsAccepted)}
            hitSlop={12}
            accessibilityRole="checkbox"
            accessibilityState={{checked: termsAccepted}}>
            <View style={[styles.checkBox, termsAccepted && styles.checkBoxOn]}>
              {termsAccepted ? <Icon name="checkmark" size={18} color={colors.white} /> : null}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.consentLocationSection}>
          <Text style={styles.consentHead}>{t('register.consentLocationTitle')}</Text>
          <Text style={styles.consentSub}>{t('register.consentLocationBody')}</Text>
          <View style={styles.locationCardInner}>
            {locationPermissionStatus === 'granted' ? (
              <View style={styles.locationSuccessBox}>
                <View style={styles.locationSuccessIcon}>
                  <Icon name="checkmark" size={20} color={colors.white} />
                </View>
                <View style={styles.locationStatusTextCol}>
                  <Text style={styles.locationStatusTitle}>
                    {t('register.consentLocationGranted')}
                  </Text>
                  <Text style={styles.locationStatusSub}>
                    {t('register.consentLocationGrantedSub')}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.locationStatusRow}>
                  <Icon name="location-outline" size={26} color={colors.primary} />
                  <View style={styles.locationStatusTextCol}>
                    <Text style={styles.locationStatusTitle}>
                      {t('register.consentLocationPrompt')}
                    </Text>
                    <Text style={styles.locationStatusSub}>
                      {t('register.consentLocationPromptSub')}
                    </Text>
                  </View>
                </View>
                <OnboardingPrimaryButton
                  label={t('register.consentAllowLocation')}
                  onPress={requestOnboardingLocation}
                  loading={locationRequesting}
                  style={styles.locationAllowBtnWrap}
                />
                {locationPermissionStatus === 'denied' ? (
                  <TouchableOpacity
                    style={styles.locationRetryBtn}
                    onPress={requestOnboardingLocation}
                    disabled={locationRequesting}
                    hitSlop={8}>
                    <Text style={styles.locationRetryText}>{t('common.retry')}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.consentBlock, shadows.sm]}>
        <Text style={styles.consentBlockTitle}>{t('register.consentOptional')}</Text>
        <View style={styles.switchRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>{t('register.consentMarketing')}</Text>
            <Text style={styles.consentSub}>{t('register.consentMarketingSub')}</Text>
          </View>
          <Switch
            value={marketingConsent}
            onValueChange={setMarketingConsent}
            trackColor={{false: colors.surface, true: colors.primary}}
            thumbColor={colors.white}
            ios_backgroundColor={colors.surface}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>{t('register.consentAnalytics')}</Text>
            <Text style={styles.consentSub}>{t('register.consentAnalyticsSub')}</Text>
          </View>
          <Switch
            value={analyticsConsent}
            onValueChange={setAnalyticsConsent}
            trackColor={{false: colors.surface, true: colors.primary}}
            thumbColor={colors.white}
            ios_backgroundColor={colors.surface}
          />
        </View>
      </View>

      <View style={styles.gdprMini}>
        <Text style={styles.gdprMiniText}>{t('register.consentGdpr')}</Text>
      </View>

      <OnboardingPrimaryButton
        label={t('register.acceptAndCreate')}
        onPress={handleCompleteRegistration}
        disabled={
          !privacyAccepted || !termsAccepted || locationPermissionStatus !== 'granted'
        }
        loading={isLoading}
      />
    </View>
  );

  const renderDone = () => (
    <View style={styles.doneSection}>
      <View style={styles.doneLogo}>
        <GymlyLogo size={88} />
      </View>
      <Text style={styles.doneTitle}>{t('register.doneTitle')}</Text>
      <Text style={styles.doneSub}>{t('register.doneSub')}</Text>
      <OnboardingPrimaryButton label={t('register.enterGymly')} onPress={handleEnterGymly} />
    </View>
  );

  const renderVerification = () => (
    <View style={styles.section}>
      <View style={styles.verifyHero}>
        <View style={styles.verifyHeroIcon}>
          <MaterialIcon name="email-check-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.verifyHeroText}>{t('register.verifyAlmost')}</Text>
      </View>
      <Text style={styles.verifyBlockLabel}>{t('register.verifyMail')}</Text>
      <View style={[styles.card, styles.verifyCard, shadows.sm]}>
        <TextInput
          style={[styles.input, styles.verifyEmailInput]}
          value={email}
          editable={false}
          selectTextOnFocus
        />
        <View style={styles.verifyLinks}>
          <Pressable
            style={({pressed}) => [styles.verifyLinkBtn, pressed && styles.verifyLinkBtnPressed]}
            onPress={async () => {
              try {
                await AuthService.resendEmailConfirmation(email.trim());
                Alert.alert(t('register.alertSent'), t('register.alertResent'));
              } catch (e: any) {
                Alert.alert(t('common.error'), e?.message || t('register.alertCouldNotSend'));
              }
            }}>
            <MaterialIcon name="refresh" size={18} color={colors.primary} />
            <Text style={styles.verifyLinkText}>{t('register.verifyResend')}</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.verifyLinkBtn, pressed && styles.verifyLinkBtnPressed]}
            onPress={() => Linking.openURL('mailto:')}>
            <MaterialIcon name="open-in-new" size={18} color={colors.primary} />
            <Text style={styles.verifyLinkText}>{t('register.verifyOpenMail')}</Text>
          </Pressable>
        </View>
      </View>

      <OnboardingPrimaryButton
        label={t('register.verifyConfirmed')}
        onPress={handleVerificationContinue}
        loading={isLoading}
        style={styles.verifyConfirmedBtn}
      />
    </View>
  );

  const renderBody = () => {
    switch (step) {
      case 'entry':
        return renderEntry();
      case 'profile':
        return renderProfile();
      case 'gym':
        return renderGym();
      case 'social':
        return renderSocial();
      case 'done':
        return renderDone();
      case 'verification':
        return renderVerification();
      default:
        return null;
    }
  };

  const showBack = step !== 'done';

  return (
    <View style={styles.screen}>
      <View style={styles.bgGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="registerBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ONBOARDING.bgTop} stopOpacity="1" />
              <Stop offset="0.55" stopColor="#FBFAFF" stopOpacity="1" />
              <Stop offset="1" stopColor={ONBOARDING.bgBottom} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#registerBg)" />
        </Svg>
      </View>
      {verificationSplashVisible ? (
        <Animated.View
          style={[styles.verificationSplashOverlay, {opacity: splashOpacity}]}
          pointerEvents="auto">
          <Animated.View
            style={[
              styles.verificationSplashRing,
              {
                opacity: splashRingOpacity,
                transform: [{scale: splashRingScale}],
              },
            ]}
          />
          <Animated.Image
            source={SPLASH_KETTLEBELL}
            resizeMode="contain"
            style={[
              styles.verificationSplashLogo,
              {transform: [{scale: splashLogoScale}]},
            ]}
          />
        </Animated.View>
      ) : null}
      {showBack ? (
        <Pressable
          style={[styles.backBtn, {top: insets.top + spacing.sm}]}
          onPress={handleBackPress}
          hitSlop={16}>
          <View style={styles.backBtnInner}>
            <MaterialIcon name="arrow-left" size={22} color={colors.text} />
          </View>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              flexGrow: 1,
              justifyContent: 'center',
              minHeight:
                Dimensions.get('window').height - insets.top - insets.bottom - 8,
              paddingTop: insets.top + 16,
              paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View
            style={{
              opacity: contentFade,
              transform: [
                {
                  translateY: contentFade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }}>
            {step !== 'done' ? (
              <Animated.View
                style={[
                  styles.logoWrap,
                  {
                    transform: [
                      {
                        translateY: logoFloat.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -5],
                        }),
                      },
                    ],
                  },
                ]}>
                <View style={styles.logoHalo}>
                  <GymlyLogo size={76} />
                </View>
              </Animated.View>
            ) : null}
            <View style={styles.formMax}>
              {renderProgress()}
              <Text style={styles.title}>{titles[step].title}</Text>
              <Text style={styles.subtitle}>{titles[step].sub}</Text>
              {renderBody()}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFFFFF'},
  bgGradientWrap: {...StyleSheet.absoluteFillObject},
  verificationSplashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationSplashRing: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primary + '18',
  },
  verificationSplashLogo: {
    width: 220,
    height: 220,
  },
  flex: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.xl,
  },
  formMax: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: spacing.sm,
    zIndex: 10,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrap: {alignItems: 'center', marginBottom: spacing.lg, marginTop: spacing.xs},
  logoHalo: {
    padding: spacing.md,
    borderRadius: 999,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  progressWrap: {marginBottom: spacing.lg},
  progressLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: ONBOARDING.progressTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.45,
        shadowRadius: 6,
      },
    }),
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    maxWidth: 320,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  section: {gap: spacing.lg},
  card: {
    backgroundColor: ONBOARDING.cardBg,
    borderRadius: ONBOARDING.cardRadius,
    padding: spacing.lg + 2,
    borderWidth: 1,
    borderColor: ONBOARDING.cardBorder,
    gap: spacing.md + 2,
    ...Platform.select({
      ios: {
        shadowColor: '#6B21A8',
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.06,
        shadowRadius: 20,
      },
      android: {elevation: 3},
    }),
  },
  rowInputs: {flexDirection: 'row', gap: spacing.md},
  input: {
    backgroundColor: ONBOARDING.inputBg,
    borderRadius: ONBOARDING.inputRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    borderWidth: 1,
    borderColor: ONBOARDING.inputBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {elevation: 1},
    }),
  },
  inputUsernameOk: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputUsernameErr: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  usernameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  inputHalf: {flex: 1},
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: -0.1,
  },
  textArea: {minHeight: 48, paddingTop: spacing.md + 2},
  textAreaTall: {minHeight: 88, textAlignVertical: 'top'},
  passwordField: {position: 'relative', justifyContent: 'center'},
  passwordInput: {paddingRight: 64},
  passwordToggle: {position: 'absolute', right: spacing.md, top: '50%', marginTop: -12},
  passwordToggleText: {color: colors.primary, fontSize: 14, fontWeight: '600'},
  passwordHints: {marginTop: -8},
  hintRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4},
  hintErr: {fontSize: 13, color: colors.error},
  hintOk: {fontSize: 13, color: colors.primary, fontWeight: '600'},
  helperMuted: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  inlineLogin: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  loginLinkWrap: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  loginLinkPressed: {backgroundColor: 'rgba(139, 92, 246, 0.1)'},
  muted: {color: colors.textSecondary, fontSize: 15, fontWeight: '500'},
  link: {color: colors.primary, fontSize: 15, fontWeight: '800'},
  blockTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  consentLocationSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  locationCardInner: {
    backgroundColor: ONBOARDING.lavenderTint,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: ONBOARDING.lavenderTintBorder,
    gap: spacing.md,
  },
  locationSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.22)',
  },
  locationSuccessIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
    }),
  },
  locationStatusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  locationStatusTextCol: {flex: 1},
  locationStatusTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  locationStatusSub: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  locationAllowBtnWrap: {marginTop: 0},
  locationRetryBtn: {alignSelf: 'center', paddingVertical: spacing.xs},
  locationRetryText: {color: colors.primary, fontSize: 15, fontWeight: '600'},
  blockTitleSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    letterSpacing: -0.2,
  },
  dobButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F7FC',
    borderColor: ONBOARDING.inputBorderFocus,
  },
  dobButtonText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  datePickerDone: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  datePickerDoneText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  helperBelowDob: {marginBottom: spacing.sm},
  sectionMiniTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.md,
    letterSpacing: -0.3,
  },
  regionSegment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: '#F3F0FA',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: ONBOARDING.chipBorder,
    backgroundColor: ONBOARDING.chipBg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
    }),
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: {elevation: 3},
    }),
  },
  chipText: {fontSize: 15, color: colors.textSecondary, fontWeight: '600'},
  chipTextActive: {color: colors.primaryDark, fontWeight: '800'},
  bicepsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center'},
  bicepsPress: {borderRadius: 28},
  bicepsChip: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E7E2F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bicepsChipActive: {
    borderColor: colors.primary,
    borderWidth: 3,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
    }),
  },
  bicepsEmoji: {fontSize: 30},
  gymFieldWrap: {marginBottom: spacing.md, zIndex: 2},
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: ONBOARDING.inputBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  gymRowFilled: {
    borderColor: 'rgba(139, 92, 246, 0.35)',
    backgroundColor: '#FDFCFF',
  },
  gymIndexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymIndex: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  gymInput: {flex: 1},
  gymInputInCard: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    ...Platform.select({
      ios: {shadowOpacity: 0},
      android: {elevation: 0},
    }),
  },
  suggestions: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: {flex: 1},
  suggestionTitle: {fontSize: 15, fontWeight: '600', color: colors.text},
  suggestionSub: {fontSize: 13, color: colors.textSecondary},
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  toggleTextCol: {flex: 1},
  toggleTitle: {fontSize: 15, fontWeight: '700', color: colors.text},
  toggleSub: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  photoRing: {
    alignSelf: 'center',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    overflow: 'hidden',
    backgroundColor: '#FAF8FF',
    marginBottom: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.14,
        shadowRadius: 22,
      },
      android: {elevation: 4},
    }),
  },
  photoRingPressed: {opacity: 0.92, transform: [{scale: 0.98}]},
  photoRingGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 84,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
  },
  photoImg: {width: '100%', height: '100%'},
  photoPlaceholder: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md},
  photoHint: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
  },
  skipBtn: {alignItems: 'center', paddingVertical: spacing.md, marginTop: -spacing.xs},
  skipText: {color: colors.textMuted, fontSize: 14, fontWeight: '600', letterSpacing: 0.2},
  consentBlock: {
    backgroundColor: ONBOARDING.cardBg,
    borderRadius: ONBOARDING.cardRadius,
    padding: spacing.lg + 2,
    borderWidth: 1,
    borderColor: ONBOARDING.cardBorder,
    gap: spacing.md + 2,
    ...Platform.select({
      ios: {
        shadowColor: '#6B21A8',
        shadowOffset: {width: 0, height: 6},
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      android: {elevation: 2},
    }),
  },
  consentBlockTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  consentCopy: {flex: 1},
  consentHead: {fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4},
  consentSub: {fontSize: 13, color: colors.textSecondary, lineHeight: 18},
  consentLink: {fontSize: 14, fontWeight: '600', color: colors.primary},
  checkBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFE',
  },
  checkBoxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#EEEAF9',
  },
  gdprMini: {paddingHorizontal: spacing.xs},
  privacyCtaDock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  backBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {elevation: 2},
    }),
  },
  gdprMiniText: {fontSize: 12, color: colors.textMuted, lineHeight: 18},
  doneSection: {alignItems: 'center', paddingTop: spacing.md},
  doneLogo: {marginBottom: spacing.lg},
  doneTitle: {fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm},
  doneSub: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  verifyHero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  verifyHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  verifyHeroText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: -0.1,
  },
  verifyCard: {marginTop: spacing.xs},
  verifyEmailInput: {fontWeight: '600', color: colors.text},
  verifyBlockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: spacing.sm,
  },
  verifyLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.14)',
  },
  verifyLinkBtnPressed: {opacity: 0.85, backgroundColor: 'rgba(139, 92, 246, 0.14)'},
  verifyLinkText: {fontSize: 14, fontWeight: '700', color: colors.primary},
  verifyBlockLabelSpaced: {marginTop: spacing.lg},
  verifyHintShort: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  verifyHintBold: {fontWeight: '700', color: colors.text},
  verifyOtpLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  verifyRowBtns: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm},
  secondaryBtn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
  },
  secondaryBtnPrimary: {
    backgroundColor: colors.primary + '14',
    borderColor: colors.primary,
  },
  secondaryBtnText: {fontSize: 14, fontWeight: '600', color: colors.primaryDark},
  secondaryBtnTextPrimary: {fontSize: 14, fontWeight: '700', color: colors.primaryDark},
  verifyConfirmedBtn: {marginTop: spacing.md},
  verifyLinks: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md},
});

export default RegisterScreen;
