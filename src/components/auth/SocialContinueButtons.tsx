/**
 * Continue with Apple / Google.
 * Same AuthService.socialLogin path as Login — no second OAuth implementation.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AuthService from '@/services/auth/AuthService';
import {
  humanizeSocialAuthError,
  isSocialAuthCancelled,
} from '@/services/auth/socialAuthErrors';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import {radius, spacing} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

/**
 * The native Apple button localizes from the phone language, so it stays
 * Danish when Gymly itself is set to English. Login still uses AuthService.
 */
let appleAuthReady = false;
if (Platform.OS === 'ios') {
  try {
    require('@invertase/react-native-apple-authentication');
    appleAuthReady = true;
  } catch {
    appleAuthReady = false;
  }
}

type Props = {
  /** "or" row sits above the buttons on Login, below them on Create Account. */
  divider?: 'before' | 'after';
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function SocialContinueButtons({
  divider = 'before',
  disabled = false,
  onBusyChange,
}: Props) {
  const login = useAppStore(s => s.login);
  const {t} = useTranslation();
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(
    null,
  );
  const socialInFlight = useRef(false);
  const showApple = Platform.OS === 'ios' && appleAuthReady;
  const showGoogle = true;

  useEffect(() => {
    onBusyChange?.(socialLoading != null);
  }, [onBusyChange, socialLoading]);

  const runSocial = useCallback(
    async (provider: 'apple' | 'google') => {
      if (socialInFlight.current || disabled) {
        return;
      }
      socialInFlight.current = true;
      setSocialLoading(provider);
      try {
        const {user, tokens} = await AuthService.socialLogin(provider);
        if (!tokens) {
          throw new Error(t('auth.sessionFailed'));
        }
        login(user, tokens);
      } catch (error) {
        if (isSocialAuthCancelled(error)) {
          return;
        }
        Alert.alert(
          t('auth.loginFailed'),
          (() => {
            const humanized = humanizeSocialAuthError(error, provider);
            if (humanized) {
              return humanized;
            }
            if (provider === 'google') {
              return t('auth.googleFailed');
            }
            return t('auth.sessionFailed');
          })(),
        );
      } finally {
        socialInFlight.current = false;
        setSocialLoading(null);
      }
    },
    [disabled, login, t],
  );

  if (!showApple && !showGoogle) {
    return null;
  }

  const dividerRow = (
    <View style={styles.orRow}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>{t('auth.orContinueWith')}</Text>
      <View style={styles.orLine} />
    </View>
  );

  return (
    <View style={styles.socialBlock}>
      {divider === 'before' ? dividerRow : null}
      {showApple ? (
        <Pressable
          style={[
            styles.appleButton,
            (socialLoading != null || disabled) && styles.socialDisabled,
          ]}
          disabled={socialLoading != null || disabled}
          onPress={() => {
            void runSocial('apple');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continueWithApple')}>
          <Icon name="logo-apple" size={18} color={colors.white} />
          <Text style={styles.appleButtonText}>
            {socialLoading === 'apple'
              ? t('auth.socialLoading')
              : t('auth.continueWithApple')}
          </Text>
        </Pressable>
      ) : null}
      {showGoogle ? (
        <Pressable
          style={[
            styles.googleButton,
            socialLoading === 'google' && styles.socialDisabled,
          ]}
          disabled={socialLoading != null || disabled}
          onPress={() => {
            void runSocial('google');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continueWithGoogle')}>
          <Text style={styles.googleButtonText}>
            {socialLoading === 'google'
              ? t('auth.socialLoading')
              : t('auth.continueWithGoogle')}
          </Text>
        </Pressable>
      ) : null}
      {divider === 'after' ? dividerRow : null}
    </View>
  );
}

const styles = StyleSheet.create({
  socialBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  orText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  appleButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  appleButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  socialDisabled: {
    opacity: 0.6,
  },
});
