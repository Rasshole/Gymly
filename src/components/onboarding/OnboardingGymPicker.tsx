/**
 * Minimal one-tap gym picker for onboarding V3 —
 * Nearby (or Suggestions) list + search; row tap completes selection.
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {DanishGym} from '@/data/danishGyms';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {gymPickerLocationLine} from '@/utils/gymCountryLabel';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import {pickBrowseGyms} from '@/utils/pickBrowseGyms';
import {browseCountryForLanguage} from '@/utils/languageBrowseCountry';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';
import GymLogoView from '@/components/ui/GymLogoView';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {ONBOARDING} from './onboardingTokens';
import {useTranslation} from '@/i18n';

/** Sparse first viewport — nearest / fallback sample. */
const INITIAL_LIST_CAP = 4;

type Props = {
  allGyms: DanishGym[];
  onSelectGym: (gym: DanishGym) => void;
  /** Parent locks while persisting / navigating. */
  disabled?: boolean;
};

function secondaryLocationLine(gym: DanishGym, t: (key: string) => string): string {
  const city = gym.city?.trim();
  if (city) {
    return city;
  }
  const street = gym.address?.split(',')[0]?.trim();
  if (street) {
    return street;
  }
  return gymPickerLocationLine(gym, t);
}

export function OnboardingGymPicker({
  allGyms,
  onSelectGym,
  disabled = false,
}: Props) {
  const {t, language} = useTranslation();
  const [query, setQuery] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const pickLockRef = useRef(false);
  const userCoords = useOptionalUserCoords();

  useEffect(() => {
    if (!disabled) {
      pickLockRef.current = false;
      setFlashId(null);
    }
  }, [disabled]);

  const hasUsableLocation = userCoords != null;

  const nearbyGyms = useMemo(
    () =>
      pickBrowseGyms({
        gyms: allGyms,
        userLocation: userCoords,
        cap: INITIAL_LIST_CAP,
        preferredCountry: browseCountryForLanguage(language),
      }),
    [allGyms, userCoords, language],
  );

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) {
      return [];
    }
    return searchGyms(q, {gyms: allGyms, limit: 12}).map(h => h.gym);
  }, [allGyms, query]);

  const isSearching = query.trim().length > 0;
  const listGyms = isSearching ? searchResults : nearbyGyms;

  // Without a location fix the browse list is a general catalog sample
  // (country/city spread, or a global round-robin). It is not personal.
  const listTitle =
    !isSearching && hasUsableLocation
      ? t('register.gymNearby')
      : t('register.gymList');

  const handleRowPress = (gym: DanishGym) => {
    if (disabled || pickLockRef.current) {
      return;
    }
    pickLockRef.current = true;
    setFlashId(gym.id);
    // Brief selected feedback, then hand off — parent persists before Home.
    setTimeout(() => {
      onSelectGym(gym);
    }, 120);
  };

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('register.gymSearchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          editable={!disabled}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            disabled={disabled}>
            <Icon name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.listTitle}>{listTitle}</Text>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.listContent}>
        {listGyms.map(gym => {
          const selected = flashId === gym.id;
          return (
            <Pressable
              key={gym.id}
              onPress={() => handleRowPress(gym)}
              disabled={disabled}
              style={[styles.row, selected && styles.rowSelected]}
              accessibilityRole="button"
              accessibilityState={{selected, disabled}}>
              <View style={styles.logoSlot}>
                <GymLogoView
                  gymName={gym.name}
                  brand={gym.brand}
                  size={40}
                  variant="plain"
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {formatGymDisplayName(gym)}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {secondaryLocationLine(gym, t)}
                </Text>
              </View>
              {selected ? (
                <Icon name="checkmark" size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 240},
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: ONBOARDING.inputBorder,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    letterSpacing: typography.body.letterSpacing,
    color: colors.text,
    // Stretch past the row's center alignment. A centered TextInput on iOS
    // sizes to the font and clips descenders (g, y, ø).
    paddingVertical: 10,
    marginVertical: 0,
  },
  listTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  list: {flexGrow: 0},
  listContent: {paddingBottom: spacing.xl, gap: spacing.xs},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  rowSelected: {
    backgroundColor: colors.primary + '12',
  },
  logoSlot: {marginRight: spacing.md, width: 40, height: 40},
  rowText: {flex: 1, minWidth: 0},
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
