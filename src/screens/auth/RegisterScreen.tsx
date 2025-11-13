/**
 * Register Screen
 */

import React, {useState} from 'react';
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

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const {login} = useAppStore();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(true); // Already accepted in consent screen
  const [termsAccepted, setTermsAccepted] = useState(true); // Already accepted in consent screen
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !username || !displayName || !password || !confirmPassword) {
      Alert.alert('Fejl', 'Udfyld venligst alle felter');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Fejl', 'Adgangskoderne matcher ikke');
      return;
    }

    setIsLoading(true);
    try {
      const {user, tokens} = await AuthService.register({
        email,
        username,
        displayName,
        password,
        gdprConsent: {
          privacyPolicyAccepted: privacyAccepted,
          termsOfServiceAccepted: termsAccepted,
          marketingConsent,
          analyticsConsent,
        },
      });
      
      login(user, tokens);
    } catch (error: any) {
      Alert.alert('Registrering fejlede', error.message || 'Prøv igen');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Opret konto</Text>
          <Text style={styles.subtitle}>Kom i gang med Gymly</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <TextInput
            style={styles.input}
            placeholder="Brugernavn"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            textContentType="username"
            autoComplete="username"
          />

          <TextInput
            style={styles.input}
            placeholder="Navn"
            value={displayName}
            onChangeText={setDisplayName}
            textContentType="name"
            autoComplete="name"
          />

          <TextInput
            style={styles.input}
            placeholder="Adgangskode"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />

          <TextInput
            style={styles.input}
            placeholder="Bekræft adgangskode"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />

          {/* Optional Consents */}
          <View style={styles.consentSection}>
            <View style={styles.consentItem}>
              <Text style={styles.consentText}>Marketing emails</Text>
              <Switch
                value={marketingConsent}
                onValueChange={setMarketingConsent}
                trackColor={{false: '#E5E5EA', true: '#34C759'}}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.consentItem}>
              <Text style={styles.consentText}>Anonymiseret analyse</Text>
              <Switch
                value={analyticsConsent}
                onValueChange={setAnalyticsConsent}
                trackColor={{false: '#E5E5EA', true: '#34C759'}}
                thumbColor="#fff"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.8}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerButtonText}>Opret konto</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Login Link */}
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
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  consentSection: {
    marginVertical: 16,
  },
  consentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  consentText: {
    fontSize: 16,
    color: '#000',
  },
  registerButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 16,
  },
  loginLink: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RegisterScreen;

