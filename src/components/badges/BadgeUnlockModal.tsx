import React, {useEffect, useRef} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
  Easing,
} from 'react-native';
import type {BadgeDefinition, BadgeRarity} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type Props = {
  visible: boolean;
  badge: BadgeDefinition | null;
  onDismiss: () => void;
};

const RARITY_DK: Record<BadgeRarity, string> = {
  common: 'Almindelig',
  rare: 'Sjælden',
  epic: 'Episk',
  legendary: 'Legendarisk',
};

const DURATION_UP = 220;

export function BadgeUnlockModal({visible, badge, onDismiss}: Props) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && badge) {
      scale.setValue(0.8);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: DURATION_UP,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 6,
            tension: 120,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [visible, badge, scale, opacity]);

  if (!badge) {
    return null;
  }

  const rarityStyle =
    badge.rarity === 'legendary'
      ? styles.cardLegendary
      : badge.rarity === 'epic'
        ? styles.cardEpic
        : badge.rarity === 'rare'
          ? styles.cardRare
          : styles.cardCommon;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View style={[styles.cardWrap, {opacity, transform: [{scale}]}]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={[styles.card, rarityStyle]}>
              <View style={styles.emojiGlow}>
                <Text style={styles.emoji} accessibilityRole="text">
                  {badge.emoji}
                </Text>
              </View>
              <Text style={styles.kicker}>Nyt badge låst op</Text>
              <View style={styles.rarityPill}>
                <Text style={styles.rarityText}>{RARITY_DK[badge.rarity]}</Text>
              </View>
              <Text style={styles.name}>{badge.name}</Text>
              <Text style={styles.desc}>{badge.description}</Text>
              <TouchableOpacity
                style={styles.btn}
                onPress={onDismiss}
                activeOpacity={0.85}>
                <Text style={styles.btnText}>Fedt!</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cardWrap: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 14,
  },
  cardCommon: {
    borderColor: colors.border,
    shadowColor: '#000',
  },
  cardRare: {
    borderColor: 'rgba(139, 92, 246, 0.75)',
    shadowColor: 'rgb(139, 92, 246)',
  },
  cardEpic: {
    borderColor: 'rgba(167, 139, 250, 0.95)',
    shadowColor: 'rgb(167, 139, 250)',
    shadowOpacity: 0.55,
    shadowRadius: 28,
  },
  cardLegendary: {
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.95)',
    shadowColor: 'rgb(250, 204, 21)',
    shadowOpacity: 0.65,
    shadowRadius: 32,
  },
  emojiGlow: {
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.55,
    shadowRadius: 20,
  },
  emoji: {
    fontSize: 58,
  },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  rarityPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    marginBottom: spacing.sm,
  },
  rarityText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    minWidth: 160,
    alignItems: 'center',
  },
  btnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
