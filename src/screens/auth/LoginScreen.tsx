/**
 * Login — email only (no Apple/Google). Gymly purple branding.
 */

import React, {useEffect, useRef, useState} from 'react';
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
  Animated,
  Pressable,
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
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const {login} = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const logoFloat = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const secondaryPress = useRef(new Animated.Value(1)).current;
  const primaryPress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 1800, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 1800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fadeIn, logoFloat]);

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
      <View style={styles.bgGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="authBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F7F5FF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBg)" />
        </Svg>
      </View>
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
          <Animated.View style={{opacity: fadeIn}}>
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
              <GymlyLogo size={92} />
            </Animated.View>

            <Text style={styles.title}>Log ind</Text>
            <Text style={styles.subtitle}>Velkommen tilbage. Kun email og adgangskode.</Text>
          </Animated.View>

          <View style={[styles.card, shadows.sm, styles.formMax]}>
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
              onPressIn={() =>
                Animated.spring(primaryPress, {toValue: 0.98, useNativeDriver: true}).start()
              }
              onPressOut={() =>
                Animated.spring(primaryPress, {toValue: 1, useNativeDriver: true}).start()
              }
              activeOpacity={0.9}>
              <Animated.View style={{transform: [{scale: primaryPress}]}}>
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.ctaText}>Log ind</Text>
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>

          <View style={styles.footerSignup}>
            <Text style={styles.footerQ}>Ny hos Gymly?</Text>
            <Pressable
              onPress={() => navigation.navigate('Register')}
              onPressIn={() =>
                Animated.spring(secondaryPress, {toValue: 0.97, useNativeDriver: true}).start()
              }
              onPressOut={() =>
                Animated.spring(secondaryPress, {toValue: 1, useNativeDriver: true}).start()
              }
              style={styles.linkBtn}>
              <Animated.Text style={[styles.linkBtnText, {transform: [{scale: secondaryPress}]}]}>
                Opret konto
              </Animated.Text>
            </Pressable>
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
    backgroundColor: '#FFFFFF',
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
    paddingVertical: spacing.lg,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: '#FCFCFF',
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EBE7F7',
    gap: spacing.md,
  },
  formMax: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
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
    minHeight: 56,
    paddingVertical: spacing.md,
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
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  footerQ: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  linkBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 50,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.full,
    backgroundColor: '#F6F1FF',
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
