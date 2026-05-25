import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type {DanishGym} from '@/data/danishGyms';
import type {GymSearchHit} from '@/services/gymSearch/gymSearchEngine';
import {GymSearchResultRow} from './GymSearchResultRow';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

type Props = {
  hits: GymSearchHit[];
  showLoading?: boolean;
  isActive: boolean;
  favoriteIds?: string[];
  onSelectGym: (gym: DanishGym) => void;
  formatDistance?: (gym: DanishGym, distanceM: number | null) => string;
  variant?: 'list' | 'map';
  style?: StyleProp<ViewStyle>;
  maxHeight?: number;
};

export function GymSearchResultsPanel({
  hits,
  showLoading = false,
  isActive,
  favoriteIds = [],
  onSelectGym,
  formatDistance,
  variant = 'list',
  style,
  maxHeight = 320,
}: Props) {
  const {t} = useTranslation();
  const favoriteSet = new Set(favoriteIds);

  if (!isActive) {
    return null;
  }

  if (showLoading && hits.length === 0) {
    return (
      <View style={[styles.wrap, styles.loadingWrap, style]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{t('gymSearch.searching')}</Text>
      </View>
    );
  }

  if (hits.length === 0) {
    return (
      <View style={[styles.wrap, styles.emptyWrap, style]}>
        <Text style={styles.emptyTitle}>{t('gymSearch.noResults')}</Text>
        <Text style={styles.emptySub}>{t('gymSearch.noResultsHint')}</Text>
      </View>
    );
  }

  const sectionTitle = t('gymSearch.bestMatches');

  return (
    <View
      style={[
        styles.wrap,
        variant === 'map' && styles.wrapMap,
        style,
        maxHeight != null ? {maxHeight} : styles.flexGrow,
      ]}>
      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      <FlatList
        data={hits}
        keyExtractor={item => item.gym.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({item}) => (
          <View style={styles.rowGap}>
            <GymSearchResultRow
              gym={item.gym}
              distanceText={
                formatDistance
                  ? formatDistance(item.gym, item.distanceM)
                  : item.distanceM != null
                    ? item.distanceM < 1000
                      ? `${Math.round(item.distanceM)} m`
                      : `${(item.distanceM / 1000).toFixed(1)} km`
                    : undefined
              }
              isFavorite={favoriteSet.has(item.gym.id)}
              showMapHint={variant === 'map'}
              onPress={() => onSelectGym(item.gym)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  flexGrow: {
    flex: 1,
  },
  wrapMap: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.xs,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  sectionTitle: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  rowGap: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  emptyWrap: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
