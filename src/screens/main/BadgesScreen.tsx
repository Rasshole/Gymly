/**
 * Badges-fane — sektioner, fremskridt, næsten låst op (≥70%)
 */

import React, {useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {useGymStore} from '@/store/gymStore';
import {
  useBadgeStore,
  getBadgeProgressList,
} from '@/store/badgeStore';
import {BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import {progressLabel} from '@/services/badgeEngine';
import type {BadgeCategory} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

const SECTION_ORDER: BadgeCategory[] = [
  'streak',
  'time',
  'sessions',
  'social',
];

const SECTION_TITLE: Record<BadgeCategory, string> = {
  streak: 'Streak',
  time: 'Tid',
  sessions: 'Sessioner',
  social: 'Social',
  records: 'Rekorder',
  exploration: 'Udforskning',
  elite: 'Elite',
};

export default function BadgesScreen() {
  const user = useAppStore(s => s.user);
  const userId = user?.id;
  const displayName = user?.displayName ?? 'Bruger';
  const syncBadges = useBadgeStore(s => s.syncBadgesForUser);
  const hydrated = useBadgeStore(s => s.hydrated);
  const unlockSnap = useBadgeStore(s =>
    userId ? s.unlockedByUser[userId] : undefined,
  );
  const streakKey = useDashboardStatsStore(s => s.streak);
  const workoutLen = useWorkoutStore(s => s.workouts.length);
  const checkInsLen = useGymStore(s => s.checkIns.length);

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

  const rows = useMemo(() => {
    if (!userId) {
      return [];
    }
    return getBadgeProgressList(userId);
  }, [userId, unlockSnap, streakKey, workoutLen, checkInsLen]);

  const almost = useMemo(
    () => rows.filter(r => r.progress.status === 'almost_unlocked'),
    [rows],
  );

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

  const [detail, setDetail] = React.useState<(typeof rows)[0] | null>(null);

  if (!userId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Log ind for at se badges</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Badges</Text>
        <Text style={styles.headerSub}>
          {unlockedCount} / {totalDefined} låst op
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {width: `${progressPct}%`}]} />
        </View>
      </View>

      {almost.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Næsten der</Text>
          <Text style={styles.sectionHint}>≥ 70% fremskridt</Text>
          <View style={styles.grid}>
            {almost.map(({def, progress}) => (
              <BadgeCard
                key={def.id}
                emoji={def.emoji}
                name={def.name}
                progressText={progressLabel(def, progress)}
                locked={false}
                almost
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
            <Text style={styles.sectionTitle}>{SECTION_TITLE[cat]}</Text>
            <View style={styles.grid}>
              {list.map(({def, progress}) => (
                <BadgeCard
                  key={def.id}
                  emoji={def.emoji}
                  name={def.name}
                  progressText={progressLabel(def, progress)}
                  locked={progress.status === 'locked'}
                  almost={progress.status === 'almost_unlocked'}
                  unlocked={progress.status === 'unlocked'}
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
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            {detail ? (
              <>
                <Text style={styles.modalEmoji}>{detail.def.emoji}</Text>
                <Text style={styles.modalName}>{detail.def.name}</Text>
                <Text style={styles.modalDesc}>{detail.def.description}</Text>
                <Text style={styles.modalMeta}>
                  {progressLabel(detail.def, detail.progress)}
                </Text>
                <TouchableOpacity
                  onPress={() => setDetail(null)}
                  style={styles.modalBtn}>
                  <Text style={styles.modalBtnText}>OK</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function BadgeCard({
  emoji,
  name,
  progressText,
  locked,
  almost: almostFlag,
  unlocked,
  onPress,
}: {
  emoji: string;
  name: string;
  progressText: string;
  locked?: boolean;
  almost?: boolean;
  unlocked?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        locked && styles.cardLocked,
        unlocked && styles.cardUnlocked,
        almostFlag && styles.cardAlmost,
      ]}
      onPress={onPress}
      activeOpacity={0.85}>
      <Text style={[styles.cardEmoji, locked && styles.cardEmojiMuted]}>{emoji}</Text>
      <Text style={[styles.cardName, locked && styles.cardNameMuted]} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.cardProgress} numberOfLines={2}>
        {progressText}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
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
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSub: {
    ...typography.body,
    color: colors.textSecondary,
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
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
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
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cardLocked: {
    opacity: 0.45,
  },
  cardUnlocked: {
    borderColor: 'rgba(139, 92, 246, 0.55)',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardAlmost: {
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  cardEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  cardEmojiMuted: {
    opacity: 0.7,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  cardNameMuted: {
    color: colors.textSecondary,
  },
  cardProgress: {
    fontSize: 10,
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
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
  },
  modalMeta: {
    ...typography.caption,
    color: colors.primary,
    marginBottom: spacing.lg,
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
