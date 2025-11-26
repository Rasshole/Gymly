/**
 * Add Rep Screen
 * Screen for adding or editing a rep record (weight for 10 reps)
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
import {usePRStore} from '@/store/prStore';
import {ExerciseType, RepRecord} from '@/types/pr.types';

type AddRepRouteParams = {
  exercise: ExerciseType;
  existingRep?: RepRecord;
};

type AddRepNavigationProp = StackNavigationProp<any>;

const AddRepScreen = () => {
  const navigation = useNavigation<AddRepNavigationProp>();
  const route = useRoute<RouteProp<{params: AddRepRouteParams}, 'params'>>();
  const {exercise, existingRep} = route.params || {};
  const {addRepRecord, updateRepRecord} = usePRStore();

  const [weight, setWeight] = useState(existingRep?.weight.toString() || '');
  const [notes, setNotes] = useState(existingRep?.notes || '');

  const handleSave = () => {
    if (!weight || isNaN(Number(weight)) || Number(weight) <= 0) {
      Alert.alert('Ugyldig vægt', 'Indtast venligst en gyldig vægt i kg');
      return;
    }

    if (existingRep) {
      updateRepRecord(existingRep.id, {
        weight: Number(weight),
        notes: notes.trim() || undefined,
      });
      Alert.alert('Reps opdateret', 'Dine reps er blevet opdateret', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      addRepRecord({
        userId: 'current_user', // TODO: Get from auth store
        exercise: exercise!,
        weight: Number(weight),
        notes: notes.trim() || undefined,
      });
      Alert.alert('Reps tilføjet', 'Dine reps er blevet tilføjet', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    }
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
        <Text style={styles.headerTitle}>
          {existingRep ? 'Rediger Reps' : 'Tilføj Reps'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Exercise Name */}
        <View style={styles.section}>
          <Text style={styles.exerciseName}>{exercise}</Text>
          <Text style={styles.exerciseSubtitle}>Vægt for 10 reps</Text>
        </View>

        {/* Weight Input */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Vægt (kg)</Text>
          <Text style={styles.inputHint}>
            Hvor mange kilo kan du løfte for 10 reps?
          </Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder="F.eks. 80"
            keyboardType="numeric"
            placeholderTextColor="#8E8E93"
          />
        </View>

        {/* Notes (Optional) */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Noter (valgfrit)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Tilføj noter..."
            placeholderTextColor="#8E8E93"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.8}>
          <Text style={styles.saveButtonText}>
            {existingRep ? 'Opdater Reps' : 'Gem Reps'}
          </Text>
        </TouchableOpacity>
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
    marginBottom: 24,
  },
  exerciseName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  exerciseSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
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

export default AddRepScreen;



