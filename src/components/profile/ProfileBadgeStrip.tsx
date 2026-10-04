import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Easing,
  type LayoutChangeEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {upcomingBadgeHintT} from '@/i18n/badgeLabels';
import {badgeDisplayName} from '@/i18n/badgeDisplay';
import type {BadgeDefinition, BadgeProgress} from '@/types/badge.types';
import {getBadgeProgressList, useBadgeStore} from '@/store/badgeStore';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {GymlyPressable} from '@/components/ui/GymlyPressable';

type Props = {
  userId: string;
  /** Kun til andres profil: fremhævede badges hvis ingen unlocks er hentet endnu. */
  featuredBadgeIds?: string[] | null;
  viewingOtherUser?: boolean;
  otherUserDisplayName?: string;
};

type UnlockedStripItem = {
  kind: 'unlocked';
  def: BadgeDefinition;
  unlockedAt: string;
};

type UpcomingStripItem = {
  kind: 'upcoming';
  def: BadgeDefinition;
  progress: BadgeProgress;
  hint: string;
};

type StripItem = UnlockedStripItem | UpcomingStripItem;

const BADGE_GAP = spacing.md; // 12
const NATURAL_TILE_W = 96;
const MIN_TILE_W = 84;
const MAX_PREVIEW = 3;

function formatEarnedAt(iso: string, intlLocale: string): string {
  if (!iso) {
    return '';
  }
  try {
    return new Date(iso).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function ProfileBadgeCell({
  item,
  isNewest,
  onPress,
  entranceEpoch,
  width,
}: {
  item: StripItem;
  isNewest: boolean;
  onPress: () => void;
  entranceEpoch: number;
  width: number;
}) {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const isUpcoming = item.kind === 'upcoming';

  const stopAll = useCallback(() => {
    scale.stopAnimation(() => {});
    pulseRef.current?.stop();
    pulseRef.current = null;
  }, [scale]);

  useEffect(() => {
    if (isUpcoming || !isNewest) {
      stopAll();
      scale.setValue(1);
      return;
    }

    const startPulse = () => {
      stopAll();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.01,
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseRef.current = loop;
      loop.start();
    };

    if (entranceEpoch === 0) {
      scale.setValue(1.02);
      const pulseTimer = setTimeout(startPulse, 500);
      return () => {
        clearTimeout(pulseTimer);
        stopAll();
      };
    }

    stopAll();
    scale.setValue(0.94);
    const entrance = Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.04,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.02,
        friction: 7,
        tension: 120,
        useNativeDriver: true,
      }),
    ]);
    entrance.start(({finished}) => {
      if (finished) {
        startPulse();
      }
    });

    return () => {
      entrance.stop?.();
      stopAll();
    };
  }, [isNewest, isUpcoming, entranceEpoch, scale, stopAll]);

  const tileStyle = [
    styles.badgeTile,
    {width},
    isUpcoming && styles.badgeTileUpcoming,
    isNewest && !isUpcoming && styles.badgeTileNewest,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[styles.badgeTouch, {width}]}
      accessibilityRole="button"
      accessibilityLabel={
        isUpcoming
          ? t('badgesA11y.upcoming', {name: badgeDisplayName(t, item.def)})
          : t('badgesA11y.earned', {name: badgeDisplayName(t, item.def)})
      }>
      <Animated.View style={[tileStyle, {transform: [{scale}]}]}>
        <Text style={[styles.badgeEmoji, isUpcoming && styles.badgeEmojiMuted]}>
          {item.def.emoji}
        </Text>
        {isUpcoming ? (
          <Text style={styles.badgeHint}>{item.hint}</Text>
        ) : (
          <Text style={styles.badgeName}>{badgeDisplayName(t, item.def)}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export function ProfileBadgeStrip({
  userId,
  featuredBadgeIds = null,
  viewingOtherUser = false,
  otherUserDisplayName = '',
}: Props) {
  const {t, intlLocale} = useTranslation();
  const navigation = useNavigation<any>();
  const unlockSnap = useBadgeStore(s => s.unlockedByUser[userId]);
  const statsSnap = useBadgeStore(s => s.statsByUser[userId]);
  const hydrateFromServer = useBadgeStore(s => s.hydrateUserBadgesFromServer);
  const [detail, setDetail] = useState<StripItem | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [newestEntranceEpoch, setNewestEntranceEpoch] = useState(0);
  const initializedRef = useRef(false);
  const prevNewestIdRef = useRef<string | null>(null);

  useEffect(() => {
    initializedRef.current = false;
    prevNewestIdRef.current = null;
    setNewestEntranceEpoch(0);
  }, [userId]);

  useEffect(() => {
    if (viewingOtherUser && userId) {
      void hydrateFromServer(userId);
    }
  }, [viewingOtherUser, userId, hydrateFromServer]);

  const sortedUnlocked = useMemo((): UnlockedStripItem[] => {
    if (!unlockSnap) {
      return [];
    }
    const entries = Object.entries(unlockSnap)
      .map(([badgeId, unlockedAt]) => {
        const def = BADGE_BY_ID[badgeId];
        if (!def) {
          return null;
        }
        return {kind: 'unlocked' as const, def, unlockedAt};
      })
      .filter(Boolean) as UnlockedStripItem[];

    entries.sort(
      (a, b) =>
        new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
    );
    return entries;
  }, [unlockSnap]);

  const upcomingItems = useMemo((): UpcomingStripItem[] => {
    if (viewingOtherUser) {
      return [];
    }
    return getBadgeProgressList(userId)
      .filter(r => r.progress.status !== 'unlocked')
      .sort((a, b) => b.progress.percent - a.progress.percent)
      .slice(0, MAX_PREVIEW)
      .map(r => ({
        kind: 'upcoming' as const,
        def: r.def,
        progress: r.progress,
        hint: upcomingBadgeHintT(t, r.def, r.progress),
      }));
  }, [userId, viewingOtherUser, unlockSnap, statsSnap, t]);

  const displayItems = useMemo((): StripItem[] => {
    if (sortedUnlocked.length > 0) {
      return sortedUnlocked.slice(0, MAX_PREVIEW);
    }
    if (viewingOtherUser) {
      const ids = (featuredBadgeIds ?? [])
        .filter(id => BADGE_BY_ID[id])
        .slice(0, MAX_PREVIEW);
      return ids.map(id => ({
        kind: 'unlocked' as const,
        def: BADGE_BY_ID[id],
        unlockedAt: '',
      }));
    }
    return upcomingItems;
  }, [sortedUnlocked, viewingOtherUser, featuredBadgeIds, upcomingItems]);

  const showUpcomingFallback =
    !viewingOtherUser && sortedUnlocked.length === 0 && upcomingItems.length > 0;

  const newestId =
    sortedUnlocked.length > 0 ? sortedUnlocked[0].def.id : null;
  const rowCount = displayItems.length;

  useEffect(() => {
    if (showUpcomingFallback || !newestId || sortedUnlocked.length === 0) {
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevNewestIdRef.current = newestId;
      return;
    }
    if (prevNewestIdRef.current !== newestId) {
      prevNewestIdRef.current = newestId;
      setNewestEntranceEpoch(e => e + 1);
    }
  }, [newestId, sortedUnlocked.length, showUpcomingFallback]);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== gridWidth) {
      setGridWidth(w);
    }
  }, [gridWidth]);

  const {tileWidth} = useMemo(() => {
    const count = Math.max(1, rowCount);
    if (gridWidth <= 0) {
      return {tileWidth: NATURAL_TILE_W};
    }

    let cols = Math.min(count, MAX_PREVIEW);
    while (cols > 1) {
      const w = (gridWidth - BADGE_GAP * (cols - 1)) / cols;
      if (w >= MIN_TILE_W) {
        break;
      }
      cols -= 1;
    }

    // 1–2 badges: keep a natural card size (don’t stretch full width).
    if (count < 3) {
      const equal = (gridWidth - BADGE_GAP * (cols - 1)) / cols;
      return {
        tileWidth: Math.min(NATURAL_TILE_W, Math.max(MIN_TILE_W, equal)),
      };
    }

    return {
      tileWidth: (gridWidth - BADGE_GAP * (cols - 1)) / cols,
    };
  }, [gridWidth, rowCount]);

  const badgeProgressById = useMemo(() => {
    const list = getBadgeProgressList(userId);
    const out: Record<
      string,
      {current: number; required: number; left: number; percent: number}
    > = {};
    list.forEach(({def, progress}) => {
      out[def.id] = {
        current: progress.current,
        required: progress.target,
        left: Math.max(0, progress.target - progress.current),
        percent: progress.percent,
      };
    });
    return out;
  }, [userId, unlockSnap, statsSnap]);

  if (rowCount === 0) {
    const name = (otherUserDisplayName || t('phase2ui.userFallback')).trim();
    const sub = viewingOtherUser
      ? t('phase2ui.noBadgesShared', {name})
      : t('phase2ui.noBadgesHint');
    const content = (
      <>
        <Text style={styles.emptyEmoji}>🏅</Text>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>{t('phase2ui.noBadgesYet')}</Text>
          <Text style={styles.emptySub}>{sub}</Text>
        </View>
        {viewingOtherUser ? null : <Text style={styles.emptyChev}>›</Text>}
      </>
    );
    if (viewingOtherUser) {
      return <View style={[styles.wrap, styles.emptyRow]}>{content}</View>;
    }
    return (
      <TouchableOpacity
        style={[styles.wrap, styles.emptyRow]}
        onPress={() => navigation.navigate('Badges')}
        activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t('tabs.badges')}</Text>
          {showUpcomingFallback ? (
            <Text style={styles.titleSub}>{t('profile.nextMilestones')}</Text>
          ) : null}
        </View>
        {viewingOtherUser ? null : (
          <GymlyPressable
            onPress={() => navigation.navigate('Badges')}
            haptic="selection"
            hitSlop={{top: 10, bottom: 10, left: 12, right: 4}}
            accessibilityRole="button"
            accessibilityLabel={t('profile.seeAll')}
            style={styles.seeAllHit}>
            <Text style={styles.seeAll}>{t('profile.seeAll')}</Text>
          </GymlyPressable>
        )}
      </View>

      <View
        style={[
          styles.grid,
          rowCount < 3 ? styles.gridNatural : null,
        ]}
        onLayout={onGridLayout}>
        {displayItems.map(item => {
          const isNewest =
            !showUpcomingFallback &&
            !viewingOtherUser &&
            item.kind === 'unlocked' &&
            newestId != null &&
            item.def.id === newestId;
          return (
            <ProfileBadgeCell
              key={item.def.id}
              item={item}
              isNewest={isNewest}
              entranceEpoch={isNewest ? newestEntranceEpoch : 0}
              width={tileWidth}
              onPress={() => setDetail(item)}
            />
          );
        })}
      </View>

      <Modal
        visible={detail != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            {detail ? (
              <>
                <Text style={styles.modalEmoji}>{detail.def.emoji}</Text>
                <Text style={styles.modalName}>
                  {badgeDisplayName(t, detail.def)}
                </Text>
                <Text style={styles.modalDesc}>{detail.def.description}</Text>
                {detail.kind === 'unlocked' ? (
                  <>
                    {detail.unlockedAt ? (
                      <Text style={styles.modalEarned}>
                        {t('phase2ui.earnedAt', {
                          date: formatEarnedAt(detail.unlockedAt, intlLocale),
                        })}
                      </Text>
                    ) : viewingOtherUser ? (
                      <Text style={styles.modalHintMuted}>
                        {t('phase2ui.featuredOnProfile')}
                      </Text>
                    ) : null}
                  </>
                ) : !viewingOtherUser && badgeProgressById[detail.def.id] ? (
                  <>
                    <View style={styles.modalProgressTrack}>
                      <View
                        style={[
                          styles.modalProgressFill,
                          {width: `${badgeProgressById[detail.def.id].percent}%`},
                        ]}
                      />
                    </View>
                    <Text style={styles.modalProgressText}>
                      {badgeProgressById[detail.def.id].current} /{' '}
                      {badgeProgressById[detail.def.id].required}
                    </Text>
                    <Text style={styles.modalHint}>{detail.hint}</Text>
                  </>
                ) : null}
                <TouchableOpacity onPress={() => setDetail(null)} style={styles.modalBtn}>
                  <Text style={styles.modalBtnText}>{t('common.ok')}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  titleSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  seeAllHit: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  seeAll: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BADGE_GAP,
    width: '100%',
  },
  gridNatural: {
    justifyContent: 'flex-start',
  },
  badgeTouch: {
    flexGrow: 0,
    flexShrink: 0,
  },
  badgeTile: {
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...shadows.sm,
  },
  badgeTileUpcoming: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '06',
    opacity: 0.92,
  },
  badgeTileNewest: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  badgeEmojiMuted: {
    opacity: 0.88,
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 14,
  },
  badgeHint: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primaryDark,
    textAlign: 'center',
    lineHeight: 13,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  emptyBody: {
    flex: 1,
  },
  emptyTitle: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyChev: {
    fontSize: 22,
    color: colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 60,
    marginBottom: spacing.md,
  },
  modalName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalEarned: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalProgressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  modalProgressText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: 6,
  },
  modalHint: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalHintMuted: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  modalBtnText: {
    color: colors.white,
    fontWeight: '700',
  },
});
