/**
 * Premium gym picker for onboarding — global search, up to 3 gyms, no region.
 */

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import type {DanishGym} from '@/data/danishGyms';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {gymSearchMatchesTokens} from '@/utils/gymSearch';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {ONBOARDING} from './onboardingTokens';
import {useTranslation} from '@/i18n';

const BICEPS_OPTIONS = ['💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿', '🦾'];
const MAX_GYMS = 3;

/** Default “Popular gyms” on onboarding — fixed order, resolved from registry by id. */
const POPULAR_ONBOARDING_GYM_IDS = [
  'sats-2500-valby-torvegade-17',
  'fitness-x-2000-frederiksberg-nordre-fasanvej-27',
  'puregym-2730-herlev-noerrelundvej-4',
  'arca-2300-koebenhavn-s-portugalsgade-13',
  'sporting-health-club-1123-koebenhavn-k-gothersgade-14',
  'loop-fitness-2100-koebenhavn-oe-teglvaerksgade-37',
] as const;

type Props = {
  allGyms: DanishGym[];
  favoriteGyms: (DanishGym | null)[];
  favoriteGymLabels: string[];
  onSelectGym: (index: number, gym: DanishGym) => void;
  onRemoveGym: (index: number) => void;
  selectedBiceps: string | null;
  onSelectBiceps: (emoji: string) => void;
  bicepsScaleRef: Record<string, Animated.Value>;
};

export function OnboardingGymPicker({
  allGyms,
  favoriteGyms,
  favoriteGymLabels,
  onSelectGym,
  onRemoveGym,
  selectedBiceps,
  onSelectBiceps,
  bicepsScaleRef,
}: Props) {
  const {t} = useTranslation();
  const [query, setQuery] = useState('');

  const selectedCount = favoriteGyms.filter(Boolean).length;

  const popularGyms = useMemo(() => {
    const byId = new Map(allGyms.map(g => [g.id, g]));
    return POPULAR_ONBOARDING_GYM_IDS.map(id => byId.get(id)).filter(
      (g): g is DanishGym => g != null,
    );
  }, [allGyms]);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return [];
    return allGyms
      .filter(g => {
        const haystack = [g.name, g.city ?? '', g.region, g.address ?? '', g.brand ?? ''].join(
          ' ',
        );
        return gymSearchMatchesTokens(haystack, q);
      })
      .slice(0, 12);
  }, [allGyms, query]);

  const listGyms = query.trim().length > 0 ? searchResults : popularGyms;
  const listTitle =
    query.trim().length > 0 ? t('register.gymSuggestions') : t('register.gymPopular');

  const nextEmptyIndex = favoriteGyms.findIndex(g => !g);

  const handlePickGym = (gym: DanishGym) => {
    const alreadyIndex = favoriteGyms.findIndex(g => g?.id === gym.id);
    if (alreadyIndex >= 0) return;
    const slot = nextEmptyIndex >= 0 ? nextEmptyIndex : MAX_GYMS - 1;
    if (selectedCount >= MAX_GYMS && nextEmptyIndex < 0) return;
    onSelectGym(slot, gym);
    setQuery('');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.searchWrap, shadows.sm]}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('register.gymSearchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {selectedCount > 0 ? (
        <View style={styles.selectedBlock}>
          <Text style={styles.sectionLabel}>
            {t('register.gymSelected', {count: String(selectedCount)})}
          </Text>
          {favoriteGyms.map((gym, index) => {
            if (!gym) return null;
            const label = favoriteGymLabels[index] || formatGymDisplayName(gym);
            return (
              <View key={gym.id} style={[styles.selectedCard, shadows.sm]}>
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>{index + 1}</Text>
                </View>
                <View style={styles.selectedBody}>
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {label}
                  </Text>
                  {gym.city ? (
                    <Text style={styles.selectedCity} numberOfLines={1}>
                      {gym.city}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => onRemoveGym(index)}
                  hitSlop={8}
                  style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>{t('register.gymRemove')}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>{listTitle}</Text>
      <ScrollView
        style={styles.listScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {listGyms.map(gym => {
          const picked = favoriteGyms.some(g => g?.id === gym.id);
          return (
            <Pressable
              key={gym.id}
              style={({pressed}) => [
                styles.gymCard,
                picked && styles.gymCardPicked,
                pressed && styles.gymCardPressed,
              ]}
              onPress={() => handlePickGym(gym)}
              disabled={picked || (selectedCount >= MAX_GYMS && nextEmptyIndex < 0)}>
              <View style={[styles.gymIcon, picked && styles.gymIconPicked]}>
                <MaterialIcon
                  name="map-marker-radius"
                  size={20}
                  color={picked ? colors.white : colors.primary}
                />
              </View>
              <View style={styles.gymCardBody}>
                <Text style={styles.gymCardTitle} numberOfLines={1}>
                  {formatGymDisplayName(gym)}
                </Text>
                <Text style={styles.gymCardSub} numberOfLines={1}>
                  {[gym.city, gym.region].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {picked ? (
                <Icon name="checkmark-circle" size={22} color={colors.primary} />
              ) : (
                <Icon name="add-circle-outline" size={22} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.sectionLabel, styles.bicepsLabel]}>{t('register.bicepsTitle')}</Text>
      <View style={styles.bicepsRow}>
        {BICEPS_OPTIONS.map(emoji => (
          <Pressable
            key={emoji}
            style={styles.bicepsPress}
            onPressIn={() =>
              Animated.spring(bicepsScaleRef[emoji], {
                toValue: 0.94,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(bicepsScaleRef[emoji], {
                toValue: 1,
                useNativeDriver: true,
              }).start()
            }
            onPress={() => onSelectBiceps(emoji)}>
            <Animated.View
              style={[
                styles.bicepsChip,
                selectedBiceps === emoji && styles.bicepsChipActive,
                {transform: [{scale: bicepsScaleRef[emoji]}]},
              ]}>
              <Text style={styles.bicepsEmoji}>{emoji}</Text>
            </Animated.View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: ONBOARDING.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ONBOARDING.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md + 2 : spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  sectionLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  selectedBlock: {
    gap: spacing.sm,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: ONBOARDING.lavenderTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ONBOARDING.lavenderTintBorder,
    padding: spacing.md,
  },
  selectedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    ...typography.small,
    fontWeight: '800',
    color: colors.white,
  },
  selectedBody: {
    flex: 1,
    minWidth: 0,
  },
  selectedName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  selectedCity: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  removeBtnText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
  listScroll: {
    maxHeight: 220,
  },
  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  gymCardPicked: {
    borderColor: colors.primary + '50',
    backgroundColor: colors.primary + '08',
  },
  gymCardPressed: {
    opacity: 0.92,
    transform: [{scale: 0.99}],
  },
  gymIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymIconPicked: {
    backgroundColor: colors.primary,
  },
  gymCardBody: {
    flex: 1,
    minWidth: 0,
  },
  gymCardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  gymCardSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  bicepsLabel: {
    marginTop: spacing.sm,
  },
  bicepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  bicepsPress: {
    padding: 2,
  },
  bicepsChip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ONBOARDING.chipBg,
    borderWidth: 1,
    borderColor: ONBOARDING.chipBorder,
  },
  bicepsChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
    ...shadows.glow,
  },
  bicepsEmoji: {
    fontSize: 26,
  },
});
