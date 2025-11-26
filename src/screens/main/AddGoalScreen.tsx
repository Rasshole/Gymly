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
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useGoalStore} from '@/store/goalStore';
import {GoalType, GoalPeriod} from '@/types/goal.types';

type AddGoalNavigationProp = StackNavigationProp<any>;

const AddGoalScreen = () => {
  const navigation = useNavigation<AddGoalNavigationProp>();
  const {addGoal} = useGoalStore();
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [exercise, setExercise] = useState('');
  const [workoutDuration, setWorkoutDuration] = useState('');

  const goalTypes: Array<{type: GoalType; title: string; description: string}> = [
    {
      type: 'set_pr',
      title: 'Sæt PR',
      description: 'Sæt et personligt rekord for en specifik øvelse',
    },
    {
      type: 'workouts',
      title: 'Træninger',
      description: 'Fuldfør et antal træninger i en periode',
    },
  ];

  const exercises = [
    'Bænkpres',
    'Dødløft',
    'Benpres',
    'Squads',
    'Incline Dumbell',
    'Pull-Down',
    'Shoulder Pres Dumbell',
  ];

  const handleSave = () => {
    if (!selectedType) {
      Alert.alert('Vælg måltype', 'Vælg venligst en type mål');
      return;
    }

    if (selectedType === 'set_pr') {
      if (!exercise) {
        Alert.alert('Vælg øvelse', 'Vælg venligst en øvelse');
        return;
      }
      if (!target || isNaN(Number(target)) || Number(target) <= 0) {
        Alert.alert('Ugyldig værdi', 'Indtast venligst et gyldigt vægt (kg)');
        return;
      }
    }

    if (selectedType === 'workouts') {
      if (!target || isNaN(Number(target)) || Number(target) <= 0) {
        Alert.alert('Ugyldig værdi', 'Indtast venligst antal træninger');
        return;
      }
      if (!workoutDuration || isNaN(Number(workoutDuration)) || Number(workoutDuration) <= 0) {
        Alert.alert('Ugyldig varighed', 'Indtast venligst træningens varighed i minutter');
        return;
      }
    }

    // Generate title and description
    let title = '';
    let description = '';

    switch (selectedType) {
      case 'set_pr':
        title = `Sæt PR: ${exercise}`;
        description = `Sæt personlig rekord på ${exercise} med ${target} kg`;
        break;
      case 'workouts':
        const periodText = period === 'week' ? 'uge' : period === 'month' ? 'måned' : 'år';
        title = `${target} træninger på ${periodText}`;
        description = `Fuldfør ${target} træninger på ${periodText} (min. ${workoutDuration} min per træning)`;
        break;
    }

    addGoal({
      userId: 'current_user', // TODO: Get from auth store
      type: selectedType,
      title,
      description,
      target: selectedType === 'set_pr' ? Number(target) : Number(target),
      period: selectedType === 'workouts' ? period : undefined,
      exercise: selectedType === 'set_pr' ? exercise : undefined,
      workoutDuration: selectedType === 'workouts' ? Number(workoutDuration) : undefined,
    });

    Alert.alert('Mål oprettet', 'Dit nye mål er blevet oprettet', [
      {
        text: 'OK',
        onPress: () => navigation.goBack(),
      },
    ]);
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
        <Text style={styles.headerTitle}>Tilføj Mål</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Goal Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vælg måltype</Text>
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
                <Text style={styles.goalTypeTitle}>{goalType.title}</Text>
                <Text style={styles.goalTypeDescription}>{goalType.description}</Text>
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
            <Text style={styles.sectionTitle}>Konfigurer mål</Text>

            {/* Exercise Selection (for set_pr) */}
            {selectedType === 'set_pr' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vælg øvelse</Text>
                <View style={styles.exerciseContainer}>
                  {exercises.map((ex) => (
                    <TouchableOpacity
                      key={ex}
                      style={[
                        styles.exerciseButton,
                        exercise === ex && styles.exerciseButtonActive,
                      ]}
                      onPress={() => setExercise(ex)}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.exerciseButtonText,
                          exercise === ex && styles.exerciseButtonTextActive,
                        ]}>
                        {ex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Target Input for PR (weight in kg) */}
            {selectedType === 'set_pr' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vægt (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={target}
                  onChangeText={setTarget}
                  placeholder="F.eks. 100"
                  keyboardType="numeric"
                  placeholderTextColor="#8E8E93"
                />
              </View>
            )}

            {/* Workout Goal Configuration */}
            {selectedType === 'workouts' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Antal træninger</Text>
                  <TextInput
                    style={styles.input}
                    value={target}
                    onChangeText={setTarget}
                    placeholder="F.eks. 8"
                    keyboardType="numeric"
                    placeholderTextColor="#8E8E93"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Periode</Text>
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
                          {p === 'week' ? 'Uge' : p === 'month' ? 'Måned' : 'År'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Træningens varighed (minutter)</Text>
                  <TextInput
                    style={styles.input}
                    value={workoutDuration}
                    onChangeText={setWorkoutDuration}
                    placeholder="F.eks. 60"
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
            <Text style={styles.saveButtonText}>Gem Mål</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
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
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  goalTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  goalTypeCardActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  goalTypeContent: {
    flex: 1,
  },
  goalTypeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  goalTypeDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E5EA',
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
    backgroundColor: '#007AFF',
  },
  exerciseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#007AFF',
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

