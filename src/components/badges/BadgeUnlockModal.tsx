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
import type {BadgeDefinition} from '@/types/badge.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type Props = {
  visible: boolean;
  badge: BadgeDefinition | null;
  onDismiss: () => void;
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View style={[styles.cardWrap, {opacity, transform: [{scale}]}]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={styles.card}>
              <View style={styles.emojiGlow}>
                <Text style={styles.emoji} accessibilityRole="text">
                  {badge.emoji}
                </Text>
              </View>
              <Text style={styles.kicker}>Nyt badge</Text>
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
    borderColor: 'rgba(139, 92, 246, 0.45)',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
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
