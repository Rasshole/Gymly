/**
 * Register Screen
 */

import React, {useMemo, useState} from 'react';
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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/AuthNavigator';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import GymlyLogo from '@/components/GymlyLogo';
import danishGyms, {DanishGym, DanishRegion} from '@/data/danishGyms';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;
type Step = 'method' | 'names' | 'email' | 'password' | 'location' | 'verification' | 'photo';
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
  'verification',
  'photo',
];

const regionOptions: DanishRegion[] = ['København', 'Sjælland', 'Fyn', 'Jylland'];

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const {login} = useAppStore();

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<RegistrationMethod | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [location, setLocation] = useState<DanishRegion | ''>('');
  const [localGym, setLocalGym] = useState('');
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  const [showGymSuggestions, setShowGymSuggestions] = useState(false);
  const [allowLocation, setAllowLocation] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [photoSelected, setPhotoSelected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
        return 'Adgangskoden skal være mere end 6 tegn';
      case 'location':
        return 'Vælg din beliggenhed og dit lokale træningscenter';
      case 'verification':
        return `Vi har sendt en kode til ${email || 'din mail'}`;
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
    const trimmed = localGym.trim();
    if (!showGymSuggestions || !location || trimmed.length === 0) {
      return [];
    }

    const normalizedQuery = normalizeSearchValue(trimmed);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    const filtered = danishGyms
      .filter(option => option.region === location)
      .filter(option => {
        if (tokens.length === 0) {
          return true;
        }
        const haystack = normalizeSearchValue(
          `${option.name} ${option.city ?? ''} ${option.region} ${option.address ?? ''}`
        );
        return tokens.every(token => haystack.includes(token));
      });

    return filtered.slice(0, 10);
  }, [location, localGym, showGymSuggestions]);

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
    setLocalGym('');
    setSelectedGym(null);
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

    setStep('password');
  };

  const handlePasswordContinue = () => {
    if (password.length < 6) {
      Alert.alert('For kort adgangskode', 'Adgangskoden skal være mindst 6 tegn.');
      return;
    }

    setStep('location');
  };

  const handleSelectRegion = (region: DanishRegion) => {
    setLocation(region);
    setLocalGym('');
    setSelectedGym(null);
    setShowGymSuggestions(false);
  };

  const handleSelectGymSuggestion = (gym: DanishGym) => {
    const displayLabel = [gym.name, gym.city].filter(Boolean).join(', ');
    setSelectedGym(gym);
    setLocation(gym.region);
    setLocalGym(displayLabel);
    setShowGymSuggestions(false);
  };

  const handleLocationContinue = () => {
    const chosenGym = (selectedGym
      ? [selectedGym.name, selectedGym.city].filter(Boolean).join(', ')
      : localGym
    ).trim();

    if (!location || !chosenGym) {
      Alert.alert('Mangler info', 'Vælg både beliggenhed og center.');
      return;
    }

    setShowGymSuggestions(false);
    setLocalGym(chosenGym);
    setStep('verification');
  };

  const handleSkipVerification = () => {
    setStep('photo');
  };

  const handleVerificationContinue = () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Ugyldig kode', 'Indtast din 6-cifrede kode.');
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

    setIsLoading(true);
    try {
      // Get the selected gym ID if a gym was selected
      let favoriteGymId: number | undefined;
      if (selectedGym) {
        favoriteGymId = selectedGym.id;
      } else if (localGym) {
        // Try to find the gym by name/city if it wasn't selected from suggestions
        const foundGym = danishGyms.find(
          gym =>
            gym.name.toLowerCase().includes(localGym.toLowerCase()) ||
            (gym.city && gym.city.toLowerCase().includes(localGym.toLowerCase())),
        );
        if (foundGym) {
          favoriteGymId = foundGym.id;
        }
      }

      if (method === 'email') {
        const {user, tokens} = await AuthService.register({
          email,
          username: email.split('@')[0],
          displayName: fullName || email,
          password,
          gdprConsent: {
            privacyPolicyAccepted: true,
            termsOfServiceAccepted: true,
            marketingConsent: false,
            analyticsConsent: false,
          },
          favoriteGyms: favoriteGymId ? [favoriteGymId] : undefined,
        });

        login(user, tokens);
        return;
      }

      const {user, tokens} = await AuthService.socialLogin(method, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        favoriteGyms: favoriteGymId ? [favoriteGymId] : undefined,
      });

      login(user, tokens);
    } catch (error: any) {
      Alert.alert('Registrering fejlede', error.message || 'Prøv igen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoPick = () => {
    setPhotoSelected(true);
    Alert.alert('Snart klar', 'Foto upload implementeres senere.');
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
              placeholder="Navn"
              value={firstName}
              onChangeText={setFirstName}
              textContentType="givenName"
              autoComplete="name"
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Efternavn"
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
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleEmailContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Fortsæt</Text>
            </TouchableOpacity>
          </View>
        );
      case 'password':
        return (
          <View style={styles.card}>
            <TextInput style={styles.input} value={email} editable={false} selectTextOnFocus={false} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Text style={styles.helperText}>Adgangskoden skal være mere end 6 tegn</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handlePasswordContinue} activeOpacity={0.85}>
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

            <Text style={styles.sectionLabel}>Vælg dit lokale træningscenter*</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Dit center (fx Fitness X)"
                value={localGym}
                onChangeText={value => {
                  setLocalGym(value);
                  setSelectedGym(null);
                  setShowGymSuggestions(value.trim().length > 0);
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />

              {showGymSuggestions && gymSuggestions.length > 0 && (
                <View style={styles.suggestionList}>
                  {gymSuggestions.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectGymSuggestion(option)}>
                      <Text style={styles.suggestionTitle}>{option.name}</Text>
                      <Text style={styles.suggestionSubtitle}>{option.city}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Tillad Gymly at bruge din lokalitet</Text>
              <Switch
                value={allowLocation}
                onValueChange={setAllowLocation}
                trackColor={{false: '#D1D5DB', true: '#93C5FD'}}
                thumbColor="#fff"
                ios_backgroundColor="#D1D5DB"
                style={styles.switchControl}
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
              placeholder="6-cifret kode*"
              value={verificationCode}
              onChangeText={value => setVerificationCode(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={styles.linkRow}>
              <TouchableOpacity style={styles.secondaryLink} onPress={() => Alert.alert('Kode sendt', 'Vi sendte koden igen.')}>
                <Text style={styles.secondaryLinkText}>Send koden igen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryLink} onPress={handleSkipVerification}>
                <Text style={styles.secondaryLinkText}>Spring over for nu</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={handleVerificationContinue} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Næste</Text>
            </TouchableOpacity>
          </View>
        );
      case 'photo':
        return (
          <View style={styles.photoSection}>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={handlePhotoPick} activeOpacity={0.8}>
              <MaterialIcon
                name={photoSelected ? 'check-circle' : 'camera-plus'}
                size={photoSelected ? 44 : 38}
                color={photoSelected ? '#34C759' : '#94A3B8'}
              />
              <Text style={styles.photoHelper}>
                {photoSelected ? 'Billede markeret' : 'Tilføj et foto'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, styles.finishButton]} onPress={handleCompleteRegistration} activeOpacity={0.85}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Afslut</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCompleteRegistration} disabled={isLoading}>
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {showBack && (
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(stepOrder[Math.max(0, currentStepIndex - 2)])}>
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
            ? 'Indtast din verifikationskode'
            : 'Tilføj et foto'
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    backgroundColor: '#EEF2FF',
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
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#6B7280',
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
    borderColor: '#E5E5EA',
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
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  inputWrapper: {
    position: 'relative',
  },
  halfInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
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
    color: '#6B7280',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
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
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  regionChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  regionChipText: {
    color: '#0F172A',
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
    borderColor: '#E5E5EA',
    borderRadius: 12,
    backgroundColor: '#fff',
    maxHeight: 200,
    zIndex: 10,
    shadowColor: '#000',
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
    color: '#0F172A',
  },
  suggestionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 15,
    color: '#0F172A',
    flex: 1,
    marginRight: 12,
  },
  switchControl: {
    transform: [{scaleX: 0.9}, {scaleY: 0.9}],
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
    color: '#2563EB',
    fontSize: 15,
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
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoHelper: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  gdprText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  linkHighlight: {
    color: '#2563EB',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#6B7280',
    fontSize: 15,
  },
  loginLink: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RegisterScreen;
