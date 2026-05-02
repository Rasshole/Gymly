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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';
import {supabase} from '@/services/supabase/supabaseClient';
import AuthService from '@/services/auth/AuthService';
import {useAppStore} from '@/store/appStore';

const MIN_LEN = 8;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const setUser = useAppStore(s => s.setUser);
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
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
          activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>
            {saving ? 'Opdaterer...' : 'Opdater kodeord'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  primaryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
