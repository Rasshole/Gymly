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
  PermissionsAndroid,
  Linking,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import GymlyLogo from '@/components/GymlyLogo';
import danishGyms, {DanishGym, DanishRegion} from '@/data/danishGyms';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import * as streak from '@/utils/streakUtils';
import Geolocation, {
  type GeolocationError,
  type GeolocationResponse,
} from '@react-native-community/geolocation';

const SPLASH_KETTLEBELL = require('@/assets/images/splash-kettlebell.png');

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;
type Step =
  | 'entry'
  | 'profile'
  | 'gym'
  | 'social'
  | 'privacy'
  | 'done'
  | 'verification';

const FLOW_STEPS: Step[] = ['entry', 'profile', 'gym', 'social', 'privacy'];
const PROGRESS_TOTAL = 5;

const regionOptions: DanishRegion[] = ['København', 'Sjælland', 'Fyn', 'Jylland'];

const GEO_PERMISSION_DENIED = 1;
const GEO_OPTS_ONBOARD = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
};

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const {login} = useAppStore();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>('entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 25);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [location, setLocation] = useState<DanishRegion | ''>('');
  const [favoriteGyms, setFavoriteGyms] = useState<(DanishGym | null)[]>([null, null, null]);
  const [favoriteGymLabels, setFavoriteGymLabels] = useState<string[]>(['', '', '']);
  const [activeGymIndex, setActiveGymIndex] = useState<number | null>(null);
  const [showGymSuggestions, setShowGymSuggestions] = useState(false);
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

  const bicepsOptions = ['💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿', '🦾'];

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const normalizeSearchValue = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,/]/g, ' ')
      .toLowerCase();

  const gymSuggestions = useMemo(() => {
    const activeLabel =
      activeGymIndex !== null ? favoriteGymLabels[activeGymIndex] : '';
    const trimmed = activeLabel.trim();
    if (!showGymSuggestions || activeGymIndex === null || trimmed.length === 0) {
      return [];
    }
    const normalizedQuery = normalizeSearchValue(trimmed);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const filtered = danishGyms.filter(option => {
      if (tokens.length === 0) return true;
      const haystack = normalizeSearchValue(
        `${option.name} ${option.city ?? ''} ${option.region} ${option.address ?? ''}`,
      );
      return tokens.every(token => haystack.includes(token));
    });
    return filtered.slice(0, 10);
  }, [favoriteGymLabels, showGymSuggestions, activeGymIndex]);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push('Mindst 8 tegn');
    if (!/[A-Z]/.test(pwd)) errors.push('Mindst ét stort bogstav');
    if (!/[a-z]/.test(pwd)) errors.push('Mindst ét lille bogstav');
    if (!/[0-9]/.test(pwd)) errors.push('Mindst ét tal');
    return errors;
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setPasswordErrors(text.length > 0 ? validatePassword(text) : []);
  };

  const formatBirthDateLabel = (d: Date) =>
    d.toLocaleDateString('da-DK', {day: '2-digit', month: 'long', year: 'numeric'});

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
    if (age < 13) return 'Du skal være mindst 13 år.';
    if (age > 120) return 'Tjek venligst fødselsdatoen.';
    return null;
  };

  const handleEntryContinue = () => {
    if (!email.trim()) {
      Alert.alert('Email', 'Indtast din email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Email', 'Tjek venligst din email.');
      return;
    }
    const err = validatePassword(password);
    if (err.length) {
      Alert.alert('Adgangskode', err.join('\n'));
      return;
    }
    setStep('profile');
  };

  const handleProfileContinue = () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Navn', 'Udfyld fornavn og efternavn.');
      return;
    }
    const dobErr = validateBirthDate(dateOfBirth);
    if (dobErr) {
      Alert.alert('Fødselsdato', dobErr);
      return;
    }
    if (!username.trim()) {
      Alert.alert('Brugernavn', 'Vælg et brugernavn.');
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert('Brugernavn', 'Mindst 3 tegn.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      Alert.alert('Brugernavn', 'Kun bogstaver, tal og _.');
      return;
    }
    if (!isValidDanishMobile(phoneNumber)) {
      Alert.alert(
        'Telefon',
        'Indtast et gyldigt dansk mobilnummer (8 cifre, fx 12 34 56 78 eller +45 12 34 56 78).',
      );
      return;
    }
    setStep('gym');
  };

  const handleSelectRegion = (region: DanishRegion) => {
    setLocation(region);
    setFavoriteGyms([null, null, null]);
    setFavoriteGymLabels(['', '', '']);
    setActiveGymIndex(null);
    setShowGymSuggestions(false);
  };

  const handleSelectGymSuggestion = (gym: DanishGym) => {
    const displayLabel = [gym.name, gym.city].filter(Boolean).join(', ');
    if (activeGymIndex !== null) {
      setFavoriteGyms(prev => {
        const next = [...prev];
        next[activeGymIndex] = gym;
        return next;
      });
      setFavoriteGymLabels(prev => {
        const next = [...prev];
        next[activeGymIndex] = displayLabel;
        return next;
      });
    }
    setLocation(gym.region);
    setActiveGymIndex(null);
    setShowGymSuggestions(false);
  };

  const markLocationGranted = useCallback(() => {
    setLocationPermissionStatus('granted');
  }, []);

  const onGeolocationFailure = useCallback((error: GeolocationError) => {
    const denied = error?.code === GEO_PERMISSION_DENIED;
    if (denied) {
      setLocationPermissionStatus('denied');
      Alert.alert(
        'Lokation',
        'Gymly har brug for adgang til din placering. Tillad lokation i systemets dialog, eller slå den til under Indstillinger → Gymly.',
        [
          {text: 'OK'},
          {text: 'Åbn indstillinger', onPress: () => Linking.openSettings()},
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
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Placeringsadgang',
            message:
              'Gymly bruger din placering til at vise centre og når du tjekker ind ved et center.',
            buttonNeutral: 'Senere',
            buttonNegative: 'Annuller',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationPermissionStatus('denied');
          finish();
          Alert.alert(
            'Lokation påkrævet',
            'Tillad placering for at bruge Gymly — du kan ændre det senere under Indstillinger.',
            [
              {text: 'OK'},
              {text: 'Åbn indstillinger', onPress: () => Linking.openSettings()},
            ],
          );
          return;
        }
        Geolocation.getCurrentPosition(onPosOk, onPosErr, GEO_OPTS_ONBOARD);
        return;
      }

      Geolocation.requestAuthorization(
        () => {
          Geolocation.getCurrentPosition(onPosOk, onPosErr, GEO_OPTS_ONBOARD);
        },
        () => {
          Geolocation.getCurrentPosition(onPosOk, onPosErr, GEO_OPTS_ONBOARD);
        },
      );
    } catch {
      finish();
    }
  }, [markLocationGranted, onGeolocationFailure]);

  const handleGymContinue = () => {
    const firstGymLabel = favoriteGymLabels[0].trim();
    if (!location || !firstGymLabel) {
      Alert.alert('Center', 'Vælg region og dit primære træningscenter.');
      return;
    }
    if (!selectedBiceps) {
      Alert.alert('Biceps', 'Vælg din biceps emoji.');
      return;
    }
    setShowGymSuggestions(false);
    setActiveGymIndex(null);
    setStep('social');
  };

  const handlePhotoPick = () => {
    Alert.alert('Profilbillede', 'Hvordan vil du tilføje et billede?', [
      {
        text: 'Tag billede',
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
        text: 'Vælg fra bibliotek',
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
      {text: 'Annuller', style: 'cancel'},
    ]);
  };

  const handleSocialContinue = () => setStep('privacy');

  const buildFavoriteGymIds = (): number[] => {
    const ids: number[] = [];
    favoriteGymLabels.forEach((label, index) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const selected = favoriteGyms[index];
      const gymId =
        selected?.id ??
        danishGyms.find(
          g =>
            g.name.toLowerCase().includes(trimmed.toLowerCase()) ||
            (g.city && g.city.toLowerCase().includes(trimmed.toLowerCase())),
        )?.id;
      if (gymId && !ids.includes(gymId)) ids.push(gymId);
    });
    return ids;
  };

  const handleCompleteRegistration = async () => {
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert('Påkrævet', 'Accepter privatlivspolitik og servicevilkår.');
      return;
    }
    if (locationPermissionStatus !== 'granted') {
      Alert.alert(
        'Lokation',
        'Tillad brug af placering under «Påkrævet» — tryk «Tillad lokation» og bekræft i systemets dialog.',
      );
      return;
    }
    const dobErr = validateBirthDate(dateOfBirth);
    if (dobErr) {
      Alert.alert('Fødselsdato', dobErr);
      return;
    }

    setIsLoading(true);
    try {
      const favoriteGymIds = buildFavoriteGymIds();
      const birthYear = dateOfBirth.getFullYear();
      const dateOfBirthIso = streak.getLocalDateString(dateOfBirth);
      const phoneNormalized = normalizeDanishPhone(phoneNumber);
      if (!phoneNormalized) {
        Alert.alert('Telefon', 'Ugyldigt mobilnummer.');
        setIsLoading(false);
        return;
      }

      const {user, tokens, needsEmailConfirmation} = await AuthService.register({
        email: email.trim(),
        username: username.trim(),
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
      if (!tokens) throw new Error('Kunne ikke fuldføre registrering.');
      setPendingAuth({user, tokens});
      setStep('done');
    } catch (error: any) {
      Alert.alert('Registrering fejlede', error.message || 'Prøv igen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterGymly = () => {
    if (!pendingAuth) return;
    login(pendingAuth.user, pendingAuth.tokens);
    setPendingAuth(null);
  };

  useEffect(
    () => () => {
      if (splashFinishTimerRef.current) {
        clearTimeout(splashFinishTimerRef.current);
        splashFinishTimerRef.current = null;
      }
    },
    [],
  );

  const startVerificationSplashThenLogin = useCallback(
    (user: User, tokens: AuthTokens) => {
      if (splashFinishTimerRef.current) {
        clearTimeout(splashFinishTimerRef.current);
        splashFinishTimerRef.current = null;
      }
      setVerificationSplashVisible(true);
      splashOpacity.setValue(0);
      splashLogoScale.setValue(0.45);
      splashRingScale.setValue(0.6);
      splashRingOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashRingOpacity, {
          toValue: 0.55,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(splashLogoScale, {
          toValue: 1,
          friction: 6,
          tension: 110,
          useNativeDriver: true,
        }),
        Animated.timing(splashRingScale, {
          toValue: 1.35,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        splashFinishTimerRef.current = setTimeout(() => {
          splashFinishTimerRef.current = null;
          setVerificationSplashVisible(false);
          login(user, tokens);
        }, 420);
      });
    },
    [login, splashLogoScale, splashOpacity, splashRingOpacity, splashRingScale],
  );

  const handleVerificationContinue = () => {
    if (!email.trim() || !password) {
      Alert.alert('Info mangler', 'Brug email og adgangskode til login.');
      return;
    }
    setIsLoading(true);
    AuthService.login({email: email.trim(), password})
      .then(({user, tokens}) => {
        if (tokens) {
          startVerificationSplashThenLogin(user, tokens);
        } else {
          Alert.alert('Login fejlede', 'Prøv igen.');
        }
      })
      .catch(error => {
        Alert.alert('Ikke bekræftet endnu', error?.message || 'Bekræft din email.');
      })
      .finally(() => setIsLoading(false));
  };

  const progressIndex = FLOW_STEPS.indexOf(step);
  const showProgress = progressIndex >= 0;

  const handleBackPress = () => {
    if (step === 'done') return;
    if (step === 'verification') {
      navigation.navigate('Login');
      return;
    }
    if (step === 'entry') {
      navigation.navigate('Login');
      return;
    }
    const i = FLOW_STEPS.indexOf(step);
    if (i > 0) setStep(FLOW_STEPS[i - 1]);
  };

  const titles: Record<Step, {title: string; sub: string}> = {
    entry: {
      title: 'Kom i gang',
      sub: 'Opret din konto og kom med i fællesskabet.',
    },
    profile: {
      title: 'Din profil',
      sub: 'Så andre kan finde dig på Gymly.',
    },
    gym: {
      title: 'Dit træningssted',
      sub: 'Region, center og den biceps der passer til dig.',
    },
    social: {
      title: 'Gør profilen din',
      sub: 'Valgfrit — du kan altid ændre det senere.',
    },
    privacy: {
      title: 'Samtykke',
      sub: 'Kort og tydeligt. Du bestemmer over dine data.',
    },
    verification: {
      title: 'Bekræft din konto',
      sub: `Vi har sendt et link til ${email.trim() || 'din mail'}.`,
    },
    done: {
      title: 'Velkommen',
      sub: 'Du er klar til at bruge Gymly.',
    },
  };

  const renderProgress = () => {
    if (!showProgress) return null;
    const pct = ((progressIndex + 1) / PROGRESS_TOTAL) * 100;
    return (
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>
          Trin {progressIndex + 1} af {PROGRESS_TOTAL}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {width: `${pct}%`}]} />
        </View>
      </View>
    );
  };

  const renderEntry = () => (
    <View style={styles.section}>
      <View style={[styles.card, shadows.sm]}>
        <TextInput
          style={styles.input}
          placeholder="Email"
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
            placeholder="Adgangskode"
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
            <Text style={styles.passwordToggleText}>{showPassword ? 'Skjul' : 'Vis'}</Text>
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
              <Text style={styles.hintOk}>Adgangskoden er stærk nok</Text>
            </View>
          )}
        </View>
      )}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleEntryContinue} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>Fortsæt</Text>
      </TouchableOpacity>
      <View style={styles.inlineLogin}>
        <Text style={styles.muted}>Har du allerede en konto? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.link}>Log ind</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.section}>
      <View style={[styles.card, shadows.sm]}>
        <View style={styles.rowInputs}>
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Fornavn"
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
        <Text style={styles.blockTitleSmall}>Fødselsdato</Text>
        <TouchableOpacity
          style={[styles.input, styles.dobButton]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.85}>
          <Text style={styles.dobButtonText}>{formatBirthDateLabel(dateOfBirth)}</Text>
          <Icon name="calendar-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={[styles.helperMuted, styles.helperBelowDob]}>
          Påkrævet — du skal være mindst 13 år
        </Text>
        {showDatePicker && (
          <>
            <DateTimePicker
              value={dateOfBirth}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') {
                  setShowDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setDateOfBirth(selectedDate);
                  }
                } else if (selectedDate) {
                  setDateOfBirth(selectedDate);
                }
              }}
              minimumDate={(() => {
                const x = new Date();
                x.setFullYear(x.getFullYear() - 120);
                return x;
              })()}
              maximumDate={new Date()}
              locale="da-DK"
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.datePickerDone}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.85}>
                <Text style={styles.datePickerDoneText}>Vælg</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TextInput
          style={styles.input}
          placeholder="Brugernavn"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={t => setUsername(t.replace(/\s/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          maxLength={20}
        />
        <Text style={styles.helperMuted}>Bogstaver, tal og _ · synligt for andre</Text>
        <TextInput
          style={styles.input}
          placeholder="Mobilnummer (påkrævet)"
          placeholderTextColor={colors.textMuted}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        <Text style={styles.helperMuted}>
          Dansk mobil — 8 cifre (fx 12 34 56 78 eller +45 12 34 56 78)
        </Text>
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleProfileContinue} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>Fortsæt</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGym = () => (
    <View style={styles.section}>
      <Text style={styles.blockTitle}>Region</Text>
      <View style={styles.chipWrap}>
        {regionOptions.map(region => (
          <TouchableOpacity
            key={region}
            style={[styles.chip, location === region && styles.chipActive]}
            onPress={() => handleSelectRegion(region)}
            activeOpacity={0.85}>
            <Text style={[styles.chipText, location === region && styles.chipTextActive]}>{region}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.blockTitle}>Dine centre</Text>
      <Text style={styles.helperMuted}>Mindst ét center — søg efter navn eller by</Text>
      {favoriteGymLabels.map((label, index) => {
        const isActive = activeGymIndex === index;
        return (
          <View key={`gym_${index}`} style={styles.gymFieldWrap}>
            <View style={styles.gymRow}>
              <Text style={styles.gymIndex}>{index + 1}</Text>
              <TextInput
                style={[styles.input, styles.gymInput]}
                placeholder={index === 0 ? 'Primært center *' : 'Valgfrit center'}
                placeholderTextColor={colors.textMuted}
                value={label}
                onFocus={() => {
                  setActiveGymIndex(index);
                  setShowGymSuggestions(true);
                  setTimeout(() => scrollRef.current?.scrollTo({y: 260, animated: true}), 80);
                }}
                onChangeText={value => {
                  setFavoriteGymLabels(prev => {
                    const n = [...prev];
                    n[index] = value;
                    return n;
                  });
                  setFavoriteGyms(prev => {
                    const n = [...prev];
                    n[index] = null;
                    return n;
                  });
                  setActiveGymIndex(index);
                  setShowGymSuggestions(value.trim().length > 0);
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {isActive && showGymSuggestions && gymSuggestions.length > 0 && (
              <View style={[styles.suggestions, shadows.md]}>
                {gymSuggestions.map(option => (
                  <TouchableOpacity
                    key={`${index}_${option.id}`}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectGymSuggestion(option)}>
                    <MaterialIcon name="map-marker-radius" size={18} color={colors.primary} />
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionTitle}>{option.name}</Text>
                      <Text style={styles.suggestionSub}>{option.city}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
      <Text style={styles.sectionMiniTitle}>Din biceps</Text>
      <View style={styles.bicepsRow}>
        {bicepsOptions.map(emoji => (
          <TouchableOpacity
            key={emoji}
            style={[styles.bicepsChip, selectedBiceps === emoji && styles.bicepsChipActive]}
            onPress={() => setSelectedBiceps(emoji)}
            activeOpacity={0.85}>
            <Text style={styles.bicepsEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleGymContinue} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>Fortsæt</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSocial = () => (
    <View style={styles.section}>
      <TouchableOpacity style={styles.photoRing} onPress={handlePhotoPick} activeOpacity={0.9}>
        {profilePhotoUri ? (
          <Image source={{uri: profilePhotoUri}} style={styles.photoImg} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialIcon name="camera-plus" size={40} color={colors.primary} />
            <Text style={styles.photoHint}>Tilføj foto</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.inputLabel}>Hvad træner du for? (valgfrit)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Fx disciplin, styrke, community…"
          placeholderTextColor={colors.textMuted}
          value={trainingGoal}
          onChangeText={setTrainingGoal}
          maxLength={120}
        />
        <Text style={styles.inputLabel}>Kort bio (valgfrit)</Text>
        <TextInput
          style={[styles.input, styles.textArea, styles.textAreaTall]}
          placeholder="Én kort linje om dig"
          placeholderTextColor={colors.textMuted}
          value={bio}
          onChangeText={setBio}
          maxLength={200}
          multiline
        />
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleSocialContinue} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>Fortsæt</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSocialContinue} style={styles.skipBtn}>
        <Text style={styles.skipText}>Spring over</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPrivacy = () => (
    <View style={styles.section}>
      <View style={[styles.consentBlock, shadows.sm]}>
        <Text style={styles.consentBlockTitle}>Påkrævet</Text>
        <View style={styles.consentRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>Privatlivspolitik</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')} hitSlop={8}>
              <Text style={styles.consentLink}>Læs politikken</Text>
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
            <Text style={styles.consentHead}>Servicevilkår</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Terms')} hitSlop={8}>
              <Text style={styles.consentLink}>Læs vilkår</Text>
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
          <Text style={styles.consentHead}>Placering</Text>
          <Text style={styles.consentSub}>
            Gymly bruger din placering til at vise centre og når du tjekker ind ved et center.
          </Text>
          <View style={styles.locationCardInner}>
            {locationPermissionStatus === 'granted' ? (
              <View style={styles.locationStatusRow}>
                <Icon name="checkmark-circle" size={26} color={colors.primary} />
                <View style={styles.locationStatusTextCol}>
                  <Text style={styles.locationStatusTitle}>Lokation tilladt</Text>
                  <Text style={styles.locationStatusSub}>Du kan oprette din konto.</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.locationStatusRow}>
                  <Icon name="location-outline" size={26} color={colors.primary} />
                  <View style={styles.locationStatusTextCol}>
                    <Text style={styles.locationStatusTitle}>Tillad brug af lokation</Text>
                    <Text style={styles.locationStatusSub}>
                      Tryk herunder — du får en systemdialog om placering.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.locationAllowBtn,
                    locationRequesting && styles.primaryBtnDisabled,
                  ]}
                  onPress={requestOnboardingLocation}
                  disabled={locationRequesting}
                  activeOpacity={0.9}>
                  {locationRequesting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.locationAllowBtnText}>Tillad lokation</Text>
                  )}
                </TouchableOpacity>
                {locationPermissionStatus === 'denied' ? (
                  <TouchableOpacity
                    style={styles.locationRetryBtn}
                    onPress={requestOnboardingLocation}
                    disabled={locationRequesting}
                    hitSlop={8}>
                    <Text style={styles.locationRetryText}>Prøv igen</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
      <View style={[styles.consentBlock, shadows.sm]}>
        <Text style={styles.consentBlockTitle}>Valgfrit</Text>
        <View style={styles.switchRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>Nyheder fra Gymly</Text>
            <Text style={styles.consentSub}>Tips og opdateringer</Text>
          </View>
          <Switch
            value={marketingConsent}
            onValueChange={setMarketingConsent}
            trackColor={{false: colors.surface, true: colors.primaryLight}}
            thumbColor={colors.white}
            ios_backgroundColor={colors.surface}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.consentCopy}>
            <Text style={styles.consentHead}>Anonymiseret analyse</Text>
            <Text style={styles.consentSub}>Hjælper os med at forbedre appen</Text>
          </View>
          <Switch
            value={analyticsConsent}
            onValueChange={setAnalyticsConsent}
            trackColor={{false: colors.surface, true: colors.primaryLight}}
            thumbColor={colors.white}
            ios_backgroundColor={colors.surface}
          />
        </View>
      </View>
      <View style={styles.gdprMini}>
        <Text style={styles.gdprMiniText}>
          Under GDPR har du bl.a. ret til indsigt, sletning og dataportabilitet.
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (!privacyAccepted ||
            !termsAccepted ||
            locationPermissionStatus !== 'granted' ||
            isLoading) &&
            styles.primaryBtnDisabled,
        ]}
        onPress={handleCompleteRegistration}
        disabled={
          !privacyAccepted ||
          !termsAccepted ||
          locationPermissionStatus !== 'granted' ||
          isLoading
        }
        activeOpacity={0.9}>
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Accepter og fortsæt</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderDone = () => (
    <View style={styles.doneSection}>
      <View style={styles.doneLogo}>
        <GymlyLogo size={88} />
      </View>
      <Text style={styles.doneTitle}>Du er klar</Text>
      <Text style={styles.doneSub}>Lad os åbne Gymly sammen.</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleEnterGymly} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>Åbn Gymly</Text>
      </TouchableOpacity>
    </View>
  );

  const renderVerification = () => (
    <View style={styles.section}>
      <Text style={styles.verifyBlockLabel}>Mail</Text>
      <View style={[styles.card, shadows.sm]}>
        <TextInput style={styles.input} value={email} editable={false} />
        <View style={styles.verifyLinks}>
          <TouchableOpacity
            onPress={async () => {
              try {
                await AuthService.resendEmailConfirmation(email.trim());
                Alert.alert('Sendt', 'Vi har sendt linket igen.');
              } catch (e: any) {
                Alert.alert('Fejl', e?.message || 'Kunne ikke sende.');
              }
            }}>
            <Text style={styles.link}>Send link igen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:')}>
            <Text style={styles.link}>Åbn mail</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          styles.verifyConfirmedBtn,
          isLoading && styles.primaryBtnDisabled,
        ]}
        onPress={handleVerificationContinue}
        disabled={isLoading}
        activeOpacity={0.9}>
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Jeg har bekræftet</Text>
        )}
      </TouchableOpacity>
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
      case 'privacy':
        return renderPrivacy();
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
        <TouchableOpacity
          style={[styles.backBtn, {top: insets.top + spacing.sm}]}
          onPress={handleBackPress}
          hitSlop={16}
          activeOpacity={0.7}>
          <MaterialIcon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
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
              paddingTop: insets.top + 48,
              paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {step !== 'done' ? (
            <View style={styles.logoWrap}>
              {/* ~20% mindre end 72; hvid skærm så PNG’ets hvide felt smelter sammen */}
              <GymlyLogo size={58} />
            </View>
          ) : null}
          {renderProgress()}
          <Text style={styles.title}>{titles[step].title}</Text>
          <Text style={styles.subtitle}>{titles[step].sub}</Text>
          {renderBody()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.backgroundLight},
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
  backBtn: {
    position: 'absolute',
    left: spacing.sm,
    zIndex: 10,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrap: {alignItems: 'center', marginBottom: spacing.xl + 4},
  progressWrap: {marginBottom: spacing.lg},
  progressLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {height: '100%', borderRadius: 2, backgroundColor: colors.primary},
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  section: {gap: spacing.lg},
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  rowInputs: {flexDirection: 'row', gap: spacing.md},
  input: {
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputHalf: {flex: 1},
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: -4,
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
  helperMuted: {fontSize: 13, color: colors.textMuted, marginTop: -4},
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  primaryBtnDisabled: {opacity: 0.45},
  primaryBtnText: {color: colors.white, fontSize: 17, fontWeight: '700'},
  inlineLogin: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm},
  muted: {color: colors.textSecondary, fontSize: 15},
  link: {color: colors.primary, fontSize: 15, fontWeight: '700'},
  blockTitle: {fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm},
  consentLocationSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  locationCardInner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  locationStatusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  locationStatusTextCol: {flex: 1},
  locationStatusTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  locationStatusSub: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  locationAllowBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  locationAllowBtnText: {color: colors.white, fontSize: 16, fontWeight: '700'},
  locationRetryBtn: {alignSelf: 'center', paddingVertical: spacing.xs},
  locationRetryText: {color: colors.primary, fontSize: 15, fontWeight: '600'},
  blockTitleSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  dobButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dobButtonText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
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
  sectionMiniTitle: {fontSize: 15, fontWeight: '700', color: colors.text},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  chipText: {fontSize: 15, color: colors.text, fontWeight: '500'},
  chipTextActive: {color: colors.primaryDark, fontWeight: '700'},
  bicepsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center'},
  bicepsChip: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundCard,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bicepsChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  bicepsEmoji: {fontSize: 28},
  gymFieldWrap: {marginBottom: spacing.sm, zIndex: 2},
  gymRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  gymIndex: {
    width: 24,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  gymInput: {flex: 1},
  suggestions: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
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
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 3,
    borderColor: colors.primaryLight,
    overflow: 'hidden',
    backgroundColor: colors.backgroundCard,
  },
  photoImg: {width: '100%', height: '100%'},
  photoPlaceholder: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md},
  photoHint: {marginTop: spacing.sm, fontSize: 13, color: colors.textSecondary, textAlign: 'center'},
  skipBtn: {alignItems: 'center', paddingVertical: spacing.sm},
  skipText: {color: colors.primary, fontSize: 15, fontWeight: '600'},
  consentBlock: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
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
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBoxOn: {backgroundColor: colors.primary},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gdprMini: {paddingHorizontal: spacing.xs},
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
  verifyBlockLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
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
  verifyConfirmedBtn: {marginTop: spacing.lg},
  verifyLinks: {flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm},
});

export default RegisterScreen;
