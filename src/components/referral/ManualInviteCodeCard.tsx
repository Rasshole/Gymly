/**
 * Optional code entry after install, when a link did not carry the code in.
 * Does not block the rest of Friends.
 */

import React, {useCallback, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import {useTranslation} from '@/i18n';
import {
  getPendingInviteErrorKey,
  submitInviteCode,
} from '@/services/referral/applyPendingInvite';
import {supabase} from '@/services/supabase/supabaseClient';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

type OwnReferral = {
  status: string;
  inviteCapturedAt: string | null;
  accountCreatedAt: string | null;
  onboardingCompletedAt: string | null;
};

export default function ManualInviteCodeCard() {
  const {t} = useTranslation();
  const userId = useAppStore(s => s.user?.id);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnReferral | null>(null);

  const load = useCallback(async () => {
    setErrorKey(await getPendingInviteErrorKey());
    if (!userId) {
      setOwn(null);
      return;
    }
    const {data} = await supabase
      .from('referrals')
      .select('status, invite_captured_at, account_created_at, onboarding_completed_at')
      .eq('referred_id', userId)
      .maybeSingle();
    if (!data) {
      setOwn(null);
      return;
    }
    const row = data as {
      status?: string;
      invite_captured_at?: string | null;
      account_created_at?: string | null;
      onboarding_completed_at?: string | null;
    };
    setOwn({
      status: String(row.status ?? ''),
      inviteCapturedAt: row.invite_captured_at ?? null,
      accountCreatedAt: row.account_created_at ?? null,
      onboardingCompletedAt: row.onboarding_completed_at ?? null,
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSubmit = async () => {
    if (busy || code.trim().length < 4) {
      return;
    }
    setBusy(true);
    try {
      const result = await submitInviteCode(code);
      setErrorKey(result.errorKey);
      if (result.applied) {
        setCode('');
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const step = (done: boolean) =>
    done ? t('inviteFive.stepDone') : t('inviteFive.stepWaiting');

  return (
    <View style={styles.card} testID="manual-invite-card">
      <Text style={styles.title}>{t('register.inviteCodeLabel')}</Text>
      <Text style={styles.hint}>{t('register.inviteCodeHint')}</Text>
      {own ? (
        <View testID="invitee-journey">
          <Text style={styles.step}>
            {t('inviteFive.funnelInvited')}: {step(Boolean(own.inviteCapturedAt))}
          </Text>
          <Text style={styles.step}>
            {t('inviteFive.funnelSignedUp')}: {step(Boolean(own.accountCreatedAt))}
          </Text>
          <Text style={styles.step}>
            {t('inviteFive.funnelOnboarded')}: {step(Boolean(own.onboardingCompletedAt))}
          </Text>
          <Text style={styles.step}>
            {t('inviteFive.funnelActive')}: {step(own.status === 'qualified')}
          </Text>
          <Text style={styles.step}>{t('inviteFive.funnelRules')}</Text>
        </View>
      ) : null}
      <TextInput
        testID="manual-invite-input"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t('register.inviteCodePlaceholder')}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Text style={styles.optional}>{t('register.inviteCodeOptional')}</Text>
      {errorKey && code.trim().length > 0 ? (
        <Text style={styles.error} testID="manual-invite-error">
          {t(errorKey)}
        </Text>
      ) : null}
      <GymlyPressable
        onPress={() => void onSubmit()}
        disabled={busy || code.trim().length < 4}
        accessibilityRole="button"
        accessibilityLabel={t('inviteFive.applyCode')}
        style={styles.buttonWrap}>
        <View style={styles.button} testID="manual-invite-submit">
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>{t('inviteFive.applyCode')}</Text>
          )}
        </View>
      </GymlyPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
  },
  hint: {
    ...typography.small,
    color: colors.textSecondary,
  },
  step: {
    ...typography.small,
    color: colors.text,
  },
  input: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16,
  },
  optional: {
    ...typography.caption,
    color: colors.textMuted,
  },
  error: {
    ...typography.small,
    color: '#DC2626',
  },
  buttonWrap: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
  },
});
