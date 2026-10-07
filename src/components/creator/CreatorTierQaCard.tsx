import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {isCreatorTierQaSurfaceEnabled, shouldShowCreatorIdentityBadge} from '@/config/creatorTierSurface';
import {fetchMyCreatorTierStatus, CreatorTierStatus} from '@/services/creator/creatorTierService';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

function formatWhen(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('da-DK', {day: 'numeric', month: 'short', year: 'numeric'});
}

function typeLabel(value: string | null | undefined): string {
  if (value === 'coach') {
    return 'Coach';
  }
  if (value === 'gym') {
    return 'Gym';
  }
  return value || '—';
}

function tierLabel(value: string | null | undefined): string {
  if (value === 'free') {
    return 'Free';
  }
  if (value === 'base') {
    return 'Base';
  }
  if (value === 'pro') {
    return 'Pro';
  }
  return value || '—';
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** Debug/local QA only. Release builds do not mount this card. */
export function CreatorTierQaCard({onOpen}: {onOpen?: () => void}) {
  const [status, setStatus] = useState<CreatorTierStatus | null>(null);

  useEffect(() => {
    if (!isCreatorTierQaSurfaceEnabled()) {
      return;
    }
    let cancelled = false;
    fetchMyCreatorTierStatus().then(next => {
      if (!cancelled) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isCreatorTierQaSurfaceEnabled()) {
    return null;
  }

  const approved = status?.status === 'approved';
  const verified = approved ? typeLabel(status?.identityType) : 'Ikke godkendt';
  const next = approved && status?.nextTier
    ? `${tierLabel(status.nextTier)} ved ${status.nextTierRequired ?? '—'} aktive referrals`
    : '—';
  const progress =
    approved && status?.nextTier && status.nextTierRequired != null
      ? `${status.activeReferrals} af ${status.nextTierRequired}`
      : null;
  const provisional =
    status?.configStatus === 'provisional_qa' &&
    status.baseRequired != null &&
    status.proRequired != null &&
    status.earnedValidDays != null &&
    status.graceDays != null
      ? `Foreløbig QA-konfiguration: Base ${status.baseRequired}, Pro ${status.proRequired}, ${status.earnedValidDays} dage, grace ${status.graceDays}.`
      : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Coach / gym · lokal QA</Text>
      <Row label="Verificeret type" value={verified} />
      {!approved && status?.identityType ? (
        <Row label="Anmodet type" value={typeLabel(status.identityType)} />
      ) : null}
      <Row label="Effektiv tier" value={tierLabel(status?.effectiveTier ?? 'free')} />
      <Row label="Årsag" value={status?.tierReason ?? 'free'} />
      <Row label="Aktive referrals" value={String(status?.activeReferrals ?? 0)} />
      {progress ? (
        <Row label={`Fremdrift mod ${tierLabel(status?.nextTier)}`} value={progress} />
      ) : null}
      <Row label="Næste tier" value={next} />
      <Row label="Udløb" value={formatWhen(status?.tierExpiresAt ?? null)} />
      {provisional ? <Text style={styles.note}>{provisional}</Text> : null}
      <Text style={styles.note}>
        {shouldShowCreatorIdentityBadge(status?.status)
          ? 'Identiteten er godkendt i lokal QA. Release-flaget er slået fra, så profilen viser stadig ikke et badge.'
          : 'Intet offentligt badge. Pending og release viser ikke coach eller gym.'}
      </Text>
      {onOpen ? (
        <TouchableOpacity onPress={onOpen} style={styles.open}>
          <Text style={styles.openText}>Åbn coach/gym-profil</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface ?? '#F4F1FA',
    gap: spacing.xs,
  },
  title: {
    ...typography.h4,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary ?? '#666',
  },
  value: {
    ...typography.caption,
    flexShrink: 1,
    textAlign: 'right',
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary ?? '#666',
    marginTop: spacing.xs,
  },
  open: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  openText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
});
