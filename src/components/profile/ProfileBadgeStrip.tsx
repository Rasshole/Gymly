import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {upcomingBadgeHint} from '@/services/badgeEngine';
import type {BadgeDefinition, BadgeProgress} from '@/types/badge.types';
import {getBadgeProgressList, useBadgeStore} from '@/store/badgeStore';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

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

const BADGE_TILE_W = 88;
const BADGE_GAP = 12;
const ROW_H_PADDING = 18;
const ROW_V_PADDING = 10;
const EDGE_FADE_WIDTH = 28;
const CENTER_MAX_COUNT = 3;

function formatEarnedAt(iso: string): string {
  if (!iso) {
    return '';
  }
  try {
    return new Date(iso).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function ScrollEdgeFade({
  side,
  height,
  gradientId,
}: {
  side: 'left' | 'right';
  height: number;
  gradientId: string;
}) {
  const x1 = side === 'left' ? '0' : '1';
  const x2 = side === 'left' ? '1' : '0';
  return (
    <View
      pointerEvents="none"
      style={[
        styles.edgeFade,
        side === 'left' ? styles.edgeFadeLeft : styles.edgeFadeRight,
        {width: EDGE_FADE_WIDTH, height},
      ]}>
      <Svg width={EDGE_FADE_WIDTH} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1={x1} y1="0" x2={x2} y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={EDGE_FADE_WIDTH} height={height} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

function ProfileBadgeCell({
  item,
  isNewest,
  onPress,
  entranceEpoch,
}: {
  item: StripItem;
  isNewest: boolean;
  onPress: () => void;
  entranceEpoch: number;
}) {
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
            toValue: 1.09,
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.045,
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
      scale.setValue(1.06);
      const t = setTimeout(startPulse, 500);
      return () => {
        clearTimeout(t);
        stopAll();
      };
    }

    stopAll();
    scale.setValue(0.9);
    const entrance = Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.12,
        friction: 5.5,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.06,
        friction: 6,
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
    isUpcoming && styles.badgeTileUpcoming,
    isNewest && !isUpcoming && styles.badgeTileNewest,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.badgeTouch}
      accessibilityRole="button"
      accessibilityLabel={
        isUpcoming
          ? `Kommende badge ${item.def.name}`
          : `Badge ${item.def.name} optjent`
      }>
      <Animated.View style={[tileStyle, {transform: [{scale}]}]}>
        <Text style={[styles.badgeEmoji, isUpcoming && styles.badgeEmojiMuted]}>
          {item.def.emoji}
        </Text>
        {isUpcoming ? (
          <Text style={styles.badgeHint} numberOfLines={2}>
            {item.hint}
          </Text>
        ) : (
          <Text style={styles.badgeName} numberOfLines={2}>
            {item.def.name}
          </Text>
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
  const navigation = useNavigation<any>();
  const unlockSnap = useBadgeStore(s => s.unlockedByUser[userId]);
  const statsSnap = useBadgeStore(s => s.statsByUser[userId]);
  const hydrateFromServer = useBadgeStore(s => s.hydrateUserBadgesFromServer);
  const [detail, setDetail] = useState<StripItem | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [stripHeight, setStripHeight] = useState(100);
  const [scrollW, setScrollW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [newestEntranceEpoch, setNewestEntranceEpoch] = useState(0);
  const initializedRef = useRef(false);
  const prevNewestIdRef = useRef<string | null>(null);
  const fadeId = useRef(`pf_${Math.random().toString(36).slice(2)}`).current;

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
      .slice(0, 3)
      .map(r => ({
        kind: 'upcoming' as const,
        def: r.def,
        progress: r.progress,
        hint: upcomingBadgeHint(r.def, r.progress),
      }));
  }, [userId, viewingOtherUser, unlockSnap, statsSnap]);

  const displayItems = useMemo((): StripItem[] => {
    if (sortedUnlocked.length > 0) {
      return sortedUnlocked.slice(0, 3);
    }
    if (viewingOtherUser) {
      const ids = (featuredBadgeIds ?? [])
        .filter(id => BADGE_BY_ID[id])
        .slice(0, 3);
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
  const useCenteredRow = rowCount > 0 && rowCount <= CENTER_MAX_COUNT;

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
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({x: 0, animated: true});
      });
    }
  }, [newestId, sortedUnlocked.length, showUpcomingFallback]);

  const onScrollLayout = useCallback((e: LayoutChangeEvent) => {
    setScrollW(e.nativeEvent.layout.width);
  }, []);

  const onStripLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setStripHeight(h);
    }
  }, []);

  const showEdgeFade =
    rowCount > CENTER_MAX_COUNT && contentW > scrollW + 4 && scrollW > 0;

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
    const name = (otherUserDisplayName || 'Brugeren').trim();
    const sub = viewingOtherUser
      ? `${name} har ikke delt badges på profilen`
      : 'Tjek ind og byg streak — se alle under Badges';
    const content = (
      <>
        <Text style={styles.emptyEmoji}>🏅</Text>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>Ingen badges endnu</Text>
          <Text style={styles.emptySub}>{sub}</Text>
        </View>
        {viewingOtherUser ? null : <Text style={styles.emptyChev}>›</Text>}
      </>
    );
    if (viewingOtherUser) {
      return <View style={styles.emptyRow}>{content}</View>;
    }
    return (
      <TouchableOpacity
        style={styles.emptyRow}
        onPress={() => navigation.navigate('Badges')}
        activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  const contentContainerStyle = useCenteredRow
    ? [
        styles.scrollContentCentered,
        {
          paddingHorizontal: ROW_H_PADDING,
          paddingVertical: ROW_V_PADDING,
          gap: BADGE_GAP,
        },
      ]
    : [
        styles.scrollContentScrolling,
        {
          paddingLeft: ROW_H_PADDING,
          paddingRight: ROW_H_PADDING,
          paddingVertical: ROW_V_PADDING,
          gap: BADGE_GAP,
        },
      ];

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Badges</Text>
          {showUpcomingFallback ? (
            <Text style={styles.titleSub}>Næste milepæle</Text>
          ) : null}
        </View>
        {viewingOtherUser ? null : (
          <TouchableOpacity onPress={() => navigation.navigate('Badges')}>
            <Text style={styles.seeAll}>Se alle</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stripOuter} onLayout={onStripLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={rowCount > CENTER_MAX_COUNT}
          scrollEnabled={rowCount > CENTER_MAX_COUNT}
          onLayout={onScrollLayout}
          onContentSizeChange={w => setContentW(w)}
          contentContainerStyle={contentContainerStyle}>
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
                onPress={() => setDetail(item)}
              />
            );
          })}
        </ScrollView>
        {showEdgeFade ? (
          <>
            <ScrollEdgeFade
              side="left"
              height={stripHeight}
              gradientId={`${fadeId}_L`}
            />
            <ScrollEdgeFade
              side="right"
              height={stripHeight}
              gradientId={`${fadeId}_R`}
            />
          </>
        ) : null}
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
                <Text style={styles.modalName}>{detail.def.name}</Text>
                <Text style={styles.modalDesc}>{detail.def.description}</Text>
                {detail.kind === 'unlocked' ? (
                  <>
                    {detail.unlockedAt ? (
                      <Text style={styles.modalEarned}>
                        Optjent {formatEarnedAt(detail.unlockedAt)}
                      </Text>
                    ) : viewingOtherUser ? (
                      <Text style={styles.modalHintMuted}>Fremhævet på profilen</Text>
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
                  <Text style={styles.modalBtnText}>OK</Text>
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
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  titleBlock: {
    flex: 1,
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
  seeAll: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  stripOuter: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  scrollContentCentered: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  scrollContentScrolling: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexGrow: 0,
  },
  badgeTouch: {
    width: BADGE_TILE_W,
  },
  badgeTile: {
    width: BADGE_TILE_W,
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    ...shadows.sm,
  },
  badgeTileUpcoming: {
    borderStyle: 'dashed',
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '06',
    opacity: 0.92,
  },
  badgeTileNewest: {
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
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
  edgeFade: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  edgeFadeLeft: {
    left: 0,
  },
  edgeFadeRight: {
    right: 0,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
