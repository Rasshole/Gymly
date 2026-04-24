/**
 * Tre slots til lokale centre — #1 påkrævet, #2–3 valgfri.
 * Samme søgelogik som registrering.
 */

import React, {useMemo, useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {getActiveDanishGyms} from '@/data/danishGyms';
import type {DanishGym} from '@/data/danishGyms';

const PICKER_GYMS = getActiveDanishGyms();
import colors from '@/theme/colors';
import {spacing, typography, shadows} from '@/theme/designTokens';

function slotsFromIds(ids: (string | undefined)[]): (DanishGym | null)[] {
  return [0, 1, 2].map(i => {
    const id = ids[i];
    if (!id) return null;
    return PICKER_GYMS.find(g => g.id === id) ?? null;
  });
}

function labelsFromSlots(slots: (DanishGym | null)[]): string[] {
  return slots.map(g =>
    g ? [g.name, g.city].filter(Boolean).join(', ') : '',
  );
}

function buildIds(
  slots: (DanishGym | null)[],
  labels: string[],
): string[] {
  const ids: string[] = [];
  labels.forEach((label, index) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const selected = slots[index];
    const gymId =
      selected?.id ??
      PICKER_GYMS.find(
        g =>
          g.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          (g.city && g.city.toLowerCase().includes(trimmed.toLowerCase())),
      )?.id;
    if (gymId != null && gymId !== '' && !ids.includes(gymId)) {
      ids.push(gymId);
    }
  });
  return ids;
}

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/]/g, ' ')
    .toLowerCase();

export type GymSlotsEditorProps = {
  /** Op til 3 center-ids i rækkefølge */
  initialIds: string[];
  onIdsChange: (ids: string[]) => void;
};

export const GymSlotsEditor: React.FC<GymSlotsEditorProps> = ({
  initialIds,
  onIdsChange,
}) => {
  const [favoriteGyms, setFavoriteGyms] = useState<(DanishGym | null)[]>(() =>
    slotsFromIds(initialIds),
  );
  const [favoriteGymLabels, setFavoriteGymLabels] = useState<string[]>(() =>
    labelsFromSlots(slotsFromIds(initialIds)),
  );
  const [activeGymIndex, setActiveGymIndex] = useState<number | null>(null);
  const [showGymSuggestions, setShowGymSuggestions] = useState(false);

  useEffect(() => {
    onIdsChange(buildIds(favoriteGyms, favoriteGymLabels));
  }, [favoriteGyms, favoriteGymLabels, onIdsChange]);

  const gymSuggestions = useMemo(() => {
    const activeLabel =
      activeGymIndex !== null ? favoriteGymLabels[activeGymIndex] : '';
    const trimmed = activeLabel.trim();
    if (!showGymSuggestions || activeGymIndex === null || trimmed.length === 0) {
      return [];
    }
    const normalizedQuery = normalizeSearchValue(trimmed);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const filtered = PICKER_GYMS.filter(option => {
      if (tokens.length === 0) return true;
      const haystack = normalizeSearchValue(
        `${option.name} ${option.city ?? ''} ${option.region} ${option.address ?? ''}`,
      );
      return tokens.every(token => haystack.includes(token));
    });
    return filtered.slice(0, 10);
  }, [favoriteGymLabels, showGymSuggestions, activeGymIndex]);

  const handleSelectGymSuggestion = (gym: DanishGym) => {
    if (activeGymIndex === null) return;
    const displayLabel = [gym.name, gym.city].filter(Boolean).join(', ');
    const idx = activeGymIndex;
    setFavoriteGyms(prev => {
      const next = [...prev];
      next[idx] = gym;
      return next;
    });
    setFavoriteGymLabels(prev => {
      const next = [...prev];
      next[idx] = displayLabel;
      return next;
    });
    setActiveGymIndex(null);
    setShowGymSuggestions(false);
  };

  const updateLabel = (index: number, value: string) => {
    setFavoriteGymLabels(prev => {
      const n = [...prev];
      n[index] = value;
      return n;
    });
    setFavoriteGyms(prev => {
      const n = [...prev];
      n[index] = null;
      return n;
    });
    setActiveGymIndex(index);
    setShowGymSuggestions(value.trim().length > 0);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.helperMuted}>
        Center 1 er dit primære lokale center. Du kan tilføje op til to ekstra.
      </Text>
      {favoriteGymLabels.map((label, index) => {
        const isActive = activeGymIndex === index;
        return (
          <View key={`gym_${index}`} style={styles.gymFieldWrap}>
            <View style={styles.gymRow}>
              <Text style={styles.gymIndex}>{index + 1}</Text>
              <TextInput
                style={[styles.input, styles.gymInput]}
                placeholder={index === 0 ? 'Primært center *' : 'Valgfrit center'}
                placeholderTextColor={colors.textMuted}
                value={label}
                onFocus={() => {
                  setActiveGymIndex(index);
                  setShowGymSuggestions(true);
                }}
                onChangeText={v => updateLabel(index, v)}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {isActive && showGymSuggestions && gymSuggestions.length > 0 && (
              <View style={[styles.suggestions, shadows.md]}>
                {gymSuggestions.map(option => (
                  <TouchableOpacity
                    key={`${index}_${option.id}`}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectGymSuggestion(option)}
                    activeOpacity={0.7}>
                    <Icon name="location" size={18} color={colors.primary} />
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionTitle}>{option.name}</Text>
                      <Text style={styles.suggestionSub}>{option.city}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  helperMuted: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  gymFieldWrap: {marginBottom: spacing.sm},
  gymRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  gymIndex: {
    width: 22,
    ...typography.small,
    fontWeight: '700',
    color: colors.primary,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  gymInput: {minHeight: 44},
  suggestions: {
    marginTop: 6,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: {flex: 1},
  suggestionTitle: {...typography.body, color: colors.text},
  suggestionSub: {...typography.caption, color: colors.textSecondary, marginTop: 2},
});
