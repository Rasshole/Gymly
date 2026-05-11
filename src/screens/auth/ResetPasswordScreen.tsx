import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';
import {supabase} from '@/services/supabase/supabaseClient';
import AuthService from '@/services/auth/AuthService';
import {useAppStore} from '@/store/appStore';
import safeArea from '@/safeAreaContext';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import GymlyLogo from '@/components/GymlyLogo';

const {SafeAreaView} = safeArea;

const MIN_LEN = 8;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const setUser = useAppStore(s => s.setUser);
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const logoFloat = React.useRef(new Animated.Value(0)).current;
  const primaryPress = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 2000, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 2000, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [logoFloat]);

  const isValidLen = useMemo(() => password.length >= MIN_LEN, [password.length]);
  const passwordsMatch = useMemo(
    () => confirmPassword.length > 0 && password === confirmPassword,
    [confirmPassword, password],
  );

  const handleSave = async () => {
    if (!isValidLen) {
      Alert.alert('Skift adgangskode', 'Adgangskoden skal være mindst 8 tegn.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Skift adgangskode', 'Adgangskoderne matcher ikke.');
      return;
    }

    setSaving(true);
    try {
      const {error} = await supabase.auth.updateUser({password});
      if (error) {
        throw error;
      }
      await supabase.auth.refreshSession();
      const {
        data: {session},
      } = await supabase.auth.getSession();
      if (session?.user) {
        const mapped = AuthService.getMappedUser(session.user);
        setUser(mapped);
      }
      Alert.alert('Skift adgangskode', 'Din adgangskode er ændret', [
        {
          text: 'OK',
          onPress: () => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate(isAuthenticated ? 'Main' : 'Auth');
          },
        },
      ]);
    } catch {
      Alert.alert('Skift adgangskode', 'Kunne ikke opdatere adgangskode. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.bgGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="resetBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F7F5FF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#resetBg)" />
        </Svg>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View
            style={[
              styles.logoWrap,
              {
                transform: [
                  {translateY: logoFloat.interpolate({inputRange: [0, 1], outputRange: [0, -5]})},
                ],
              },
            ]}>
            <GymlyLogo size={72} />
          </Animated.View>
          <View style={styles.card}>
        <Text style={styles.title}>Ny adgangskode</Text>
        <Text style={styles.subtitle}>
          Vælg en ny adgangskode for din konto.
        </Text>

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Ny adgangskode"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={[styles.validationText, isValidLen ? styles.validationOk : styles.validationError]}>
          {isValidLen ? 'Min. 8 tegn opfyldt' : 'Adgangskoden skal være mindst 8 tegn'}
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Gentag adgangskode"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
        <Text
          style={[
            styles.validationText,
            confirmPassword.length === 0
              ? styles.validationNeutral
              : passwordsMatch
                ? styles.validationOk
                : styles.validationError,
          ]}>
          {confirmPassword.length === 0
            ? 'Gentag adgangskode'
            : passwordsMatch
              ? 'Adgangskoder matcher'
              : 'Adgangskoder matcher ikke'}
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !isValidLen || !passwordsMatch}
          onPressIn={() =>
            Animated.spring(primaryPress, {toValue: 0.98, useNativeDriver: true}).start()
          }
          onPressOut={() =>
            Animated.spring(primaryPress, {toValue: 1, useNativeDriver: true}).start()
          }
          activeOpacity={0.85}>
          <Animated.Text style={[styles.primaryButtonText, {transform: [{scale: primaryPress}]}]}>
            {saving ? 'Opdaterer...' : 'Opdater kodeord'}
          </Animated.Text>
        </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bgGradientWrap: {...StyleSheet.absoluteFillObject},
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: '#FCFCFF',
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EBE7F7',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  title: {
    ...typography.h2,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.text,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  primaryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  validationText: {
    ...typography.caption,
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  validationOk: {
    color: '#059669',
  },
  validationError: {
    color: '#DC2626',
  },
  validationNeutral: {
    color: colors.textMuted,
  },
});
