import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {useBadgeStore} from '@/store/badgeStore';
import type {BadgeDefinition} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type Props = {
  userId: string;
};

const MAX_BADGES = 6;

export function ProfileBadgeStrip({userId}: Props) {
  const navigation = useNavigation<any>();
  const unlockSnap = useBadgeStore(s => s.unlockedByUser[userId]);
  const [detail, setDetail] = useState<BadgeDefinition | null>(null);

  const recent = useMemo(
    () => {
      if (!unlockSnap) {
        return [];
      }
      const entries = Object.entries(unlockSnap).map(([badgeId, unlockedAt]) => ({
        badgeId,
        unlockedAt,
      }));
      entries.sort(
        (a, b) =>
          new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
      );
      const out: BadgeDefinition[] = [];
      for (const e of entries) {
        const def = BADGE_BY_ID[e.badgeId];
        if (def) {
          out.push(def);
        }
        if (out.length >= MAX_BADGES) {
          break;
        }
      }
      return out;
    },
    [unlockSnap],
  );

  const totalUnlocked = useMemo(
    () => (unlockSnap ? Object.keys(unlockSnap).length : 0),
    [unlockSnap],
  );

  if (totalUnlocked === 0) {
    return (
      <TouchableOpacity
        style={styles.emptyRow}
        onPress={() => navigation.navigate('Badges')}
        activeOpacity={0.85}>
        <Text style={styles.emptyEmoji}>🏅</Text>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>Ingen badges endnu</Text>
          <Text style={styles.emptySub}>
            Tjek ind og byg streak — se alle under Badges
          </Text>
        </View>
        <Text style={styles.emptyChev}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Badges</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Badges')}>
          <Text style={styles.seeAll}>Se alle</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {recent.map(def => (
          <TouchableOpacity
            key={def.id}
            style={styles.chip}
            onPress={() => setDetail(def)}
            activeOpacity={0.85}>
            <Text style={styles.chipEmoji}>{def.emoji}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
  strip: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  chipEmoji: {
    fontSize: 26,
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
