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
import {getBadgeProgressList, useBadgeStore} from '@/store/badgeStore';
import type {BadgeDefinition} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

type Props = {
  userId: string;
  /** Fra `profiles.featured_badge_ids` (egen bruger synkes via realtime). */
  featuredBadgeIds?: string[] | null;
  /** Når man ser en andens profil: anden copy, ingen navigation til egen Badges-fane */
  viewingOtherUser?: boolean;
  otherUserDisplayName?: string;
};

type UnlockedBadgeItem = {
  def: BadgeDefinition;
  unlockedAt: string;
};

const BADGE_SIZE = 70;
const BADGE_GAP = 14;
const ROW_H_PADDING = 18;
const ROW_V_PADDING = 10;
const EDGE_FADE_WIDTH = 28;
const CENTER_MAX_COUNT = 3;

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
  def,
  isNewest,
  onPress,
  entranceEpoch,
}: {
  def: BadgeDefinition;
  isNewest: boolean;
  onPress: () => void;
  entranceEpoch: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const stopAll = useCallback(() => {
    scale.stopAnimation(() => {});
    pulseRef.current?.stop();
    pulseRef.current = null;
  }, [scale]);

  useEffect(() => {
    if (!isNewest) {
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
  }, [isNewest, entranceEpoch, scale, stopAll]);

  const tileStyle = [styles.badgeTile, isNewest && styles.badgeTileNewest];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.badgeTouch}
      accessibilityRole="button"
      accessibilityLabel={`Badge ${def.name}`}>
      <Animated.View style={[tileStyle, {transform: [{scale}]}]}>
        <Text style={styles.badgeEmoji}>{def.emoji}</Text>
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
  const [detail, setDetail] = useState<BadgeDefinition | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [stripHeight, setStripHeight] = useState(BADGE_SIZE + ROW_V_PADDING * 2);
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

  const sortedBadges = useMemo((): UnlockedBadgeItem[] => {
    if (!unlockSnap) {
      return [];
    }
    const entries = Object.entries(unlockSnap)
      .map(([badgeId, unlockedAt]) => {
        const def = BADGE_BY_ID[badgeId];
        if (!def) {
          return null;
        }
        return {def, unlockedAt};
      })
      .filter(Boolean) as UnlockedBadgeItem[];

    entries.sort(
      (a, b) =>
        new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
    );
    return entries;
  }, [unlockSnap]);

  const displayBadges = useMemo((): UnlockedBadgeItem[] => {
    if (viewingOtherUser) {
      const ids = (featuredBadgeIds ?? []).filter(id => BADGE_BY_ID[id]).slice(0, 3);
      return ids.map(id => ({
        def: BADGE_BY_ID[id],
        unlockedAt: '',
      }));
    }
    const snap = unlockSnap ?? {};
    const featured = (featuredBadgeIds ?? [])
      .filter(id => BADGE_BY_ID[id] && snap[id])
      .slice(0, 3);
    if (featured.length > 0) {
      return featured.map(id => ({
        def: BADGE_BY_ID[id],
        unlockedAt: snap[id] ?? '',
      }));
    }
    return sortedBadges.slice(0, 3);
  }, [viewingOtherUser, featuredBadgeIds, unlockSnap, sortedBadges]);

  const manualFeatured =
    !viewingOtherUser && (featuredBadgeIds?.length ?? 0) > 0;
  const newestId = sortedBadges[0]?.def.id ?? null;
  const count = viewingOtherUser ? displayBadges.length : sortedBadges.length;
  const rowCount = displayBadges.length;
  const useCenteredRow = rowCount > 0 && rowCount <= CENTER_MAX_COUNT;

  useEffect(() => {
    if (manualFeatured || !newestId || count === 0) {
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
  }, [newestId, count, manualFeatured]);

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

  const totalUnlocked = count;
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
  }, [userId, unlockSnap]);

  if (totalUnlocked === 0 && !(viewingOtherUser && displayBadges.length > 0)) {
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
        <Text style={styles.title}>Badges</Text>
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
          {displayBadges.map(item => {
            const isNewest =
              !manualFeatured &&
              !viewingOtherUser &&
              newestId != null &&
              item.def.id === newestId;
            return (
              <ProfileBadgeCell
                key={item.def.id}
                def={item.def}
                isNewest={isNewest}
                entranceEpoch={isNewest ? newestEntranceEpoch : 0}
                onPress={() => setDetail(item.def)}
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
                <Text style={styles.modalEmoji}>{detail.emoji}</Text>
                <Text style={styles.modalName}>{detail.name}</Text>
                <Text style={styles.modalDesc}>{detail.description}</Text>
                {!viewingOtherUser && badgeProgressById[detail.id] ? (
                  <>
                    <View style={styles.modalProgressTrack}>
                      <View
                        style={[
                          styles.modalProgressFill,
                          {width: `${badgeProgressById[detail.id].percent}%`},
                        ]}
                      />
                    </View>
                    <Text style={styles.modalProgressText}>
                      {badgeProgressById[detail.id].current} /{' '}
                      {badgeProgressById[detail.id].required}
                    </Text>
                    <Text style={styles.modalHint}>
                      Du mangler {badgeProgressById[detail.id].left} for næste level
                    </Text>
                  </>
                ) : viewingOtherUser ? (
                  <Text style={styles.modalHintMuted}>Fremhævet på profilen</Text>
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
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
    minHeight: BADGE_SIZE + ROW_V_PADDING * 2,
  },
  scrollContentScrolling: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexGrow: 0,
  },
  badgeTouch: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
  },
  badgeTile: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
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
    fontSize: 30,
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
    marginBottom: spacing.lg,
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
