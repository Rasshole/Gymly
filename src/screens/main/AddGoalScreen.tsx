/**
 * Add Goal Screen
 * Screen for creating new workout goals
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useGoalStore} from '@/store/goalStore';
import {useAppStore} from '@/store/appStore';
import {GoalType, GoalPeriod} from '@/types/goal.types';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';

type AddGoalNavigationProp = StackNavigationProp<any>;

/** Stable ids for UI; storageName keeps legacy Danish DB values. */
const GOAL_EXERCISES = [
  {id: 'benchPress', storageName: 'Bænkpres'},
  {id: 'deadlift', storageName: 'Dødløft'},
  {id: 'legPress', storageName: 'Benpres'},
  {id: 'squats', storageName: 'Squads'},
  {id: 'inclineDumbbell', storageName: 'Incline Dumbell'},
  {id: 'pullDown', storageName: 'Pull-Down'},
  {id: 'shoulderPressDumbbell', storageName: 'Shoulder Pres Dumbell'},
] as const;

type GoalExerciseId = (typeof GOAL_EXERCISES)[number]['id'];

const AddGoalScreen = () => {
  const navigation = useNavigation<AddGoalNavigationProp>();
  const {addGoal} = useGoalStore();
  const {user} = useAppStore();
  const {t} = useTranslation();
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [exerciseId, setExerciseId] = useState<GoalExerciseId | null>(null);
  const [workoutDuration, setWorkoutDuration] = useState('');

  const goalTypes: Array<{type: GoalType; titleKey: string; descKey: string}> = [
    {
      type: 'set_pr',
      titleKey: 'addGoal.typePrTitle',
      descKey: 'addGoal.typePrDesc',
    },
    {
      type: 'workouts',
      titleKey: 'addGoal.typeWorkoutsTitle',
      descKey: 'addGoal.typeWorkoutsDesc',
    },
  ];

  const handleSave = () => {
    if (!selectedType) {
      Alert.alert(t('addGoal.alertSelectTypeTitle'), t('addGoal.alertSelectTypeBody'));
      return;
    }

    if (selectedType === 'set_pr') {
      if (!exerciseId) {
        Alert.alert(
          t('addGoal.alertSelectExerciseTitle'),
          t('addGoal.alertSelectExerciseBody'),
        );
        return;
      }
      if (!target || isNaN(Number(target)) || Number(target) <= 0) {
        Alert.alert(
          t('addGoal.alertInvalidWeightTitle'),
          t('addGoal.alertInvalidWeightBody'),
        );
        return;
      }
    }

    if (selectedType === 'workouts') {
      if (!target || isNaN(Number(target)) || Number(target) <= 0) {
        Alert.alert(
          t('addGoal.alertInvalidCountTitle'),
          t('addGoal.alertInvalidCountBody'),
        );
        return;
      }
      if (!workoutDuration || isNaN(Number(workoutDuration)) || Number(workoutDuration) <= 0) {
        Alert.alert(
          t('addGoal.alertInvalidDurationTitle'),
          t('addGoal.alertInvalidDurationBody'),
        );
        return;
      }
    }

    // Generate title and description
    let title = '';
    let description = '';
    let exerciseStorageName: string | undefined;

    switch (selectedType) {
      case 'set_pr': {
        const meta = GOAL_EXERCISES.find(e => e.id === exerciseId);
        exerciseStorageName = meta?.storageName;
        const exerciseLabel = exerciseId
          ? t(`addGoal.exercises.${exerciseId}`)
          : exerciseStorageName ?? '';
        title = t('addGoal.titlePr', {exercise: exerciseLabel});
        description = t('addGoal.descPr', {
          exercise: exerciseLabel,
          weight: target,
        });
        break;
      }
      case 'workouts': {
        const periodWord =
          period === 'week'
            ? t('addGoal.periodWordWeek')
            : period === 'month'
              ? t('addGoal.periodWordMonth')
              : t('addGoal.periodWordYear');
        title = t('addGoal.titleWorkouts', {count: target, period: periodWord});
        description = t('addGoal.descWorkouts', {
          count: target,
          period: periodWord,
          minutes: workoutDuration,
        });
        break;
      }
    }

    addGoal({
      userId: user?.id ?? 'current_user',
      type: selectedType,
      title,
      description,
      target: selectedType === 'set_pr' ? Number(target) : Number(target),
      period: selectedType === 'workouts' ? period : undefined,
      exercise: selectedType === 'set_pr' ? exerciseStorageName : undefined,
      workoutDuration: selectedType === 'workouts' ? Number(workoutDuration) : undefined,
    });

    Alert.alert(t('addGoal.alertCreatedTitle'), t('addGoal.alertCreatedBody'), [
      {
        text: t('common.ok'),
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  const periodLabel = (p: GoalPeriod) => {
    if (p === 'week') {
      return t('addGoal.periodWeek');
    }
    if (p === 'month') {
      return t('addGoal.periodMonth');
    }
    return t('addGoal.periodYear');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('addGoal.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Goal Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('addGoal.selectType')}</Text>
          {goalTypes.map((goalType) => (
            <TouchableOpacity
              key={goalType.type}
              style={[
                styles.goalTypeCard,
                selectedType === goalType.type && styles.goalTypeCardActive,
              ]}
              onPress={() => setSelectedType(goalType.type)}
              activeOpacity={0.7}>
              <View style={styles.goalTypeContent}>
                <Text style={styles.goalTypeTitle}>{t(goalType.titleKey)}</Text>
                <Text style={styles.goalTypeDescription}>{t(goalType.descKey)}</Text>
              </View>
              {selectedType === goalType.type && (
                <Icon name="checkmark-circle" size={24} color="#007AFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Goal Configuration */}
        {selectedType && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('addGoal.configure')}</Text>

            {/* Exercise Selection (for set_pr) */}
            {selectedType === 'set_pr' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('addGoal.selectExercise')}</Text>
                <View style={styles.exerciseContainer}>
                  {GOAL_EXERCISES.map((ex) => (
                    <TouchableOpacity
                      key={ex.id}
                      style={[
                        styles.exerciseButton,
                        exerciseId === ex.id && styles.exerciseButtonActive,
                      ]}
                      onPress={() => setExerciseId(ex.id)}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.exerciseButtonText,
                          exerciseId === ex.id && styles.exerciseButtonTextActive,
                        ]}>
                        {t(`addGoal.exercises.${ex.id}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Target Input for PR (weight in kg) */}
            {selectedType === 'set_pr' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('addGoal.weightKg')}</Text>
                <TextInput
                  style={styles.input}
                  value={target}
                  onChangeText={setTarget}
                  placeholder={t('addGoal.weightPlaceholder')}
                  keyboardType="numeric"
                  placeholderTextColor="#8E8E93"
                />
              </View>
            )}

            {/* Workout Goal Configuration */}
            {selectedType === 'workouts' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('addGoal.workoutCount')}</Text>
                  <TextInput
                    style={styles.input}
                    value={target}
                    onChangeText={setTarget}
                    placeholder={t('addGoal.workoutCountPlaceholder')}
                    keyboardType="numeric"
                    placeholderTextColor="#8E8E93"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('addGoal.period')}</Text>
                  <View style={styles.periodContainer}>
                    {(['week', 'month', 'year'] as GoalPeriod[]).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.periodButton,
                          period === p && styles.periodButtonActive,
                        ]}
                        onPress={() => setPeriod(p)}
                        activeOpacity={0.7}>
                        <Text
                          style={[
                            styles.periodButtonText,
                            period === p && styles.periodButtonTextActive,
                          ]}>
                          {periodLabel(p)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('addGoal.durationMinutes')}</Text>
                  <TextInput
                    style={styles.input}
                    value={workoutDuration}
                    onChangeText={setWorkoutDuration}
                    placeholder={t('addGoal.durationPlaceholder')}
                    keyboardType="numeric"
                    placeholderTextColor="#8E8E93"
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Save Button */}
        {selectedType && (
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>{t('addGoal.save')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  goalTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  goalTypeCardActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.primary,
  },
  goalTypeContent: {
    flex: 1,
  },
  goalTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  goalTypeDescription: {
    fontSize: 14,
    color: colors.textMuted,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exerciseButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
    marginBottom: 8,
  },
  exerciseButtonActive: {
    backgroundColor: colors.secondary,
  },
  exerciseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  exerciseButtonTextActive: {
    color: '#fff',
  },
  periodContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.secondary,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default AddGoalScreen;
