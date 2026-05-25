/**
 * Login — email only (no Apple/Google). Gymly purple branding.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Animated,
  Pressable,
  Easing,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import {useAppStore} from '@/store/appStore';
import AuthService from '@/services/auth/AuthService';
import GymlyLogo from '@/components/GymlyLogo';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {OnboardingPrimaryButton, ONBOARDING} from '@/components/onboarding';
import {useTranslation} from '@/i18n';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;
type FocusField = 'email' | 'password' | null;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const {login} = useAppStore();
  const {t} = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusField>(null);

  const logoFloat = useRef(new Animated.Value(0)).current;
  const logoGlow = useRef(new Animated.Value(0.55)).current;
  const fadeIn = useRef(new Animated.Value(1)).current;
  const slideUp = useRef(new Animated.Value(14)).current;
  const cardScale = useRef(new Animated.Value(0.98)).current;
  const emailFocus = useRef(new Animated.Value(0)).current;
  const passwordFocus = useRef(new Animated.Value(0)).current;
  const signupPress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    slideUp.setValue(14);
    cardScale.setValue(0.98);
    Animated.parallel([
      Animated.spring(slideUp, {
        toValue: 0,
        friction: 9,
        tension: 72,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 2200, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 2200, useNativeDriver: true}),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoGlow, {toValue: 1, duration: 2600, useNativeDriver: true}),
        Animated.timing(logoGlow, {toValue: 0.45, duration: 2600, useNativeDriver: true}),
      ]),
    );
    floatLoop.start();
    glowLoop.start();
    return () => {
      floatLoop.stop();
      glowLoop.stop();
    };
  }, [cardScale, fadeIn, logoFloat, logoGlow, slideUp]);

  useEffect(() => {
    Animated.spring(emailFocus, {
      toValue: focusedField === 'email' ? 1 : 0,
      friction: 7,
      tension: 120,
      useNativeDriver: false,
    }).start();
  }, [emailFocus, focusedField]);

  useEffect(() => {
    Animated.spring(passwordFocus, {
      toValue: focusedField === 'password' ? 1 : 0,
      friction: 7,
      tension: 120,
      useNativeDriver: false,
    }).start();
  }, [focusedField, passwordFocus]);

  const handleLogin = async () => {
    if (!email?.trim() || !password) {
      Alert.alert(t('common.error'), t('auth.fillEmailPassword'));
      return;
    }

    setIsLoading(true);
    try {
      const {user, tokens} = await AuthService.login({email: email.trim(), password});
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

  const borderColorFor = useCallback(
    (anim: Animated.Value) =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [ONBOARDING.inputBorder, ONBOARDING.inputBorderFocus],
      }),
    [],
  );

  const shadowOpacityFor = useCallback(
    (anim: Animated.Value) =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.04, 0.12],
      }),
    [],
  );

  const renderField = (
    field: FocusField,
    anim: Animated.Value,
    props: React.ComponentProps<typeof TextInput>,
  ) => (
    <Animated.View
      style={[
        styles.inputWrap,
        {
          borderColor: borderColorFor(anim),
          ...Platform.select({
            ios: {
              shadowOpacity: shadowOpacityFor(anim),
            },
          }),
        },
      ]}>
      <TextInput
        {...props}
        style={styles.input}
        onFocus={() => setFocusedField(field)}
        onBlur={() => setFocusedField(prev => (prev === field ? null : prev))}
        placeholderTextColor={colors.textMuted}
      />
    </Animated.View>
  );

  return (
    <View style={styles.safe}>
      <View style={styles.bgGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="authBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ONBOARDING.bgTop} stopOpacity="1" />
              <Stop offset="0.55" stopColor="#FBFAFF" stopOpacity="1" />
              <Stop offset="1" stopColor={ONBOARDING.bgBottom} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBg)" />
        </Svg>
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
              paddingTop: insets.top + spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <Animated.View
            style={{
              opacity: fadeIn,
              transform: [{translateY: slideUp}],
            }}>
            <View style={styles.hero}>
              <Animated.View
                style={[
                  styles.logoGlow,
                  {
                    opacity: logoGlow,
                    transform: [
                      {
                        scale: logoGlow.interpolate({
                          inputRange: [0.45, 1],
                          outputRange: [0.92, 1.08],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={{
                  transform: [
                    {
                      translateY: logoFloat.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                      }),
                    },
                  ],
                }}>
                <View style={styles.logoHalo}>
                  <GymlyLogo size={84} />
                </View>
              </Animated.View>
            </View>

            <Text style={styles.title}>{t('auth.loginTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.card,
              styles.formMax,
              {
                opacity: fadeIn,
                transform: [{scale: cardScale}],
              },
            ]}>
            <View style={styles.cardSheen} pointerEvents="none" />
            {renderField('email', emailFocus, {
              placeholder: t('auth.email'),
              value: email,
              onChangeText: setEmail,
              autoCapitalize: 'none',
              keyboardType: 'email-address',
              textContentType: 'emailAddress',
              autoComplete: 'email',
            })}
            {renderField('password', passwordFocus, {
              placeholder: t('auth.password'),
              value: password,
              onChangeText: setPassword,
              secureTextEntry: true,
              textContentType: 'password',
              autoComplete: 'password',
            })}
            <Pressable
              style={styles.forgot}
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={10}>
              <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
            </Pressable>

            <OnboardingPrimaryButton
              label={t('auth.loginButton')}
              onPress={handleLogin}
              loading={isLoading}
              disabled={!email.trim() || !password}
              style={styles.ctaWrap}
            />
          </Animated.View>

          <Animated.View style={[styles.footerSignup, {opacity: fadeIn}]}>
            <Text style={styles.footerQ}>{t('auth.newToGymly')}</Text>
            <Pressable
              onPress={() => navigation.navigate('Register')}
              onPressIn={() =>
                Animated.spring(signupPress, {toValue: 0.96, useNativeDriver: true}).start()
              }
              onPressOut={() =>
                Animated.spring(signupPress, {toValue: 1, friction: 5, useNativeDriver: true}).start()
              }
              hitSlop={12}
              style={styles.signupLink}>
              <Animated.Text style={[styles.signupLinkText, {transform: [{scale: signupPress}]}]}>
                {t('auth.signUp')}
              </Animated.Text>
            </Pressable>
          </Animated.View>

          <Animated.Text style={[styles.legal, {opacity: fadeIn}]}>
            Ved at logge ind accepterer du Gymlys{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate('Terms')}>
              servicevilkår
            </Text>{' '}
            og{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
              privatlivspolitik
            </Text>
            .
          </Animated.Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ONBOARDING.bgTop,
  },
  bgGradientWrap: {
    ...StyleSheet.absoluteFillObject,
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
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    minHeight: 120,
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primary,
  },
  logoHalo: {
    padding: spacing.md + 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.16)',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.14,
        shadowRadius: 24,
      },
      android: {elevation: 4},
    }),
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.9,
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
    maxWidth: 300,
    alignSelf: 'center',
    marginBottom: spacing.xl + 4,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: ONBOARDING.cardRadius,
    padding: spacing.lg + 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    gap: spacing.md + 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#5B21B6',
        shadowOffset: {width: 0, height: 12},
        shadowOpacity: 0.08,
        shadowRadius: 28,
      },
      android: {elevation: 4},
    }),
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  formMax: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  inputWrap: {
    borderRadius: ONBOARDING.inputRadius,
    borderWidth: 1.5,
    backgroundColor: ONBOARDING.inputBg,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 2},
        shadowRadius: 10,
      },
      android: {elevation: 1},
    }),
  },
  input: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  ctaWrap: {marginTop: spacing.xs},
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -2,
    marginBottom: spacing.xs,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footerSignup: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerQ: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: '500',
  },
  signupLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  signupLinkText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  legal: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    opacity: 0.85,
  },
  legalLink: {
    color: colors.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
