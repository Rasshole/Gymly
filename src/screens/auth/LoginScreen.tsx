/**
 * Login — email only (no Apple/Google). Gymly purple branding.
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
  ScrollView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import safeArea from '@/safeAreaContext';
import {StackNavigationProp} from '@react-navigation/stack';

const {SafeAreaView} = safeArea;
import {AuthStackParamList} from '@/navigation/authStackParamList';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import GymlyLogo from '@/components/GymlyLogo';
import colors from '@/theme/colors';
import {spacing, radius, shadows} from '@/theme/designTokens';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const {login} = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email?.trim() || !password) {
      Alert.alert('Fejl', 'Udfyld email og adgangskode');
      return;
    }

    setIsLoading(true);
    try {
      const {user, tokens} = await AuthService.login({email: email.trim(), password});
      if (!tokens) {
        Alert.alert('Login fejlede', 'Kunne ikke oprette session. Prøv igen.');
        return;
      }
      login(user, tokens);
    } catch (error: any) {
      Alert.alert('Login fejlede', error.message || 'Prøv igen');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={styles.logoWrap}>
            <GymlyLogo size={80} />
          </View>

          <Text style={styles.title}>Log ind</Text>
          <Text style={styles.subtitle}>Velkommen tilbage. Kun email og adgangskode.</Text>

          <View style={[styles.card, shadows.sm]}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
            />
            <TouchableOpacity
              style={styles.forgot}
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}>
              <Text style={styles.forgotText}>Glemt adgangskode?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cta, isLoading && styles.ctaDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.9}>
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.ctaText}>Log ind</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footerSignup}>
            <Text style={styles.footerQ}>Ny hos Gymly?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              style={styles.linkBtn}
              activeOpacity={0.85}>
              <Text style={styles.linkBtnText}>Opret konto</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.legal}>
            Ved at logge ind accepterer du Gymlys{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate('Terms')}>
              servicevilkår
            </Text>{' '}
            og{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
              privatlivspolitik
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  ctaDisabled: {opacity: 0.55},
  ctaText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  footerSignup: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  footerQ: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  linkBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.full,
  },
  linkBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  legal: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '600',
  },
});

export default LoginScreen;
