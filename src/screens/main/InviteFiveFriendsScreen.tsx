/**
 * Invite 5 Friends hub — personal code/link, progress, Founding Crew entitlement.
 * Badge unlock is server-only (referral_founder_5); never awarded from this screen.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  AppState,
  type AppStateStatus,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenHeader from '@/components/ui/ScreenHeader';
import EmptyState from '@/components/ui/EmptyState';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import {useTranslation} from '@/i18n';
import {badgeDisplayDescription, badgeDisplayName} from '@/i18n/badgeDisplay';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {
  REFERRAL_REWARDS_COLLECTION_LIVE,
  REFERRAL_REWARDS_COLLECTION_URL,
  canOpenReferralRewardsCollection,
} from '@/config/referralRewardsConfig';
import {
  REFERRAL_FOUNDER_BADGE_ID,
  REFERRAL_QUALIFIED_TARGET,
  SOCIAL_SQUAD_BADGE_ID,
} from '@/services/referral/referralCodeUtils';
import {
  getMyReferralProgress,
  type ReferralProgress,
} from '@/services/supabase/referralService';
import {enqueueFoundingCrewUnlockOnce} from '@/services/referral/serverBadgeUnlockModal';
import {openShopCheckoutBrowser} from '@/shop/destination/openShopCheckoutBrowser';
import {useBadgeStore} from '@/store/badgeStore';
import {useAppStore} from '@/store/appStore';
import {copyToClipboard} from '@/utils/clipboard';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

export default function InviteFiveFriendsScreen() {
  const {t} = useTranslation();
  const navigation = useNavigation();
  const userId = useAppStore(s => s.user?.id);
  const isUnlocked = useBadgeStore(s => s.isUnlocked);
  const hydrateUserBadgesFromServer = useBadgeStore(s => s.hydrateUserBadgesFromServer);

  const [progress, setProgress] = useState<ReferralProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyAction, setBusyAction] = useState<
    'share' | 'copyLink' | 'copyCode' | 'shop' | null
  >(null);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);

  const founderDef = BADGE_BY_ID[REFERRAL_FOUNDER_BADGE_ID];
  const squadDef = BADGE_BY_ID[SOCIAL_SQUAD_BADGE_ID];

  const founderUnlocked = useMemo(() => {
    if (progress?.rewardUnlocked) {
      return true;
    }
    if (userId && isUnlocked(userId, REFERRAL_FOUNDER_BADGE_ID)) {
      return true;
    }
    return false;
  }, [progress?.rewardUnlocked, userId, isUnlocked]);

  const shopCtaEnabled = canOpenReferralRewardsCollection(
    founderUnlocked,
    REFERRAL_REWARDS_COLLECTION_LIVE,
  );

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      if (userId) {
        await hydrateUserBadgesFromServer(userId).catch(() => {});
      }
      const next = await getMyReferralProgress();
      setProgress(next);
    } catch {
      setError(true);
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, [hydrateUserBadgesFromServer, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void load();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!founderUnlocked) {
      return;
    }
    void enqueueFoundingCrewUnlockOnce();
  }, [founderUnlocked]);

  const onOpenShopRewards = async () => {
    if (!shopCtaEnabled) {
      return;
    }
    setBusyAction('shop');
    try {
      await openShopCheckoutBrowser(REFERRAL_REWARDS_COLLECTION_URL);
    } finally {
      setBusyAction(null);
    }
  };

  const qualified = progress?.qualifiedCount ?? 0;
  const target = progress?.target ?? REFERRAL_QUALIFIED_TARGET;

  const onShare = async () => {
    if (!progress?.url) {
      return;
    }
    setBusyAction('share');
    try {
      await Share.share({
        message: t('inviteFive.shareMessage', {
          code: progress.code,
          url: progress.url,
        }),
      });
      void load();
    } catch {
      /* dismissed */
    } finally {
      setBusyAction(null);
    }
  };

  const onCopy = async (kind: 'link' | 'code') => {
    if (!progress) {
      return;
    }
    const value = kind === 'link' ? progress.url : progress.code;
    setBusyAction(kind === 'link' ? 'copyLink' : 'copyCode');
    try {
      const mode = await copyToClipboard(value);
      setCopiedHint(
        mode === 'copied'
          ? kind === 'link'
            ? t('inviteFive.copiedLink')
            : t('inviteFive.copiedCode')
          : t('inviteFive.sharedFallback'),
      );
      setTimeout(() => setCopiedHint(null), 2200);
    } catch {
      setCopiedHint(t('inviteFive.copyFailed'));
      setTimeout(() => setCopiedHint(null), 2200);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('inviteFive.title')}
        onBack={() => navigation.goBack()}
      />

      {loading && !progress ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('inviteFive.loading')}</Text>
        </View>
      ) : error && !progress ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('inviteFive.loadFailedTitle')}
          message={t('inviteFive.loadFailedBody')}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>{t('inviteFive.subtitle')}</Text>

          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.cardTitle}>{t('inviteFive.progressTitle')}</Text>
            <Text
              style={styles.progressLine}
              accessibilityLabel={t('inviteFive.progressA11y', {
                count: qualified,
                target,
              })}>
              {t('inviteFive.progressLabel', {count: qualified, target})}
            </Text>
            <View style={styles.dotsRow} accessibilityRole="progressbar">
              {Array.from({length: target}, (_, i) => {
                const filled = i < qualified;
                return (
                  <View
                    key={`dot-${i}`}
                    style={[styles.dot, filled && styles.dotFilled]}
                    accessibilityLabel={
                      filled
                        ? t('inviteFive.slotFilled', {n: i + 1})
                        : t('inviteFive.slotEmpty', {n: i + 1})
                    }
                  />
                );
              })}
            </View>
            <Text style={styles.explain}>{t('inviteFive.qualifyExplain')}</Text>
          </View>

          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.cardTitle}>{t('inviteFive.yourInvite')}</Text>
            <Text style={styles.metaLabel}>{t('inviteFive.codeLabel')}</Text>
            <Text
              style={styles.codeValue}
              selectable
              accessibilityLabel={t('inviteFive.codeA11y', {
                code: progress?.code ?? '',
              })}>
              {progress?.code ?? '—'}
            </Text>
            <Text style={styles.metaLabel}>{t('inviteFive.linkLabel')}</Text>
            <Text style={styles.linkValue} numberOfLines={2} selectable>
              {progress?.url ?? '—'}
            </Text>

            <GymlyPressable
              onPress={() => void onShare()}
              style={styles.primaryBtnWrap}
              haptic="medium"
              disabled={!progress || busyAction === 'share'}
              accessibilityRole="button"
              accessibilityLabel={t('inviteFive.shareInvite')}>
              <View style={styles.primaryBtn}>
                {busyAction === 'share' ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Icon name="share-outline" size={20} color={colors.white} />
                    <Text style={styles.primaryBtnText}>
                      {t('inviteFive.shareInvite')}
                    </Text>
                  </>
                )}
              </View>
            </GymlyPressable>

            <View style={styles.secondaryRow}>
              <GymlyPressable
                onPress={() => void onCopy('link')}
                style={styles.secondaryBtnWrap}
                haptic="light"
                disabled={!progress || busyAction === 'copyLink'}
                accessibilityRole="button"
                accessibilityLabel={t('inviteFive.copyLink')}>
                <View style={styles.secondaryBtn}>
                  <Icon name="link-outline" size={18} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>
                    {t('inviteFive.copyLink')}
                  </Text>
                </View>
              </GymlyPressable>
              <GymlyPressable
                onPress={() => void onCopy('code')}
                style={styles.secondaryBtnWrap}
                haptic="light"
                disabled={!progress || busyAction === 'copyCode'}
                accessibilityRole="button"
                accessibilityLabel={t('inviteFive.copyCode')}>
                <View style={styles.secondaryBtn}>
                  <Icon name="copy-outline" size={18} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>
                    {t('inviteFive.copyCode')}
                  </Text>
                </View>
              </GymlyPressable>
            </View>
            {copiedHint ? (
              <Text style={styles.copiedHint}>{copiedHint}</Text>
            ) : null}
          </View>

          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.cardTitle}>{t('inviteFive.rewardsTitle')}</Text>
            <View
              style={[
                styles.badgeRow,
                founderUnlocked ? styles.badgeUnlocked : styles.badgeLocked,
              ]}>
              <Text style={styles.badgeEmoji}>
                {founderDef?.emoji ?? '🏅'}
              </Text>
              <View style={styles.badgeCopy}>
                <Text style={styles.badgeName}>
                  {founderDef
                    ? badgeDisplayName(t, founderDef)
                    : t('inviteFive.founderName')}
                </Text>
                <Text style={styles.badgeDesc}>
                  {founderDef
                    ? badgeDisplayDescription(t, founderDef)
                    : t('inviteFive.founderDesc')}
                </Text>
                <Text style={styles.badgeState}>
                  {founderUnlocked
                    ? t('inviteFive.badgeUnlocked')
                    : t('inviteFive.badgeLocked')}
                </Text>
              </View>
            </View>

            <View style={styles.rewardRow}>
              <Icon name="pricetag-outline" size={22} color={colors.primary} />
              <View style={styles.badgeCopy}>
                <Text style={styles.badgeName}>{t('inviteFive.shopRewardTitle')}</Text>
                <Text style={styles.badgeDesc}>{t('inviteFive.shopRewardBody')}</Text>
                <Text style={styles.badgeState}>
                  {founderUnlocked
                    ? t('inviteFive.shopRewardUnlocked')
                    : t('inviteFive.shopRewardLocked')}
                </Text>
                {founderUnlocked && progress?.discountCode ? (
                  <Text style={styles.discountCode}>
                    {t('inviteFive.discountCode', {
                      code: progress.discountCode,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>

            {founderUnlocked ? (
              shopCtaEnabled ? (
                <GymlyPressable
                  onPress={() => void onOpenShopRewards()}
                  style={styles.primaryBtnWrap}
                  haptic="medium"
                  disabled={busyAction === 'shop'}
                  accessibilityRole="button"
                  accessibilityLabel={t('inviteFive.openShopRewards')}>
                  <View style={styles.primaryBtn}>
                    {busyAction === 'shop' ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <>
                        <Icon name="storefront-outline" size={20} color={colors.white} />
                        <Text style={styles.primaryBtnText}>
                          {t('inviteFive.openShopRewards')}
                        </Text>
                      </>
                    )}
                  </View>
                </GymlyPressable>
              ) : (
                <View
                  style={styles.shopDisabled}
                  accessibilityRole="text"
                  accessibilityLabel={t('inviteFive.shopRewardsComingSoon')}>
                  <Text style={styles.shopDisabledText}>
                    {t('inviteFive.shopRewardsComingSoon')}
                  </Text>
                </View>
              )
            ) : null}

            <Text style={styles.separateNote}>
              {t('inviteFive.separateFromSquad', {
                squad: squadDef
                  ? badgeDisplayName(t, squadDef)
                  : 'Squad',
              })}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.text,
  },
  progressLine: {
    ...typography.h2,
    color: colors.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  dot: {
    flex: 1,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 12,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  explain: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  codeValue: {
    ...typography.h2,
    color: colors.text,
    letterSpacing: 1,
  },
  linkValue: {
    ...typography.body,
    color: colors.primaryDark,
  },
  primaryBtnWrap: {
    marginTop: spacing.md,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryBtnWrap: {
    flex: 1,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  secondaryBtnText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  copiedHint: {
    ...typography.caption,
    color: colors.success,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  badgeLocked: {
    opacity: 0.72,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  badgeUnlocked: {
    backgroundColor: '#F5F3FF',
    borderColor: colors.primaryLight,
  },
  badgeEmoji: {
    fontSize: 36,
  },
  badgeCopy: {
    flex: 1,
    gap: 4,
  },
  badgeName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  badgeDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  badgeState: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
    marginTop: 2,
  },
  rewardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  discountCode: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  separateNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  shopDisabled: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  shopDisabledText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
