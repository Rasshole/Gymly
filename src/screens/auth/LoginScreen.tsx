/**
 * Login — email + Continue with Apple / Google.
 * Compact resting layout (no vertical scroll on normal iPhones).
 * Auth handlers unchanged.
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Pressable,
  Keyboard,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import GymlyLogo from '@/components/GymlyLogo';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import {SocialContinueButtons} from '@/components/auth/SocialContinueButtons';
import {AuthLanguageButton} from '@/components/auth/AuthLanguageButton';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

type LoginScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'Login'
>;
type FocusField = 'email' | 'password' | null;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const {login} = useAppStore();
  const {t} = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!email?.trim() || !password) {
      Alert.alert(t('common.error'), t('auth.fillEmailPassword'));
      return;
    }

    setIsLoading(true);
    try {
      const {user, tokens} = await AuthService.login({
        email: email.trim(),
        password,
      });
      if (!tokens) {
        Alert.alert(t('authLogin.failed'), t('authLogin.sessionFailed'));
        return;
      }
      login(user, tokens);
    } catch (error: any) {
      Alert.alert(t('authLogin.failed'), error.message || t('common.retry'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.languageSlot, {top: insets.top + spacing.sm}]}>
        <AuthLanguageButton />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          // Resting Login fits without scroll; allow scroll only while keyboard is up.
          scrollEnabled={keyboardOpen}>
          <View style={styles.brand}>
            <GymlyLogo size={40} />
          </View>

          <Text style={styles.title}>{t('auth.loginTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

          <View
            style={[
              styles.inputWrap,
              focusedField === 'email' && styles.inputWrapFocused,
            ]}>
            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              testID="login-email"
              accessibilityLabel={t('auth.email')}
              onFocus={() => setFocusedField('email')}
              onBlur={() =>
                setFocusedField(prev => (prev === 'email' ? null : prev))
              }
            />
          </View>

          <View
            style={[
              styles.inputWrap,
              focusedField === 'password' && styles.inputWrapFocused,
            ]}>
            <TextInput
              style={styles.input}
              placeholder={t('auth.password')}
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              // Avoid iOS Password AutoFill → Apple ID sheet on Simulator QA
              textContentType={__DEV__ ? 'none' : 'password'}
              autoComplete={__DEV__ ? 'off' : 'password'}
              testID="login-password"
              accessibilityLabel={t('auth.password')}
              onFocus={() => setFocusedField('password')}
              onBlur={() =>
                setFocusedField(prev => (prev === 'password' ? null : prev))
              }
            />
          </View>

          <Pressable
            style={styles.forgot}
            onPress={() => navigation.navigate('ForgotPassword')}
            hitSlop={10}>
            <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
          </Pressable>

          <SocialPrimaryButton
            label={isLoading ? t('common.loading') : t('auth.loginButton')}
            onPress={() => {
              void handleLogin();
            }}
            loading={isLoading}
            disabled={!email.trim() || !password || socialBusy}
            style={styles.cta}
            testID="login-submit"
          />

          <SocialContinueButtons
            divider="before"
            disabled={isLoading}
            onBusyChange={setSocialBusy}
          />

          <View style={styles.footerSignup}>
            <Text style={styles.footerQ}>{t('auth.newToGymly')}</Text>
            <Pressable
              onPress={() => navigation.navigate('Register')}
              hitSlop={12}
              style={styles.signupLink}>
              <Text style={styles.signupLinkText}>{t('auth.signUp')}</Text>
            </Pressable>
          </View>

          <View style={styles.legalRow}>
            <Text
              style={styles.legalLink}
              onPress={() => navigation.navigate('Terms')}>
              {t('register.consentTerms')}
            </Text>
            <Text style={styles.legalDot}> · </Text>
            <Text
              style={styles.legalLink}
              onPress={() => navigation.navigate('PrivacyPolicy')}>
              {t('register.consentPrivacy')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  languageSlot: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 2,
  },
  flex: {flex: 1},
  scrollView: {flex: 1},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  inputWrap: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  inputWrapFocused: {
    borderColor: colors.primary + '88',
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    marginTop: 2,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cta: {
    marginBottom: spacing.md,
  },
  footerSignup: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  footerQ: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: '500',
  },
  signupLink: {
    paddingVertical: spacing.xs,
  },
  signupLinkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  legalDot: {
    color: colors.textMuted,
    fontSize: 12,
  },
  legalLink: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default LoginScreen;
