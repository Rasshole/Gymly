/**
 * Forgot Password Screen
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
  Animated,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {AuthStackParamList} from '@/navigation/authStackParamList';
import AuthService from '@/services/auth/AuthService';
import Icon from 'react-native-vector-icons/Ionicons';
import GymlyLogo from '@/components/GymlyLogo';
import colors from '@/theme/colors';
import safeArea from '@/safeAreaContext';
import {spacing, shadows} from '@/theme/designTokens';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const {SafeAreaView} = safeArea;

type ForgotPasswordScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<ForgotPasswordScreenNavigationProp>();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const logoFloat = React.useRef(new Animated.Value(0)).current;
  const primaryPress = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 1800, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 1800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [logoFloat]);

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Fejl', 'Indtast venligst din email');
      return;
    }

    setIsLoading(true);
    try {
      await AuthService.requestPasswordReset(email);
      setEmailSent(true);
    } catch (error: any) {
      Alert.alert('Fejl', error.message || 'Prøv igen');
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.bgGradientWrap} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="forgotBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#F7F5FF" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#forgotBg)" />
          </Svg>
        </View>
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.logoBadge,
              {
                transform: [
                  {
                    translateY: logoFloat.interpolate({inputRange: [0, 1], outputRange: [0, -5]}),
                  },
                ],
              },
            ]}>
            <GymlyLogo size={64} />
          </Animated.View>
          <View style={styles.successIcon}>
            <Icon name="checkmark-circle" size={80} color="#34C759" />
          </View>
          <Text style={styles.successTitle}>Email sendt!</Text>
          <Text style={styles.successText}>
            Vi har sendt instruktioner til at nulstille din adgangskode til {email}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Login')}
            onPressIn={() =>
              Animated.spring(primaryPress, {toValue: 0.98, useNativeDriver: true}).start()
            }
            onPressOut={() =>
              Animated.spring(primaryPress, {toValue: 1, useNativeDriver: true}).start()
            }
            activeOpacity={0.8}>
            <Animated.Text style={[styles.backButtonText, {transform: [{scale: primaryPress}]}]}>
              Tilbage til login
            </Animated.Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.bgGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="forgotBg2" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F7F5FF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#forgotBg2)" />
        </Svg>
      </View>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <TouchableOpacity
          style={styles.backIcon}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color="#007AFF" />
        </TouchableOpacity>

        <View style={[styles.header, styles.maxWidth]}>
          <Animated.View
            style={{
              transform: [
                {translateY: logoFloat.interpolate({inputRange: [0, 1], outputRange: [0, -5]})},
              ],
            }}>
            <GymlyLogo size={72} />
          </Animated.View>
          <Text style={styles.title}>Nulstil adgangskode</Text>
          <Text style={styles.subtitle}>
            Indtast din email, og vi sender dig instruktioner
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.form, styles.maxWidth, styles.card, shadows.sm]}>
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

          <TouchableOpacity
            style={[styles.resetButton, isLoading && styles.resetButtonDisabled]}
            onPress={handleResetPassword}
            disabled={isLoading}
            onPressIn={() =>
              Animated.spring(primaryPress, {toValue: 0.98, useNativeDriver: true}).start()
            }
            onPressOut={() =>
              Animated.spring(primaryPress, {toValue: 1, useNativeDriver: true}).start()
            }
            activeOpacity={0.8}>
            <Animated.View style={{transform: [{scale: primaryPress}]}}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.resetButtonText}>Send email</Text>
              )}
            </Animated.View>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bgGradientWrap: {...StyleSheet.absoluteFillObject},
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  maxWidth: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  backIcon: {
    position: 'absolute',
    top: 18,
    left: 24,
    zIndex: 10,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  form: {gap: spacing.md},
  card: {
    backgroundColor: '#FCFCFF',
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EBE7F7',
  },
  input: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButton: {
    backgroundColor: colors.secondary,
    minHeight: 56,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  resetButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  backButton: {
    backgroundColor: colors.secondary,
    minHeight: 56,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;

