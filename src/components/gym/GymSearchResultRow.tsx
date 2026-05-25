import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {DanishGym} from '@/data/danishGyms';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

type Props = {
  gym: DanishGym;
  distanceText?: string;
  onPress: () => void;
  showMapHint?: boolean;
  isFavorite?: boolean;
};

export function GymSearchResultRow({
  gym,
  distanceText,
  onPress,
  showMapHint = false,
  isFavorite = false,
}: Props) {
  const {t} = useTranslation();
  const brand = gym.brand ? normalizeGymBrand(gym.brand) : null;

  return (
    <Pressable
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button">
      <GymLogoView gymName={gym.name} brand={gym.brand} size={44} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {formatGymDisplayName(gym)}
          </Text>
          {isFavorite ? (
            <Icon name="star" size={14} color={colors.primary} style={styles.star} />
          ) : null}
        </View>
        {brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {brand}
          </Text>
        ) : null}
        <Text style={styles.meta} numberOfLines={1}>
          {[gym.city, gym.address?.split(',')[0], distanceText].filter(Boolean).join(' · ')}
        </Text>
        {showMapHint ? (
          <Text style={styles.mapHint}>{t('gymSearch.tapToViewOnMap')}</Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowPressed: {
    opacity: 0.92,
    transform: [{scale: 0.995}],
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    flexShrink: 1,
  },
  star: {
    marginLeft: 4,
  },
  brand: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 3,
  },
  mapHint: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
});
