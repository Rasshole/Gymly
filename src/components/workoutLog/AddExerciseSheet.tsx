/**
 * Bottom sheet: search / pick exercise, or create a user-scoped custom exercise.
 * Muscle filter: multi-select via nested "Muskelgrupper" picker (not horizontal chips).
 * Browse mode uses a virtualized 2-column image-first grid.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {
  EQUIPMENT_ORDER,
  EXERCISE_LIBRARY,
  MUSCLE_GROUP_ORDER,
  groupExercisesByMuscle,
  searchExerciseLibrary,
} from '@/data/exerciseLibrary';
import {createCustomExercise} from '@/services/supabase/customExerciseService';
import {
  fetchExerciseLibrary,
  getRecentExerciseIds,
  peekExerciseLibrary,
} from '@/services/supabase/workoutLogService';
import type {
  ExerciseEquipment,
  ExerciseLibraryItem,
  WorkoutMuscleGroup,
} from '@/types/workoutLog.types';
import {
  equipmentLabelDa,
  muscleGroupLabelDa,
} from '@/utils/workoutLogFormat';
import {
  EXERCISE_PICKER_MUSCLE_FILTERS,
  type ExerciseMuscleFilters,
  filterExerciseLibraryByMuscle,
  toggleMuscleFilter,
} from '@/utils/workoutMuscleFilter';
import {useTranslation} from '@/i18n';
import ExerciseGridCard from '@/components/workoutLog/ExerciseGridCard';
import {
  pairExercisesForGrid,
  type ExerciseGridListRow,
} from '@/components/workoutLog/exerciseGridRows';

const SCREEN_H = Dimensions.get('window').height;

const PICKABLE_MUSCLES: WorkoutMuscleGroup[] = MUSCLE_GROUP_ORDER.filter(
  mg => mg !== 'legs' && mg !== 'arms',
);

export type AddExerciseSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: ExerciseLibraryItem) => void;
  /**
   * Initial muscle filters from active check-in (resets each time picker opens).
   * Empty = Alle. Does not write back to check-in.
   */
  defaultMuscleFilters?: ExerciseMuscleFilters;
};

type SheetMode = 'pick' | 'create' | 'filter';

const AddExerciseSheet: React.FC<AddExerciseSheetProps> = ({
  visible,
  onClose,
  onSelect,
  defaultMuscleFilters = [],
}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const [query, setQuery] = useState('');
  const [muscleFilters, setMuscleFilters] =
    useState<ExerciseMuscleFilters>(defaultMuscleFilters);
  const [draftFilters, setDraftFilters] =
    useState<ExerciseMuscleFilters>(defaultMuscleFilters);
  const [library, setLibrary] = useState<ExerciseLibraryItem[]>(peekExerciseLibrary);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [mode, setMode] = useState<SheetMode>('pick');
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] =
    useState<WorkoutMuscleGroup>('chest');
  const [customEquipment, setCustomEquipment] =
    useState<ExerciseEquipment>('dumbbell');
  const [creating, setCreating] = useState(false);

  const refreshLibrary = async () => {
    const [lib, recent] = await Promise.all([
      fetchExerciseLibrary(),
      getRecentExerciseIds(),
    ]);
    setLibrary(lib);
    setRecentIds(recent);
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    setQuery('');
    setMuscleFilters(defaultMuscleFilters);
    setDraftFilters(defaultMuscleFilters);
    setMode('pick');
    setCustomName('');
    setCustomMuscle('chest');
    setCustomEquipment('dumbbell');
    void refreshLibrary();
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        stiffness: 420,
        damping: 36,
        mass: 0.85,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdrop, sheetY, defaultMuscleFilters]);

  useEffect(() => {
    if (visible) {
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: SCREEN_H,
        stiffness: 520,
        damping: 40,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdrop, sheetY]);

  const searched = useMemo(
    () => searchExerciseLibrary(query, library),
    [query, library],
  );

  const filtered = useMemo(
    () => filterExerciseLibraryByMuscle(searched, muscleFilters),
    [searched, muscleFilters],
  );

  const draftMatchCount = useMemo(
    () => filterExerciseLibraryByMuscle(searched, draftFilters).length,
    [searched, draftFilters],
  );

  const filterSummary =
    muscleFilters.length === 0
      ? t('workoutLog.filterAll')
      : t('workoutLog.muscleFilterSelectedCount', {
          count: muscleFilters.length,
        });

  const rows: ExerciseGridListRow[] = useMemo(() => {
    const out: ExerciseGridListRow[] = [];
    if (!query.trim() && recentIds.length > 0) {
      const byName = recentIds
        .map(id => {
          const local = EXERCISE_LIBRARY.find(e => e.id === id);
          return local
            ? library.find(e => e.name === local.name) ??
                library.find(e => e.id === id) ??
                local
            : library.find(e => e.id === id);
        })
        .filter(Boolean) as ExerciseLibraryItem[];
      const uniq = Array.from(
        new Map(byName.map(e => [e.name, e])).values(),
      );
      const recentForFilter = filterExerciseLibraryByMuscle(
        uniq,
        muscleFilters,
      );
      if (recentForFilter.length) {
        out.push({
          type: 'header',
          key: 'recent',
          title: t('workoutLog.recentExercises'),
        });
        out.push(...pairExercisesForGrid(recentForFilter, 'recent'));
      }
    }
    const muscleGroups = groupExercisesByMuscle(filtered);
    if (muscleFilters.length === 1 && muscleGroups.length === 1) {
      out.push(...pairExercisesForGrid(muscleGroups[0].exercises, 'all'));
    } else {
      for (const group of muscleGroups) {
        out.push({
          type: 'header',
          key: `mg-${group.muscleGroup}`,
          title: muscleGroupLabelDa(group.muscleGroup),
        });
        out.push(
          ...pairExercisesForGrid(group.exercises, `mg-${group.muscleGroup}`),
        );
      }
    }
    out.push({type: 'create', key: 'create-custom'});
    return out;
  }, [filtered, library, muscleFilters, query, recentIds, t]);

  const handleSelectExercise = useCallback(
    (exercise: ExerciseLibraryItem) => {
      onSelect(exercise);
      onClose();
    },
    [onClose, onSelect],
  );

  const openFilterPicker = () => {
    setDraftFilters(muscleFilters);
    setMode('filter');
  };

  const applyDraftFilters = () => {
    setMuscleFilters(draftFilters);
    setMode('pick');
  };

  const removeActiveFilter = (mg: WorkoutMuscleGroup) => {
    setMuscleFilters(prev => prev.filter(m => m !== mg));
  };

  const handleCreate = async () => {
    const name = (customName.trim() || query.trim()).trim();
    if (!name) {
      Alert.alert(
        t('workoutLog.customExerciseNameRequiredTitle'),
        t('workoutLog.customExerciseNameRequiredBody'),
      );
      return;
    }
    setCreating(true);
    try {
      const created = await createCustomExercise({
        name,
        muscleGroup: customMuscle,
        equipment: customEquipment,
      });
      await refreshLibrary();
      onSelect(created);
      onClose();
    } catch {
      Alert.alert(
        t('workoutLog.customExerciseFailedTitle'),
        t('workoutLog.customExerciseFailedBody'),
      );
    } finally {
      setCreating(false);
    }
  };

  const title =
    mode === 'create'
      ? t('workoutLog.createCustomExercise')
      : mode === 'filter'
        ? t('workoutLog.selectMuscleGroups')
        : t('workoutLog.addExercise');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.flex}>
        <Animated.View style={[styles.backdrop, {opacity: backdrop}]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              height: Math.min(
                SCREEN_H * 0.88,
                Math.max(SCREEN_H - insets.top - 28, SCREEN_H * 0.7),
              ),
              paddingBottom: Math.max(insets.bottom, spacing.md),
              transform: [{translateY: sheetY}],
            },
          ]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            {mode !== 'pick' ? (
              <TouchableOpacity
                onPress={() => setMode('pick')}
                hitSlop={12}
                style={styles.backBtn}>
                <Icon name="chevron-back" size={22} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{title}</Text>
              {mode === 'filter' ? (
                <Text style={styles.subtitle}>
                  {t('workoutLog.selectOneOrMore')}
                </Text>
              ) : null}
            </View>
          </View>

          {mode === 'create' ? (
            <ScrollView
              style={styles.flexFill}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.createPad}>
              <Text style={styles.fieldLabel}>
                {t('workoutLog.customExerciseName')}
              </Text>
              <TextInput
                style={styles.nameInput}
                value={customName}
                onChangeText={setCustomName}
                placeholder={t('workoutLog.customExerciseNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                selectionColor={colors.primary}
              />
              <Text style={styles.fieldLabel}>
                {t('workoutLog.customExerciseMuscle')}
              </Text>
              <View style={styles.chipWrap}>
                {PICKABLE_MUSCLES.map(mg => {
                  const active = customMuscle === mg;
                  return (
                    <TouchableOpacity
                      key={mg}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCustomMuscle(mg)}
                      activeOpacity={0.85}>
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}>
                        {muscleGroupLabelDa(mg)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>
                {t('workoutLog.customExerciseEquipment')}
              </Text>
              <View style={styles.chipWrap}>
                {EQUIPMENT_ORDER.map(eq => {
                  const active = customEquipment === eq;
                  return (
                    <TouchableOpacity
                      key={eq}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCustomEquipment(eq)}
                      activeOpacity={0.85}>
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}>
                        {equipmentLabelDa(eq)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[styles.createBtn, creating && styles.createBtnDisabled]}
                onPress={() => void handleCreate()}
                disabled={creating}
                activeOpacity={0.9}>
                <Text style={styles.createBtnText}>
                  {creating
                    ? t('workoutLog.saving')
                    : t('workoutLog.createAndUseExercise')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : mode === 'filter' ? (
            <View style={styles.flexFill}>
              <ScrollView
                style={styles.flexFill}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.filterListPad}
                showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={styles.filterOption}
                  onPress={() => setDraftFilters([])}
                  activeOpacity={0.85}>
                  <Text
                    style={[
                      styles.filterOptionText,
                      draftFilters.length === 0 && styles.filterOptionTextActive,
                    ]}>
                    {t('workoutLog.filterAll')}
                  </Text>
                  {draftFilters.length === 0 ? (
                    <Icon
                      name="checkmark-circle"
                      size={24}
                      color={colors.primary}
                    />
                  ) : (
                    <View style={styles.filterRadioEmpty} />
                  )}
                </TouchableOpacity>
                {EXERCISE_PICKER_MUSCLE_FILTERS.map(mg => {
                  const active = draftFilters.includes(mg);
                  return (
                    <TouchableOpacity
                      key={mg}
                      style={styles.filterOption}
                      onPress={() =>
                        setDraftFilters(prev => toggleMuscleFilter(prev, mg))
                      }
                      activeOpacity={0.85}>
                      <Text
                        style={[
                          styles.filterOptionText,
                          active && styles.filterOptionTextActive,
                        ]}>
                        {muscleGroupLabelDa(mg)}
                      </Text>
                      {active ? (
                        <Icon
                          name="checkmark-circle"
                          size={24}
                          color={colors.primary}
                        />
                      ) : (
                        <View style={styles.filterRadioEmpty} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={applyDraftFilters}
                activeOpacity={0.9}>
                <Text style={styles.createBtnText}>
                  {t('workoutLog.showExercisesCount', {count: draftMatchCount})}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.flexFill}>
              <View style={styles.searchWrap}>
                <Icon name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.search}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('workoutLog.searchExercise')}
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  selectionColor={colors.primary}
                />
                {query.length > 0 ? (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <Icon
                      name="close-circle"
                      size={18}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.muscleSelectorRow}
                onPress={openFilterPicker}
                activeOpacity={0.85}>
                <Text style={styles.muscleSelectorLabel}>
                  {t('workoutLog.muscleGroups')}
                </Text>
                <View style={styles.muscleSelectorRight}>
                  <Text style={styles.muscleSelectorValue}>{filterSummary}</Text>
                  <Icon
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {muscleFilters.length > 0 ? (
                <View style={styles.activeChipWrap}>
                  {muscleFilters.map(mg => (
                    <TouchableOpacity
                      key={mg}
                      style={styles.activeChip}
                      onPress={() => removeActiveFilter(mg)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`${muscleGroupLabelDa(mg)}, remove`}>
                      <Text style={styles.activeChipText}>
                        {muscleGroupLabelDa(mg)}
                      </Text>
                      <Icon name="close" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <FlatList
                style={styles.flexFill}
                data={rows}
                keyExtractor={item => item.key}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.list}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
                renderItem={({item}) => {
                  if (item.type === 'header') {
                    return <Text style={styles.section}>{item.title}</Text>;
                  }
                  if (item.type === 'create') {
                    return (
                      <TouchableOpacity
                        style={styles.createRow}
                        onPress={() => {
                          setCustomName(query.trim());
                          setMode('create');
                        }}
                        activeOpacity={0.85}>
                        <Icon
                          name="add-circle-outline"
                          size={20}
                          color={colors.primary}
                        />
                        <Text style={styles.createRowText}>
                          {t('workoutLog.createCustomExerciseCta')}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <View style={styles.pairRow}>
                      <ExerciseGridCard
                        exercise={item.left}
                        onPress={handleSelectExercise}
                      />
                      {item.right ? (
                        <ExerciseGridCard
                          exercise={item.right}
                          onPress={handleSelectExercise}
                        />
                      ) : (
                        <View style={styles.pairSpacer} />
                      )}
                    </View>
                  );
                }}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    overflow: 'hidden',
    ...shadows.sheet,
  },
  /** Remaining height under handle/title — lets FlatList/ScrollView fill & scroll */
  flexFill: {
    flex: 1,
    minHeight: 0,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: 4,
  },
  backBtn: {marginRight: 2, marginTop: 2},
  titleBlock: {flex: 1},
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  search: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  muscleSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    minHeight: 52,
    marginBottom: spacing.sm,
  },
  muscleSelectorLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  muscleSelectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  muscleSelectorValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '14',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  activeChipText: {
    ...typography.small,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  filterListPad: {
    paddingBottom: spacing.md,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    marginBottom: spacing.sm,
  },
  filterOptionText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  filterOptionTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  filterRadioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  list: {paddingBottom: spacing.xl},
  section: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pairSpacer: {
    flex: 1,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  createRowText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
  },
  createPad: {paddingBottom: spacing.xl},
  fieldLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  nameInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  chipText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.primary,
  },
  createBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: {opacity: 0.6},
  createBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white ?? '#fff',
  },
});

export default AddExerciseSheet;
