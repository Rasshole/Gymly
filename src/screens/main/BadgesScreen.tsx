/**
 * Badges-fane — sektioner, fremskridt, næsten låst op (>=70%)
 */

import React, {useMemo, useCallback, useState, useEffect, useRef} from 'react';
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
  Switch,
  Alert,
} from 'react-native';
import {useFocusEffect, useRoute, useNavigation} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {updateMyFeaturedBadgeIds} from '@/services/supabase/profileFeaturedBadgesService';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {
  useBadgeStore,
  getBadgeProgressList,
} from '@/store/badgeStore';
import {BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import {useTranslation, progressLabelT, rt} from '@/i18n';
import type {BadgeCategory, BadgeRarity} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type BadgeStatus = 'locked' | 'almost_unlocked' | 'unlocked';

const SECTION_ORDER: BadgeCategory[] = [
  'checkin',
  'streak',
  'sessions',
  'time',
  'messaging',
  'social',
  'planned',
  'habits',
  'elite',
];

const SECTION_TITLE_KEY: Record<BadgeCategory, string> = {
  streak: 'badges.sectionStreak',
  checkin: 'badges.sectionCheckin',
  time: 'badges.sectionTime',
  sessions: 'badges.sectionSessions',
  messaging: 'badges.sectionMessaging',
  social: 'badges.sectionSocial',
  planned: 'badges.sectionPlanned',
  habits: 'badges.sectionHabits',
  records: 'badges.sectionSessions',
  exploration: 'badges.sectionSocial',
  elite: 'badges.sectionElite',
};

const RARITY_KEY: Record<BadgeRarity, string> = {
  common: 'badges.rarityCommon',
  rare: 'badges.rarityRare',
  epic: 'badges.rarityEpic',
  legendary: 'badges.rarityLegendary',
};

export default function BadgesScreen() {
  const {t} = useTranslation();
  const route = useRoute();
  const navigation = useNavigation();
  const user = useAppStore(s => s.user);
  const setUser = useAppStore(s => s.setUser);
  const userId = user?.id;
  const displayName = user?.displayName ?? 'Bruger';
  const syncBadges = useBadgeStore(s => s.syncBadgesForUser);
  const hydrated = useBadgeStore(s => s.hydrated);
  const unlockSnap = useBadgeStore(s =>
    userId ? s.unlockedByUser[userId] : undefined,
  );
  const statsSnap = useBadgeStore(s => (userId ? s.statsByUser[userId] : undefined));
  const streakKey = useDashboardStatsStore(s => s.streak);

  useFocusEffect(
    useCallback(() => {
      if (hydrated && userId) {
        syncBadges(userId, displayName);
      }
    }, [hydrated, userId, displayName, syncBadges]),
  );

  const totalDefined = BADGE_DEFINITIONS.length;
  const unlockedCount = unlockSnap ? Object.keys(unlockSnap).length : 0;
  const progressPct =
    totalDefined > 0 ? Math.round((unlockedCount / totalDefined) * 100) : 0;
  const overviewAnim = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.95)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  const rows = useMemo(
    () => {
      if (!userId) {
        return [];
      }
      return getBadgeProgressList(userId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getBadgeProgressList læser zustand + stats; disse keys invaliderer ved ændring
    [userId, unlockSnap, statsSnap, streakKey],
  );

  const almost = useMemo(
    () => rows.filter(r => r.progress.status === 'almost_unlocked'),
    [rows],
  );

  const nextBadge = useMemo(() => {
    const remaining = rows
      .filter(r => r.progress.status !== 'unlocked')
      .sort((a, b) => b.progress.percent - a.progress.percent);
    return remaining[0] ?? null;
  }, [rows]);

  useEffect(() => {
    Animated.timing(overviewAnim, {
      toValue: progressPct,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [overviewAnim, progressPct]);

  const bySection = useMemo(() => {
    const m = new Map<BadgeCategory, typeof rows>();
    for (const cat of SECTION_ORDER) {
      m.set(cat, []);
    }
    for (const r of rows) {
      const cat = r.def.category;
      if (!m.has(cat)) {
        m.set(cat, []);
      }
      m.get(cat)!.push(r);
    }
    return m;
  }, [rows]);

  const [detail, setDetail] = useState<(typeof rows)[0] | null>(null);
  const [highlightRingId, setHighlightRingId] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) {
      modalOpacity.setValue(0);
      modalScale.setValue(0.95);
      return;
    }
    modalOpacity.setValue(0);
    modalScale.setValue(0.9);
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(modalScale, {
          toValue: 1.05,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          friction: 7,
          tension: 130,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [detail, modalOpacity, modalScale]);

  const routeHighlightId = (route.params as {highlightBadgeId?: string} | undefined)
    ?.highlightBadgeId;

  useFocusEffect(
    useCallback(() => {
      if (!routeHighlightId || !userId) {
        return;
      }
      const list = getBadgeProgressList(userId);
      const row = list.find(r => r.def.id === routeHighlightId);
      if (row) {
        setDetail({def: row.def, progress: row.progress});
        setHighlightRingId(routeHighlightId);
        const t = setTimeout(() => setHighlightRingId(null), 3500);
        navigation.setParams({highlightBadgeId: undefined} as never);
        return () => clearTimeout(t);
      }
      navigation.setParams({highlightBadgeId: undefined} as never);
    }, [routeHighlightId, userId, navigation]),
  );

  if (!userId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{t('badges.loginRequired')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('badges.title')}</Text>
        <Text style={styles.headerSubMain}>
          {t('badges.unlocked', {unlocked: unlockedCount, total: totalDefined})}
        </Text>
        <Text style={styles.headerSub}>{t('badges.keepGoing')}</Text>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: overviewAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </View>

      {nextBadge ? (
        <View style={styles.nextBadgeCard}>
          <Text style={styles.nextBadgeTitle}>{t('badges.nextBadge')}</Text>
          <Text style={styles.nextBadgeName} numberOfLines={1}>
            {nextBadge.def.emoji} {nextBadge.def.name}
          </Text>
          <Text style={styles.nextBadgeHint}>
            {t('badges.onlyLeft', {
              percent: Math.max(1, 100 - Math.round(nextBadge.progress.percent)),
            })}
          </Text>
          <Text style={styles.nextBadgeMeta}>
            {progressLabelT(t, nextBadge.def, nextBadge.progress)}
          </Text>
        </View>
      ) : null}

      {almost.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('badges.almostThere')}</Text>
            <View style={styles.sectionDivider} />
          </View>
          <Text style={styles.sectionHint}>{t('badges.progressHint')}</Text>
          <View style={styles.grid}>
            {almost.map(({def, progress}) => (
              <BadgeCard
                key={def.id}
                emoji={def.emoji}
                name={def.name}
                rarity={def.rarity}
                progressText={progressLabelT(t, def, progress)}
                progressPercent={progress.percent}
                status="almost_unlocked"
                pulsingHighlight={highlightRingId === def.id}
                onPress={() => setDetail({def, progress})}
              />
            ))}
          </View>
        </View>
      ) : null}

      {SECTION_ORDER.map(cat => {
        const list = bySection.get(cat) ?? [];
        if (list.length === 0) {
          return null;
        }
        return (
          <View key={cat} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t(SECTION_TITLE_KEY[cat])}</Text>
              <View style={styles.sectionDivider} />
            </View>
            <View style={styles.grid}>
              {list.map(({def, progress}) => (
                <BadgeCard
                  key={def.id}
                  emoji={def.emoji}
                  name={def.name}
                  rarity={def.rarity}
                  progressText={progressLabelT(t, def, progress)}
                  progressPercent={progress.percent}
                  status={progress.status as BadgeStatus}
                  pulsingHighlight={highlightRingId === def.id}
                  onPress={() => setDetail({def, progress})}
                />
              ))}
            </View>
          </View>
        );
      })}

      <Modal
        visible={detail != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Animated.View style={{opacity: modalOpacity, transform: [{scale: modalScale}]}}>
            <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
              {detail ? (
                <>
                  <Text style={styles.modalEmoji}>{detail.def.emoji}</Text>
                  <View style={styles.modalRarityPill}>
                    <Text style={styles.modalRarityText}>
                      {t(RARITY_KEY[detail.def.rarity])}
                    </Text>
                  </View>
                  <Text style={styles.modalName}>{detail.def.name}</Text>
                  <Text style={styles.modalDesc}>{detail.def.description}</Text>
                  <Text style={styles.modalMeta}>
                    {progressLabelT(t, detail.def, detail.progress)}
                  </Text>
                  {detail.progress.status === 'unlocked' && user ? (
                    <View style={styles.featuredRow}>
                      <Text style={styles.featuredLabel}>{t('badges.showOnProfile')}</Text>
                      <Switch
                        value={(user.featuredBadgeIds ?? []).includes(detail.def.id)}
                        onValueChange={async on => {
                          if (!userId) {
                            return;
                          }
                          const cur = [...(user.featuredBadgeIds ?? [])];
                          if (on) {
                            if (cur.includes(detail.def.id)) {
                              return;
                            }
                            if (cur.length >= 3) {
                              Alert.alert(
                                '',
                                t('badges.highlightMax'),
                              );
                              return;
                            }
                            cur.push(detail.def.id);
                          } else {
                            const i = cur.indexOf(detail.def.id);
                            if (i >= 0) {
                              cur.splice(i, 1);
                            }
                          }
                          try {
                            const saved = await updateMyFeaturedBadgeIds(
                              userId,
                              cur,
                            );
                            setUser({...user, featuredBadgeIds: saved});
                          } catch {
                            Alert.alert('', t('errors.couldNotSave'));
                          }
                        }}
                      />
                    </View>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setDetail(null)}
                    style={styles.modalBtn}
                    activeOpacity={0.88}>
                    <Text style={styles.modalBtnText}>{t('common.continue')}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function MiniProgressBar({percent}: {percent: number}) {
  const anim = useRef(new Animated.Value(percent)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(100, percent)),
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent, anim]);
  const widthInterpolated = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  return (
    <View style={styles.miniBarBg} accessibilityRole="progressbar">
      <Animated.View style={[styles.miniBarFill, {width: widthInterpolated}]} />
    </View>
  );
}

function BadgeCard({
  emoji,
  name,
  rarity,
  progressText,
  progressPercent = 0,
  status,
  pulsingHighlight,
  onPress,
}: {
  emoji: string;
  name: string;
  rarity: BadgeRarity;
  progressText: string;
  progressPercent?: number;
  status: BadgeStatus;
  pulsingHighlight?: boolean;
  onPress: () => void;
}) {
  const isLocked = status === 'locked';
  const isUnlocked = status === 'unlocked';
  const isAlmost = status === 'almost_unlocked';

  const rarityStyle =
    !isLocked && (isUnlocked || isAlmost)
      ? rarity === 'legendary'
        ? styles.cardRarityLegendary
        : rarity === 'epic'
          ? styles.cardRarityEpic
          : rarity === 'rare'
            ? styles.cardRarityRare
            : styles.cardRarityCommon
      : null;

  return (
    <Pressable
      style={({pressed}) => [
        styles.card,
        isLocked && styles.cardLocked,
        isUnlocked && styles.cardUnlocked,
        isAlmost && styles.cardAlmost,
        rarityStyle,
        pulsingHighlight && styles.cardFromNotif,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}>
      <View style={styles.cardEmojiRow}>
        <Text style={[styles.cardEmoji, isLocked && styles.cardEmojiMuted]}>{emoji}</Text>
        {isUnlocked ? (
          <View style={styles.cardCheckWrap}>
            <Text style={styles.cardCheck} accessibilityLabel={rt('badges.achieved')}>
              ✓
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.cardName, isLocked && styles.cardNameMuted]} numberOfLines={2}>
        {name}
      </Text>
      <MiniProgressBar percent={progressPercent} />
      <Text style={[styles.cardProgress, isLocked && styles.cardNameMuted]} numberOfLines={2}>
        {progressText}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  header: {
    paddingTop: spacing.sm,
    marginBottom: spacing.lg + 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  headerSubMain: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  headerSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primaryDark,
    borderRadius: radius.full,
  },
  nextBadgeCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  nextBadgeTitle: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  nextBadgeName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  nextBadgeHint: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    marginBottom: 2,
  },
  nextBadgeMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.xl + 2,
  },
  sectionHeaderRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLocked: {
    opacity: 0.66,
    backgroundColor: '#F3F4F6',
  },
  cardFromNotif: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardUnlocked: {
    transform: [{scale: 1.03}],
    elevation: 4,
  },
  cardRarityCommon: {
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  cardRarityRare: {
    borderColor: 'rgba(139, 92, 246, 0.85)',
    shadowColor: 'rgb(139, 92, 246)',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  cardRarityEpic: {
    borderColor: 'rgba(167, 139, 250, 0.95)',
    shadowColor: 'rgb(167, 139, 250)',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  cardRarityLegendary: {
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.9)',
    shadowColor: 'rgb(250, 204, 21)',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  cardAlmost: {
    borderColor: 'rgba(139, 92, 246, 0.4)',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    transform: [{scale: 0.98}],
  },
  cardEmojiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    marginBottom: 4,
    position: 'relative',
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardCheckWrap: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  cardCheck: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  miniBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 6,
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  cardEmojiMuted: {
    opacity: 0.72,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  cardNameMuted: {
    color: colors.textSecondary,
  },
  cardProgress: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl + 2,
    alignItems: 'center',
    width: 340,
    maxWidth: '100%',
  },
  modalEmoji: {
    fontSize: 60,
    marginBottom: spacing.sm,
  },
  modalRarityPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    marginBottom: spacing.sm,
  },
  modalRarityText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  modalName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalMeta: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    marginBottom: spacing.md,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  featuredLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  modalBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    width: '100%',
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  modalBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
