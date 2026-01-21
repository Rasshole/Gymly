/**
 * Register Screen
 */

import React, {useMemo, useRef, useState, useCallback} from 'react';
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
  Linking,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/AuthNavigator';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import GymlyLogo from '@/components/GymlyLogo';
import danishGyms, {DanishGym, DanishRegion} from '@/data/danishGyms';
import {colors} from '@/theme/colors';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;
type Step = 'method' | 'names' | 'email' | 'password' | 'location' | 'verification' | 'username' | 'photo';
type RegistrationMethod = 'apple' | 'google' | 'email';

type SocialButtonProps = {
  icon: string;
  label: string;
  backgroundColor: string;
  textColor?: string;
  onPress: () => void;
  loading?: boolean;
};

const SocialButton = ({
  icon,
  label,
  backgroundColor,
  textColor = '#fff',
  onPress,
  loading = false,
}: SocialButtonProps) => (
  <TouchableOpacity
    style={[
      styles.socialButton,
      {backgroundColor},
      loading && styles.socialButtonDisabled,
    ]}
    activeOpacity={0.85}
    onPress={onPress}
    disabled={loading}>
    {loading ? (
      <ActivityIndicator size="small" color={textColor} style={styles.socialIcon} />
    ) : (
      <MaterialIcon name={icon} size={22} color={textColor} style={styles.socialIcon} />
    )}
    <Text style={[styles.socialLabel, {color: textColor}]}>{label}</Text>
    <View style={styles.socialSpacer} />
  </TouchableOpacity>
);

const stepOrder: Step[] = [
  'method',
  'names',
  'email',
  'password',
  'location',
  'username',
  'photo',
  'verification',
];

const regionOptions: DanishRegion[] = ['København', 'Sjælland', 'Fyn', 'Jylland'];

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const {login} = useAppStore();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<RegistrationMethod | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [location, setLocation] = useState<DanishRegion | ''>('');
  const [favoriteGyms, setFavoriteGyms] = useState<(DanishGym | null)[]>([
    null,
    null,
    null,
  ]);
  const [favoriteGymLabels, setFavoriteGymLabels] = useState<string[]>(['', '', '']);
  const [activeGymIndex, setActiveGymIndex] = useState<number | null>(null);
  const [showGymSuggestions, setShowGymSuggestions] = useState(false);
  const [allowLocation, setAllowLocation] = useState(true);
  const [username, setUsername] = useState('');
  const [selectedBiceps, setSelectedBiceps] = useState<string | null>(null);
  const [photoSelected, setPhotoSelected] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  
  const bicepsOptions = ['💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿', '🦾'];

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const subtitleCopy = useMemo(() => {
    switch (step) {
      case 'method':
        return 'Vælg hvordan du vil tilmelde dig';
      case 'names':
        return 'Føj dit fornavn og efternavn til din profil';
      case 'email':
        return method === 'apple'
          ? 'Vi har fundet din Apple mail – du kan redigere den her'
          : method === 'google'
          ? 'Vi har fundet din Google mail – du kan redigere den her'
          : 'Tilføj den mail du vil bruge til Gymly';
      case 'password':
        return 'Adgangskoden skal være mindst 8 tegn, indeholde store og små bogstaver samt tal';
      case 'location':
        return 'Vælg din beliggenhed og dit lokale træningscenter';
      case 'verification':
        return `Vi har sendt et link til ${email || 'din mail'}`;
      case 'username':
        return 'Vælg et brugernavn, som andre kan se';
      case 'photo':
        return 'Læg et billede op, så folk kan genkende dig';
      default:
        return '';
    }
  }, [step, method, email]);

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
      if (tokens.length === 0) {
        return true;
      }
      const haystack = normalizeSearchValue(
        `${option.name} ${option.city ?? ''} ${option.region} ${option.address ?? ''}`
      );
      return tokens.every(token => haystack.includes(token));
    });

    return filtered.slice(0, 10);
  }, [favoriteGymLabels, showGymSuggestions, activeGymIndex]);

  const setPrefilledEmail = (selectedMethod: RegistrationMethod | null) => {
    if (!selectedMethod || selectedMethod === 'email') {
      return;
    }

    if (!firstName && !lastName) {
      return;
    }

    const slug = `${firstName || 'gymly'}.${lastName || 'member'}`
      .toLowerCase()
      .replace(/\s+/g, '');
    const domain = selectedMethod === 'apple' ? 'icloud.com' : 'gmail.com';
    setEmail(`${slug}@${domain}`);
  };

  const handleSelectMethod = (selected: RegistrationMethod) => {
    setMethod(selected);
    setLocation('');
    setFavoriteGyms([null, null, null]);
    setFavoriteGymLabels(['', '', '']);
    setActiveGymIndex(null);
    setShowGymSuggestions(false);
    setStep('names');
  };

  const handleNamesContinue = () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Mangler navn', 'Udfyld både navn og efternavn.');
      return;
    }

    setPrefilledEmail(method);
    setStep('email');
  };

  const handleEmailContinue = () => {
    if (!email.trim()) {
      Alert.alert('Manglende email', 'Indtast din email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Ugyldig email', 'Tjek venligst din email.');
      return;
    }
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert(
        'Påkrævet',
        'Du skal acceptere privatlivspolitikken og servicevilkårene for at fortsætte.',
      );
      return;
    }

    setStep('password');
  };

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) {
      errors.push('Mindst 8 tegn');
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('Mindst ét stort bogstav');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('Mindst ét lille bogstav');
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('Mindst ét tal');
    }
    return errors;
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (text.length > 0) {
      const errors = validatePassword(text);
      setPasswordErrors(errors);
    } else {
      setPasswordErrors([]);
    }
  };

  const handlePasswordContinue = () => {
    const errors = validatePassword(password);
    if (errors.length > 0) {
      Alert.alert('Adgangskoden opfylder ikke kravene', errors.join('\n'));
      return;
    }

    setStep('location');
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

  const handleLocationContinue = () => {
    const firstGymLabel = favoriteGymLabels[0].trim();

    if (!location || !firstGymLabel) {
      Alert.alert('Mangler info', 'Vælg både beliggenhed og center.');
      return;
    }

    setShowGymSuggestions(false);
    setActiveGymIndex(null);
    setStep('username');
  };

  const handleVerificationContinue = () => {
    if (!email.trim() || !password) {
      Alert.alert('Manglende info', 'Email og adgangskode mangler.');
      return;
    }
    setIsLoading(true);
    AuthService.login({email: email.trim(), password})
      .then(({user, tokens}) => {
        if (tokens) {
          login(user, tokens);
        } else {
          Alert.alert('Login fejlede', 'Kunne ikke logge ind. Prøv igen.');
        }
      })
      .catch(error => {
        Alert.alert(
          'Ikke bekræftet endnu',
          error?.message || 'Bekræft din email og prøv igen.',
        );
      })
      .finally(() => setIsLoading(false));
  };

  const handleSkipVerification = () => {
    Alert.alert(
      'Bekræft senere',
      'Du kan bekræfte din mail senere fra login.',
      [{text: 'OK', onPress: () => navigation.navigate('Login')}],
    );
  };

  const handleUsernameContinue = () => {
    if (!username.trim()) {
      Alert.alert('Manglende brugernavn', 'Indtast et brugernavn.');
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert('For kort brugernavn', 'Brugernavnet skal være mindst 3 tegn.');
      return;
    }
    if (!selectedBiceps) {
      Alert.alert('Vælg biceps', 'Vælg din biceps emoji for at fortsætte.');
      return;
    }

    setStep('photo');
  };

  const handleCompleteRegistration = async () => {
    if (!method) {
      Alert.alert('Vælg metode', 'Start med at vælge en metode.');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Mangler navn', 'Udfyld dine navne.');
      setStep('names');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Mangler email', 'Tilføj din email.');
      setStep('email');
      return;
    }

    if (!username.trim()) {
      Alert.alert('Manglende brugernavn', 'Tilføj et brugernavn.');
      setStep('username');
      return;
    }
    if (!selectedBiceps) {
      Alert.alert('Vælg biceps', 'Vælg din biceps emoji for at fortsætte.');
      setStep('username');
      return;
    }

    setIsLoading(true);
    try {
      // Get the selected gym ID if a gym was selected
      const favoriteGymIds: number[] = [];
      favoriteGymLabels.forEach((label, index) => {
        const trimmed = label.trim();
        if (!trimmed) {
          return;
        }
        const selected = favoriteGyms[index];
        const gymId =
          selected?.id ??
          danishGyms.find(
            gym =>
              gym.name.toLowerCase().includes(trimmed.toLowerCase()) ||
              (gym.city && gym.city.toLowerCase().includes(trimmed.toLowerCase())),
          )?.id;
        if (gymId && !favoriteGymIds.includes(gymId)) {
          favoriteGymIds.push(gymId);
        }
      });

      if (method === 'email') {
        const {user, tokens, needsEmailConfirmation} = await AuthService.register({
          email,
          username: username.trim(),
          displayName: fullName || email,
          password,
          bicepsEmoji: selectedBiceps ?? '💪🏻',
          gdprConsent: {
            privacyPolicyAccepted: privacyAccepted,
            termsOfServiceAccepted: termsAccepted,
            marketingConsent: marketingConsent,
            analyticsConsent: analyticsConsent,
          },
          favoriteGyms: favoriteGymIds.length > 0 ? favoriteGymIds : undefined,
          profileImageUrl: profilePhotoUri || undefined,
        });

        if (needsEmailConfirmation) {
          setStep('verification');
          try {
            await AuthService.resendEmailConfirmation(email.trim());
            Alert.alert('Link sendt', 'Vi har sendt en bekræftelsesmail. Tjek også spam.');
          } catch (resendError: any) {
            Alert.alert(
              'Kunne ikke sende mail',
              resendError?.message || 'Prøv igen via "Send link igen".',
            );
          }
          return;
        }
        if (!tokens) {
          throw new Error('Kunne ikke fuldføre registrering.');
        }
        login(user, tokens);
        return;
      }

      const {user, tokens} = await AuthService.socialLogin(method, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        bicepsEmoji: selectedBiceps ?? '💪🏻',
        favoriteGyms: favoriteGymIds.length > 0 ? favoriteGymIds : undefined,
      });

      if (!tokens) {
        throw new Error('Kunne ikke fuldføre registrering.');
      }
      login(user, tokens);
    } catch (error: any) {
      const message = error?.message || 'Prøv igen.';
      const normalized = message.toLowerCase();
      const alreadyRegistered =
        normalized.includes('user already registered') ||
        normalized.includes('already registered') ||
        normalized.includes('email already') ||
        normalized.includes('already in use') ||
        normalized.includes('email_already_registered');
      if (alreadyRegistered) {
        try {
          await AuthService.resendEmailConfirmation(email.trim());
          Alert.alert('Link sendt', 'Vi har sendt en ny bekræftelsesmail.');
          setStep('verification');
          return;
        } catch (resendError: any) {
          const resendMessage = resendError?.message || '';
          const resendNormalized = resendMessage.toLowerCase();
          const alreadyConfirmed =
            resendNormalized.includes('already confirmed') ||
            resendNormalized.includes('email already confirmed');
          if (alreadyConfirmed) {
            Alert.alert('Email er allerede i brug', 'Log ind eller nulstil din adgangskode.', [
              {text: 'Annuller', style: 'cancel'},
              {text: 'Log ind', onPress: () => navigation.navigate('Login')},
              {text: 'Glemt kode', onPress: () => navigation.navigate('ForgotPassword')},
            ]);
            return;
          }
          Alert.alert('Kunne ikke sende link', resendMessage || 'Prøv igen.');
          return;
        }
      }
      Alert.alert('Registrering fejlede', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoPick = () => {
    Alert.alert('Vælg profilbillede', 'Hvordan vil du tilføje et billede?', [
      {
        text: 'Tag billede',
        onPress: async () => {
          const cameraOptions: CameraOptions = {
            mediaType: 'photo',
            cameraType: 'front',
            saveToPhotos: false,
            quality: 0.8,
          };
          const response: ImagePickerResponse = await launchCamera(cameraOptions);
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setProfilePhotoUri(asset.uri);
            setPhotoSelected(true);
          }
        },
      },
      {
        text: 'Vælg fra bibliotek',
        onPress: async () => {
          const response: ImagePickerResponse = await launchImageLibrary({
            mediaType: 'photo',
            selectionLimit: 1,
            quality: 0.8,
          });
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setProfilePhotoUri(asset.uri);
            setPhotoSelected(true);
          }
        },
      },
      {text: 'Annuller', style: 'cancel'},
    ]);
  };

  const handlePhotoContinue = () => {
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert(
        'Påkrævet',
        'Du skal acceptere privatlivspolitikken og servicevilkårene for at fortsætte.',
      );
      return;
    }
    handleCompleteRegistration();
  };

  const renderContent = () => {
    switch (step) {
      case 'method':
        return (
          <View style={styles.methodSection}>
            <SocialButton
              icon="apple"
              label="Fortsæt med Apple"
              backgroundColor="#000"
              onPress={() => handleSelectMethod('apple')}
            />
            <SocialButton
              icon="google"
              label="Fortsæt med Google"
              backgroundColor="#fff"
              textColor="#0F172A"
              onPress={() => handleSelectMethod('google')}
            />
            <TouchableOpacity
              style={[styles.emailButton]}
              onPress={() => handleSelectMethod('email')}
              activeOpacity={0.85}>
              <MaterialIcon name="email-outline" size={22} color="#1D4ED8" />
              <Text style={styles.emailButtonText}>Fortsæt med mail</Text>
              <View style={styles.socialSpacer} />
            </TouchableOpacity>
          </View>
        );
      case 'names':
        return (
          <View style={styles.nameSection}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Fornavn"
              placeholderTextColor={colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              textContentType="givenName"
              autoComplete="name"
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Efternavn"
              placeholderTextColor={colors.textMuted}
              value={lastName}
              onChangeText={setLastName}
              textContentType="familyName"
              autoComplete="name"
              returnKeyType="done"
              onSubmitEditing={handleNamesContinue}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleNamesContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'email':
        return (
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <View style={styles.inlineConsentSection}>
              <Text style={styles.inlineConsentLabel}>
                Ved at fortsætte accepterer du vores{' '}
                <Text
                  style={styles.inlineConsentLink}
                  onPress={() => Linking.openURL('https://gymlyapp.com/privacy')}>
                  privatlivspolitik
                </Text>{' '}
                og{' '}
                <Text
                  style={styles.inlineConsentLink}
                  onPress={() => Linking.openURL('https://gymlyapp.com/terms')}>
                  servicevilkår
                </Text>
                .
              </Text>
              <TouchableOpacity
                style={styles.inlineConsentItem}
                onPress={() => {
                  const next = !(privacyAccepted && termsAccepted);
                  setPrivacyAccepted(next);
                  setTermsAccepted(next);
                }}
                activeOpacity={0.7}>
                <View
                  style={[
                    styles.inlineCheckbox,
                    privacyAccepted && termsAccepted && styles.inlineCheckboxChecked,
                  ]}>
                  {privacyAccepted && termsAccepted && <Text style={styles.inlineCheckmark}>✓</Text>}
                </View>
                <Text style={styles.inlineConsentText}>
                  Jeg accepterer privatlivspolitik & servicevilkår
                </Text>
              </TouchableOpacity>
              <Text style={styles.inlineOptionalTitle}>Valgfrit</Text>
              <View style={styles.inlineOptionalRow}>
                <Text style={styles.inlineOptionalText}>Marketing kommunikation</Text>
                <Switch
                  value={marketingConsent}
                  onValueChange={setMarketingConsent}
                  trackColor={{false: '#E5E5EA', true: colors.primary}}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.inlineOptionalRow}>
                <Text style={styles.inlineOptionalText}>Anonymiseret analyse</Text>
                <Switch
                  value={analyticsConsent}
                  onValueChange={setAnalyticsConsent}
                  trackColor={{false: '#E5E5EA', true: colors.primary}}
                  thumbColor="#fff"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={handleEmailContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'password':
        return (
          <View style={styles.card}>
            <View style={styles.passwordField}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  password.length > 0 && passwordErrors.length > 0 && styles.inputError,
                  password.length > 0 && passwordErrors.length === 0 && styles.inputValid,
                ]}
                placeholder="Adgangskode"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollTo({y: 360, animated: true});
                  }, 80);
                }}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(prev => !prev)}
                activeOpacity={0.7}>
                <Text style={styles.passwordToggleText}>{showPassword ? 'Skjul' : 'Se kode'}</Text>
              </TouchableOpacity>
            </View>
            {password.length > 0 && (
              <View style={styles.passwordRequirements}>
                {passwordErrors.length > 0 ? (
                  <View>
                    {passwordErrors.map((error, index) => (
                      <View key={index} style={styles.passwordErrorItem}>
                        <Icon name="close-circle" size={16} color="#EF4444" />
                        <Text style={styles.passwordErrorText}>{error}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.passwordSuccessItem}>
                    <Icon name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.passwordSuccessText}>Adgangskoden opfylder alle krav</Text>
                  </View>
                )}
              </View>
            )}
            {password.length === 0 && (
              <Text style={styles.helperText}>
                Adgangskoden skal være mindst 8 tegn, indeholde store og små bogstaver samt tal
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                passwordErrors.length > 0 && styles.primaryButtonDisabled,
              ]}
              onPress={handlePasswordContinue}
              activeOpacity={0.85}
              disabled={passwordErrors.length > 0}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'location':
        return (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Beliggenhed*</Text>
            <View style={styles.regionList}>
              {regionOptions.map(region => (
                <TouchableOpacity
                  key={region}
                  style={[styles.regionChip, location === region && styles.regionChipActive]}
                  onPress={() => handleSelectRegion(region)}>
                  <Text
                    style={[
                      styles.regionChipText,
                      location === region && styles.regionChipTextActive,
                    ]}>
                    {region}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Favoritcentre*</Text>
            {favoriteGymLabels.map((label, index) => {
              const isRequired = index === 0;
              const isActive = activeGymIndex === index;
              return (
                <View key={`favorite_gym_${index}`} style={styles.inputWrapper}>
                  <View style={styles.favoriteGymRow}>
                    <View style={styles.favoriteGymIndex}>
                      <Text style={styles.favoriteGymIndexText}>{index + 1}.</Text>
                    </View>
                    <TextInput
                      style={[styles.input, styles.favoriteGymInput]}
                      placeholder={isRequired ? 'Påkrævet' : 'Valgfri'}
                      placeholderTextColor={colors.textMuted}
                      value={label}
                      onFocus={() => {
                        setActiveGymIndex(index);
                        setShowGymSuggestions(true);
                        setTimeout(() => {
                          scrollRef.current?.scrollTo({y: 520, animated: true});
                        }, 80);
                      }}
                      onChangeText={value => {
                        setFavoriteGymLabels(prev => {
                          const next = [...prev];
                          next[index] = value;
                          return next;
                        });
                        setFavoriteGyms(prev => {
                          const next = [...prev];
                          next[index] = null;
                          return next;
                        });
                        setActiveGymIndex(index);
                        setShowGymSuggestions(value.trim().length > 0);
                        if (value.trim().length > 0) {
                          setTimeout(() => {
                            scrollRef.current?.scrollTo({y: 520, animated: true});
                          }, 80);
                        }
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  {isActive && showGymSuggestions && gymSuggestions.length > 0 && (
                    <View style={styles.suggestionList}>
                      {gymSuggestions.map(option => (
                        <TouchableOpacity
                          key={`${index}_${option.id}`}
                          style={styles.suggestionItem}
                          onPress={() => handleSelectGymSuggestion(option)}>
                          <Text style={styles.suggestionTitle}>{option.name}</Text>
                          <Text style={styles.suggestionSubtitle}>{option.city}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Tillad Gymly at bruge din lokalitet</Text>
              <Switch
                value={allowLocation}
                onValueChange={setAllowLocation}
                trackColor={{false: '#E5E5EA', true: '#34C759'}}
                thumbColor="#fff"
                ios_backgroundColor="#E5E5EA"
              />
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={handleLocationContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'verification':
        return (
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={colors.textMuted}
              value={email}
              editable={false}
            />
            <View style={styles.linkRow}>
              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={async () => {
                  try {
                    await AuthService.resendEmailConfirmation(email.trim());
                    Alert.alert('Link sendt', 'Vi har sendt linket igen.');
                  } catch (error: any) {
                    Alert.alert('Fejl', error?.message || 'Kunne ikke sende linket.');
                  }
                }}>
                <Text style={styles.secondaryLinkText}>Send link igen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={() => Linking.openURL('mailto:')}>
                <Text style={styles.secondaryLinkText}>Åbn mail</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
              onPress={handleVerificationContinue}
              activeOpacity={0.85}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Jeg har bekræftet</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipLink} onPress={handleSkipVerification} activeOpacity={0.7}>
              <Text style={styles.skipLinkText}>Skip for nu (Kun i beta)</Text>
            </TouchableOpacity>
          </View>
        );
      case 'username':
        return (
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Brugernavn"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (selectedBiceps) {
                  handleUsernameContinue();
                } else {
                  Alert.alert('Vælg biceps', 'Vælg din biceps emoji for at fortsætte.');
                }
              }}
            />
            <Text style={styles.helperText}>Brugernavnet skal være mindst 3 tegn</Text>
            
            <Text style={styles.sectionLabel}>Vælg din biceps emoji</Text>
            <View style={styles.bicepsGrid}>
              {bicepsOptions.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.bicepsOption,
                    selectedBiceps === emoji && styles.bicepsOptionSelected,
                  ]}
                  onPress={() => setSelectedBiceps(emoji)}
                  activeOpacity={0.7}>
                  <Text style={styles.bicepsEmojiOption}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity style={styles.primaryButton} onPress={handleUsernameContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'photo':
        return (
          <View style={styles.photoSection}>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={handlePhotoPick} activeOpacity={0.8}>
              {profilePhotoUri ? (
                <Image source={{uri: profilePhotoUri}} style={styles.photoImage} />
              ) : (
                <>
                  <MaterialIcon
                    name={photoSelected ? 'check-circle' : 'camera-plus'}
                    size={photoSelected ? 44 : 38}
                    color={photoSelected ? '#34C759' : '#94A3B8'}
                  />
                  <Text style={styles.photoHelper}>
                    {photoSelected ? 'Billede markeret' : 'Tilføj et foto'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, styles.finishButton]} onPress={handlePhotoContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePhotoContinue} disabled={isLoading}>
              <Text style={styles.secondaryLinkText}>Spring over</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const showBack = step !== 'method';
  const currentStepIndex = stepOrder.indexOf(step) + 1;
  const goToPreviousStep = useCallback(() => {
    if (step === 'method') {
      return;
    }
    const previousIndex = Math.max(0, currentStepIndex - 2);
    setStep(stepOrder[previousIndex]);
  }, [step, currentStepIndex]);

  return (
    <GestureDetector
      gesture={Gesture.Pan()
        .activeOffsetX([-60, 60])
        .failOffsetY([-20, 20])
        .onEnd(event => {
          if (Math.abs(event.translationX) > 80) {
            runOnJS(goToPreviousStep)();
          }
        })}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {showBack && (
            <TouchableOpacity style={styles.backButton} onPress={goToPreviousStep}>
              <MaterialIcon name="chevron-left" size={28} color="#007AFF" />
            </TouchableOpacity>
          )}
        <View style={styles.logoBadge}>
          <GymlyLogo size={64} />
        </View>
        <Text style={styles.stepCounter}>Trin {currentStepIndex} af {stepOrder.length}</Text>
        <Text style={styles.title}>{
          step === 'method'
            ? 'Kom i gang'
            : step === 'names'
            ? 'Tilføj Navn'
            : step === 'email'
            ? 'Tilføj din e-mail'
            : step === 'password'
            ? 'Tilføj dit kodeord'
            : step === 'location'
            ? 'Hvor træner du henne?'
            : step === 'verification'
            ? 'Bekræft din email'
            : step === 'username'
            ? 'Vælg brugernavn'
            : step === 'photo'
            ? 'Tilføj et foto'
            : 'Privatliv og samtykke'
        }</Text>
        <Text style={styles.subtitle}>{subtitleCopy}</Text>

        {renderContent()}

        <Text style={styles.gdprText}>
          Ved at oprette en konto accepterer du Gymlys
          <Text style={styles.linkHighlight}> brugeraftaler</Text>,
          <Text style={styles.linkHighlight}> Privat Politik</Text> &
          <Text style={styles.linkHighlight}> Cookie Politik</Text>
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Har du allerede en konto? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log ind</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  content: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 32,
    gap: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoBadge: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  stepCounter: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 16,
  },
  methodSection: {
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  emailButtonText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  socialButtonDisabled: {
    opacity: 0.7,
  },
  socialIcon: {
    width: 24,
  },
  socialSpacer: {
    width: 20,
  },
  socialLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  nameSection: {
    gap: 12,
  },
  card: {
    gap: 12,
  },
  input: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordField: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 92,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  passwordToggleText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  inputValid: {
    borderColor: '#10B981',
    borderWidth: 2,
  },
  inputWrapper: {
    position: 'relative',
  },
  favoriteGymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteGymIndex: {
    width: 28,
    alignItems: 'center',
  },
  favoriteGymIndexText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  favoriteGymInput: {
    flex: 1,
  },
  halfInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.textTertiary || '#9CA3AF',
    opacity: 0.6,
  },
  finishButton: {
    width: '100%',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  passwordRequirements: {
    marginTop: 8,
    marginBottom: 4,
  },
  passwordErrorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  passwordErrorText: {
    color: '#EF4444',
    fontSize: 13,
  },
  passwordSuccessItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passwordSuccessText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '600',
  },
  inlineConsentSection: {
    marginTop: 12,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
  },
  inlineConsentLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  inlineConsentLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  inlineConsentRow: {
    gap: 8,
  },
  inlineConsentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCheckboxChecked: {
    backgroundColor: colors.primary,
  },
  inlineCheckmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineConsentText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  inlineOptionalTitle: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  inlineOptionalRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineOptionalText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  regionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  regionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  regionChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  regionChipText: {
    color: colors.text,
    fontSize: 15,
  },
  regionChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  suggestionList: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    maxHeight: 200,
    zIndex: 10,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  suggestionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  secondaryLink: {
    paddingVertical: 8,
  },
  secondaryLinkText: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 8,
  },
  skipLinkText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  photoSection: {
    alignItems: 'center',
    gap: 16,
  },
  photoPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoHelper: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  gdprText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  linkHighlight: {
    color: colors.secondary,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  loginLink: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  bicepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  bicepsOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bicepsOptionSelected: {
    borderColor: colors.secondary,
    backgroundColor: colors.surfaceLight || '#E0E7FF',
  },
  bicepsEmojiOption: {
    fontSize: 32,
  },
  privacySection: {
    gap: 24,
  },
  section: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  consentInfo: {
    flex: 1,
    marginRight: 12,
  },
  consentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  consentDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.secondary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 0,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
});

export default RegisterScreen;
