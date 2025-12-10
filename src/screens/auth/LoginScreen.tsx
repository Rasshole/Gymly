/**
 * Login Screen
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/AuthNavigator';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import GymlyLogo from '@/components/GymlyLogo';
import {colors} from '@/theme/colors';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

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
    onPress={onPress}
    activeOpacity={0.85}
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

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const {login} = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst alle felter');
      return;
    }

    setIsLoading(true);
    try {
      const {user, tokens} = await AuthService.login({email, password});
      login(user, tokens);
    } catch (error: any) {
      Alert.alert('Login fejlede', error.message || 'Prøv igen');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'apple' | 'google') => {
    try {
      setSocialLoading(provider);
      const {user, tokens} = await AuthService.socialLogin(provider);
      login(user, tokens);
    } catch (error: any) {
      Alert.alert('Login fejlede', error.message || 'Prøv igen');
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <GymlyLogo size={64} />
          </View>
          <Text style={styles.title}>Log ind</Text>
          <Text style={styles.subtitle}>Velkommen tilbage!</Text>
          <View style={styles.secondaryAction}>
            <Text style={styles.subtitleMuted}>Ny hos Gymly?</Text>
            <TouchableOpacity
              style={styles.signupButton}
              onPress={() => navigation.navigate('Register')}>
              <Text style={styles.signupButtonText}>Tilmeld dig Gymly</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Social */}
        <View style={styles.socialSection}>
          <SocialButton
            icon="apple"
            label="Fortsæt med Apple"
            backgroundColor="#000"
            onPress={() => handleSocialLogin('apple')}
            loading={socialLoading === 'apple'}
          />
          <SocialButton
            icon="google"
            label="Fortsæt med Google"
            backgroundColor="#fff"
            textColor="#0F172A"
            onPress={() => handleSocialLogin('google')}
            loading={socialLoading === 'google'}
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>eller med email</Text>
          <View style={styles.dividerLine} />
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
            placeholder="Adgangskode"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.forgotPasswordText}>Glemt adgangskode?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Log ind</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.termsText}>
          Ved at trykke fortsæt, godkender du Gymlys{' '}
          <Text style={styles.linkText}>brugeraftaler</Text>,{' '}
          <Text style={styles.linkText}>Privat Politik</Text> &{' '}
          <Text style={styles.linkText}>Cookie Politik</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  logoBadge: {
    width: 100,
    height: 100,
    borderRadius: 36,
    backgroundColor: '#E6F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  subtitleMuted: {
    fontSize: 15,
    color: colors.textTertiary,
    marginRight: 8,
  },
  signupButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  linkText: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  socialSection: {
    gap: 12,
    marginBottom: 24,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surface,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: colors.secondary,
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: colors.secondary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  termsText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});

export default LoginScreen;

