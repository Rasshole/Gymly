/**
 * Live workout log — kun tilgængelig under aktiv check-in.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenHeader from '@/components/ui/ScreenHeader';
import AddExerciseSheet from '@/components/workoutLog/AddExerciseSheet';
import SetEditorSheet from '@/components/workoutLog/SetEditorSheet';
import ExerciseHistorySheet from '@/components/workoutLog/ExerciseHistorySheet';
import {useSessionStore} from '@/store/sessionStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutLogStore} from '@/store/workoutLogStore';
import {usePersonalRecordSessionStore} from '@/store/personalRecordSessionStore';
import {useLastExercisePerformanceCache} from '@/hooks/useLastExercisePerformanceCache';
import type {
  ExerciseLibraryItem,
  LastExercisePerformance,
  WorkoutExercise,
  WorkoutSet,
} from '@/types/workoutLog.types';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {triggerHaptic} from '@/utils/haptics';
import {
  formatReps,
  formatSessionElapsedMinutes,
  formatVolumeKg,
  formatWeightKg,
} from '@/utils/workoutLogFormat';
import {
  computeSetProgression,
  formatLastSetLine,
  formatProgressionBadge,
  prefillFromLastPerformance,
} from '@/utils/workoutLogHistory';
import {formatPrToastMessage} from '@/utils/personalRecordCopy';
import {defaultExerciseMuscleFiltersFromSession} from '@/utils/workoutMuscleFilter';
import {PrToast} from '@/components/personalRecords/PrToast';
import {useTranslation, useAppFormat, getRuntimeLanguage, getExerciseDisplayName} from '@/i18n';

type EditorState =
  | {kind: 'new-exercise'; exercise: ExerciseLibraryItem}
  | {
      kind: 'new-set';
      exerciseId: string;
      exerciseName: string;
      weight: number | null;
      reps: number | null;
    }
  | {kind: 'edit-set'; set: WorkoutSet; exerciseName: string}
  | null;

type HistoryTarget = {
  exerciseName: string;
  exerciseId: string | null;
};

function ExerciseCard(props: {
  exercise: WorkoutExercise;
  last: LastExercisePerformance | null | undefined;
  lastLoading: boolean;
  isSetPr: (setId: string) => boolean;
  onPressHistory: () => void;
  onPressSet: (set: WorkoutSet) => void;
  onPressNewSet: () => void;
  formatLastDate: (iso: string) => string;
}) {
  const {t, language} = useTranslation();
  const {
    exercise: ex,
    last,
    lastLoading,
    isSetPr,
    onPressHistory,
    onPressSet,
    onPressNewSet,
    formatLastDate,
  } = props;

  const hasLast = Boolean(last && last.sets.length > 0);
  const showFirstTime = last === null && !lastLoading;
  const displayName = getExerciseDisplayName({
    exerciseId: ex.exerciseId ?? null,
    fallbackName: ex.exerciseName,
    language,
  });

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <TouchableOpacity
          style={styles.exerciseTitleHit}
          onPress={onPressHistory}
          activeOpacity={0.75}>
          <Text style={styles.exerciseName} numberOfLines={2}>
            {displayName}
          </Text>
          <View style={styles.historyHint}>
            <Icon name="time-outline" size={14} color={colors.primary} />
            <Text style={styles.historyHintText}>{t('workoutLog.history')}</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.exerciseMeta}>
          {t('workoutLog.setsLogged', {count: ex.sets.length})}
        </Text>
      </View>

      {hasLast && last ? (
        <View style={styles.lastBlock}>
          <Text style={styles.lastLabel}>
            {t('workoutLog.lastTime', {date: formatLastDate(last.performedAt)})}
          </Text>
          {last.sets.map(set => (
            <View key={`last-${set.setNumber}`} style={styles.lastSetRow}>
              <Text style={styles.lastSetNum}>
                {t('workoutLog.setN', {n: set.setNumber})}
              </Text>
              <Text style={styles.lastSetVal}>
                {formatLastSetLine(set, last.trackingType)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {showFirstTime ? (
        <Text style={styles.firstTimeLabel}>{t('workoutLog.firstTime')}</Text>
      ) : null}

      <Text style={styles.todayLabel}>{t('workoutLog.todaySets')}</Text>

      {ex.sets.map(set => {
        const progression =
          hasLast && last ? computeSetProgression(set, last.sets) : null;
        const setIsPr = isSetPr(set.id);
        return (
          <TouchableOpacity
            key={set.id}
            style={[
              styles.setRow,
              set.pending && styles.setRowPending,
              setIsPr && styles.setRowPr,
            ]}
            onPress={() => onPressSet(set)}
            activeOpacity={0.8}>
            <Text style={styles.setNum}>
              {t('workoutLog.setN', {n: set.setNumber})}
            </Text>
            <Text style={styles.setVal}>{formatWeightKg(set.weightKg)}</Text>
            <Text style={styles.setVal}>{formatReps(set.reps)}</Text>
            {setIsPr ? (
              <Text style={styles.prBadge}>🏆 PR</Text>
            ) : progression ? (
              <Text style={styles.progressBadge}>
                {formatProgressionBadge(progression)}
              </Text>
            ) : (
              <View style={styles.progressSpacer} />
            )}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.newSetBtn}
        onPress={onPressNewSet}
        activeOpacity={0.85}>
        <Icon name="add" size={18} color={colors.primary} />
        <Text style={styles.newSetText}>{t('workoutLog.newSet')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const LiveWorkoutScreen: React.FC = () => {
  const {t, language} = useTranslation();
  const {intlLocale} = useAppFormat();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useAppStore(s => s.user);
  const activeSession = useSessionStore(s => s.activeSession);
  const getElapsedSeconds = useSessionStore(s => s.getElapsedSeconds);
  const [elapsed, setElapsed] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const sessionId = activeSession?.checkInId ?? null;
  const exercises = useWorkoutLogStore(s => s.exercises);
  const loading = useWorkoutLogStore(s => s.loading);
  const load = useWorkoutLogStore(s => s.load);
  const addExerciseWithFirstSet = useWorkoutLogStore(s => s.addExerciseWithFirstSet);
  const addSetOptimistic = useWorkoutLogStore(s => s.addSetOptimistic);
  const editSetOptimistic = useWorkoutLogStore(s => s.editSetOptimistic);
  const deleteSetOptimistic = useWorkoutLogStore(s => s.deleteSetOptimistic);

  const ensurePrBaseline = usePersonalRecordSessionStore(s => s.ensureBaseline);
  const evaluatePrSet = usePersonalRecordSessionStore(s => s.evaluateCompletedSet);
  const recomputeExercisePrs = usePersonalRecordSessionStore(s => s.recomputeExercise);
  const isSetPr = usePersonalRecordSessionStore(s => s.isSetPr);
  const toastRecord = usePersonalRecordSessionStore(s => s.toastRecord);
  const clearPrToast = usePersonalRecordSessionStore(s => s.clearToast);
  const resetPrSession = usePersonalRecordSessionStore(s => s.reset);

  const visibleExercises = useMemo(
    () => exercises.filter(e => e.sets.length > 0),
    [exercises],
  );

  const cacheItems = useMemo(
    () =>
      visibleExercises.map(e => ({
        exerciseName: e.exerciseName,
        exerciseId: e.exerciseId,
      })),
    [visibleExercises],
  );

  const lastCache = useLastExercisePerformanceCache({
    userId: user?.id,
    excludeSessionId: sessionId,
    items: cacheItems,
  });

  useEffect(() => {
    if (!activeSession) {
      navigation.goBack();
    }
  }, [activeSession, navigation]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void load(sessionId);
  }, [sessionId, load]);

  useEffect(() => {
    if (!sessionId || !user?.id) {
      return;
    }
    for (const ex of visibleExercises) {
      void ensurePrBaseline({
        userId: user.id,
        sessionId,
        exerciseName: ex.exerciseName,
        exerciseId: ex.exerciseId,
      });
    }
  }, [sessionId, user?.id, visibleExercises, ensurePrBaseline]);

  useEffect(() => {
    if (!activeSession) {
      resetPrSession();
    }
  }, [activeSession, resetPrSession]);

  const prToastParts = useMemo(() => {
    if (!toastRecord) {
      return {title: null as string | null, subtitle: null, detail: null};
    }
    const lang = getRuntimeLanguage();
    const lines = formatPrToastMessage(toastRecord, lang).split('\n');
    return {
      title: lines[0] ?? null,
      subtitle: lines[1] ?? null,
      detail: lines[2] ?? null,
    };
  }, [toastRecord]);

  useEffect(() => {
    const id = setInterval(() => setElapsed(getElapsedSeconds()), 1000);
    return () => clearInterval(id);
  }, [getElapsedSeconds]);

  const stats = useMemo(() => {
    const withSets = visibleExercises;
    return {
      exerciseCount: withSets.length,
      setCount: withSets.reduce((n, e) => n + e.sets.length, 0),
      volumeKg: (() => {
        let total = 0;
        for (const ex of withSets) {
          for (const s of ex.sets) {
            total += (s.weightKg ?? 0) * (s.reps ?? 0);
          }
        }
        return Math.round(total * 10) / 10;
      })(),
    };
  }, [visibleExercises]);

  const subtitle = useMemo(() => {
    const gym = activeSession?.gymName ?? '';
    return `${gym} · ${formatSessionElapsedMinutes(elapsed)}`;
  }, [activeSession?.gymName, elapsed]);

  const defaultMuscleFilters = useMemo(
    () => defaultExerciseMuscleFiltersFromSession(activeSession?.workoutType),
    [activeSession?.workoutType],
  );

  const formatLastDate = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString(intlLocale, {
        month: 'short',
        day: 'numeric',
      });
    },
    [intlLocale],
  );

  const animateNewSet = useCallback(() => {
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flashOpacity]);

  const makeClientKey = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const onSelectExercise = async (exercise: ExerciseLibraryItem) => {
    await lastCache.ensure(exercise.name, exercise.id);
    if (sessionId && user?.id) {
      void ensurePrBaseline({
        userId: user.id,
        sessionId,
        exerciseName: exercise.name,
        exerciseId: exercise.id,
      });
    }
    setEditor({kind: 'new-exercise', exercise});
  };

  const onPressNewSet = (exerciseId: string, exerciseName: string) => {
    const ex = exercises.find(e => e.id === exerciseId);
    const nextNum = (ex?.sets[ex.sets.length - 1]?.setNumber ?? 0) + 1;
    const lastToday = ex?.sets[ex.sets.length - 1];
    const lastPerf = lastCache.get(exerciseName, ex?.exerciseId);
    const fromHistory = prefillFromLastPerformance(lastPerf, nextNum);

    setEditor({
      kind: 'new-set',
      exerciseId,
      exerciseName,
      weight: fromHistory.weightKg ?? lastToday?.weightKg ?? null,
      reps: fromHistory.reps ?? lastToday?.reps ?? 8,
    });
  };

  const onPressSet = (
    set: WorkoutSet,
    exerciseName: string,
    exerciseId?: string | null,
  ) => {
    const displayName = getExerciseDisplayName({
      exerciseId: exerciseId ?? null,
      fallbackName: exerciseName,
      language,
    });
    Alert.alert(displayName, t('workoutLog.setActions'), [
      {
        text: t('workoutLog.editSet'),
        onPress: () => setEditor({kind: 'edit-set', set, exerciseName}),
      },
      {
        text: t('workoutLog.deleteSet'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            t('workoutLog.deleteSetConfirmTitle'),
            t('workoutLog.deleteSetConfirmBody'),
            [
              {text: t('common.cancel'), style: 'cancel'},
              {
                text: t('workoutLog.deleteSet'),
                style: 'destructive',
                onPress: () => {
                  void deleteSetOptimistic(set.id).catch(() => {
                    Alert.alert(
                      t('workoutLog.saveFailedTitle'),
                      t('workoutLog.deleteFailedBody'),
                    );
                  });
                },
              },
            ],
          );
        },
      },
      {text: t('common.cancel'), style: 'cancel'},
    ]);
  };

  const handleSave = async (weightKg: number, reps: number) => {
    if (!sessionId || !user?.id || !editor) {
      throw new Error('Ingen aktiv session');
    }
    const clientKey = makeClientKey();
    let savedSet: WorkoutSet | null = null;
    let exerciseMeta: {
      workoutExerciseId: string;
      exerciseName: string;
      exerciseId: string | null;
    } | null = null;

    if (editor.kind === 'new-exercise') {
      savedSet = await addExerciseWithFirstSet({
        sessionId,
        userId: user.id,
        exercise: editor.exercise,
        weightKg,
        reps,
        clientKey,
      });
      const ex = useWorkoutLogStore
        .getState()
        .exercises.find(e => e.sets.some(s => s.id === savedSet?.id));
      exerciseMeta = {
        workoutExerciseId: ex?.id ?? savedSet.workoutExerciseId,
        exerciseName: editor.exercise.name,
        exerciseId: editor.exercise.id,
      };
      await evaluatePrSet({
        userId: user.id,
        sessionId,
        setId: savedSet.id,
        workoutExerciseId: exerciseMeta.workoutExerciseId,
        exerciseName: exerciseMeta.exerciseName,
        exerciseId: exerciseMeta.exerciseId,
        weightKg,
        reps,
      });
    } else if (editor.kind === 'new-set') {
      savedSet = await addSetOptimistic({
        workoutExerciseId: editor.exerciseId,
        sessionId,
        userId: user.id,
        weightKg,
        reps,
        clientKey,
      });
      const ex = useWorkoutLogStore
        .getState()
        .exercises.find(e => e.id === editor.exerciseId);
      await evaluatePrSet({
        userId: user.id,
        sessionId,
        setId: savedSet.id,
        workoutExerciseId: editor.exerciseId,
        exerciseName: editor.exerciseName,
        exerciseId: ex?.exerciseId ?? null,
        weightKg,
        reps,
      });
    } else if (editor.kind === 'edit-set') {
      await editSetOptimistic({
        setId: editor.set.id,
        weightKg,
        reps,
      });
      const ex = useWorkoutLogStore
        .getState()
        .exercises.find(e => e.sets.some(s => s.id === editor.set.id));
      if (ex) {
        await recomputeExercisePrs({
          userId: user.id,
          sessionId,
          workoutExerciseId: ex.id,
          exerciseName: ex.exerciseName,
          exerciseId: ex.exerciseId,
          sets: ex.sets.map(s => ({
            id: s.id,
            weightKg: s.id === editor.set.id ? weightKg : s.weightKg,
            reps: s.id === editor.set.id ? reps : s.reps,
            setNumber: s.setNumber,
          })),
        });
      }
    }
    triggerHaptic('success');
    animateNewSet();
  };

  const editorInitial = useMemo(() => {
    if (!editor) {
      return {weight: null as number | null, reps: null as number | null, name: ''};
    }
    if (editor.kind === 'new-exercise') {
      const last = lastCache.get(editor.exercise.name, editor.exercise.id);
      const prefill = prefillFromLastPerformance(last, 1);
      return {
        weight: prefill.weightKg,
        reps: prefill.reps ?? 8,
        name: editor.exercise.name,
      };
    }
    if (editor.kind === 'new-set') {
      return {
        weight: editor.weight,
        reps: editor.reps ?? 8,
        name: editor.exerciseName,
      };
    }
    return {
      weight: editor.set.weightKg,
      reps: editor.set.reps,
      name: editor.exerciseName,
    };
  }, [editor, lastCache]);

  if (!activeSession || !sessionId) {
    return null;
  }

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScreenHeader
        title={t('workoutLog.title')}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        style={{paddingTop: spacing.sm}}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load(sessionId)}
            tintColor={colors.primary}
          />
        }>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.exerciseCount}</Text>
            <Text style={styles.statLabel}>{t('workoutLog.exercises')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.setCount}</Text>
            <Text style={styles.statLabel}>{t('workoutLog.sets')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text
              style={styles.statValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}>
              {formatVolumeKg(stats.volumeKg)}
            </Text>
            <Text style={styles.statLabel}>{t('workoutLog.volume')}</Text>
          </View>
        </View>

        <Animated.View style={{opacity: flashOpacity}}>
          <View style={styles.liveFlash} />
        </Animated.View>

        {loading && exercises.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: spacing.xl}} />
        ) : null}

        {visibleExercises.map(ex => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            last={lastCache.get(ex.exerciseName, ex.exerciseId)}
            lastLoading={lastCache.isLoading(ex.exerciseName, ex.exerciseId)}
            isSetPr={isSetPr}
            formatLastDate={formatLastDate}
            onPressHistory={() =>
              setHistoryTarget({
                exerciseName: ex.exerciseName,
                exerciseId: ex.exerciseId,
              })
            }
            onPressSet={set => onPressSet(set, ex.exerciseName, ex.exerciseId)}
            onPressNewSet={() => onPressNewSet(ex.id, ex.exerciseName)}
          />
        ))}

        <TouchableOpacity
          style={styles.addExerciseBtn}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.88}>
          <Icon name="add-circle" size={22} color={colors.white} />
          <Text style={styles.addExerciseText}>{t('workoutLog.addExercise')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddExerciseSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        defaultMuscleFilters={defaultMuscleFilters}
        onSelect={ex => {
          void onSelectExercise(ex);
        }}
      />

      <SetEditorSheet
        visible={!!editor}
        mode={editor?.kind === 'edit-set' ? 'edit' : 'create'}
        exerciseName={editorInitial.name}
        initialWeight={editorInitial.weight}
        initialReps={editorInitial.reps}
        onClose={() => setEditor(null)}
        onSave={handleSave}
      />

      {user?.id && historyTarget ? (
        <ExerciseHistorySheet
          visible={!!historyTarget}
          userId={user.id}
          exerciseName={historyTarget.exerciseName}
          exerciseId={historyTarget.exerciseId}
          excludeSessionId={sessionId}
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}

      <PrToast
        title={prToastParts.title}
        subtitle={prToastParts.subtitle}
        detail={prToastParts.detail}
        onHidden={clearPrToast}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  statValue: {
    ...typography.h4,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },
  liveFlash: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary + '66',
    marginBottom: spacing.sm,
  },
  exerciseCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  exerciseHeader: {
    marginBottom: spacing.sm,
  },
  exerciseTitleHit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  exerciseName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 18,
    flex: 1,
  },
  historyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '12',
  },
  historyHintText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  exerciseMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  lastBlock: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  lastLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 6,
  },
  lastSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  lastSetNum: {
    width: 56,
    ...typography.small,
    fontWeight: '600',
    color: colors.textMuted,
  },
  lastSetVal: {
    flex: 1,
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  firstTimeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  todayLabel: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginBottom: 6,
  },
  setRowPending: {opacity: 0.55},
  setRowPr: {
    borderWidth: 1,
    borderColor: colors.primary + '44',
    backgroundColor: colors.primary + '0A',
  },
  setNum: {
    width: 56,
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  setVal: {
    flex: 1,
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  prBadge: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'right',
  },
  progressBadge: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '800',
    marginLeft: 4,
  },
  progressSpacer: {
    width: 8,
  },
  newSetBtn: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  newSetText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  addExerciseBtn: {
    marginTop: spacing.sm,
    minHeight: 56,
    borderRadius: 24,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.md,
  },
  addExerciseText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});

export default LiveWorkoutScreen;
