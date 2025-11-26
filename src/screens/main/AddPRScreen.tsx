/**
 * Add PR Screen
 * Screen for adding or editing a personal record
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
import {ExerciseType, PersonalRecord} from '@/types/pr.types';

type AddPRRouteParams = {
  exercise: ExerciseType;
  existingPR?: PersonalRecord;
};

type AddPRNavigationProp = StackNavigationProp<any>;

const AddPRScreen = () => {
  const navigation = useNavigation<AddPRNavigationProp>();
  const route = useRoute<RouteProp<{params: AddPRRouteParams}, 'params'>>();
  const {exercise, existingPR} = route.params || {};
  const {addPR, updatePR} = usePRStore();

  const [weight, setWeight] = useState(existingPR?.weight.toString() || '');
  const [videoUrl, setVideoUrl] = useState(existingPR?.videoUrl || '');
  const [notes, setNotes] = useState(existingPR?.notes || '');

  const handleSave = () => {
    if (!weight || isNaN(Number(weight)) || Number(weight) <= 0) {
      Alert.alert('Ugyldig vægt', 'Indtast venligst en gyldig vægt i kg');
      return;
    }

    if (existingPR) {
      updatePR(existingPR.id, {
        weight: Number(weight),
        videoUrl: videoUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert('PR opdateret', 'Din PR er blevet opdateret', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      addPR({
        userId: 'current_user', // TODO: Get from auth store
        exercise: exercise!,
        weight: Number(weight),
        videoUrl: videoUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert('PR tilføjet', 'Din PR er blevet tilføjet', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    }
  };

  const handleVideoPick = () => {
    // TODO: Implement video picker (max 30 seconds)
    Alert.alert(
      'Video upload',
      'Video upload funktionalitet kommer snart. Maksimal længde: 30 sekunder.',
    );
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
          {existingPR ? 'Rediger PR' : 'Tilføj PR'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Exercise Name */}
        <View style={styles.section}>
          <Text style={styles.exerciseName}>{exercise}</Text>
        </View>

        {/* Weight Input */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Vægt (kg)</Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder="F.eks. 100"
            keyboardType="numeric"
            placeholderTextColor="#8E8E93"
          />
        </View>

        {/* Video Section */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Video (max 30 sekunder)</Text>
          <Text style={styles.inputHint}>
            Upload en video af dig der udfører øvelsen
          </Text>
          <TouchableOpacity
            style={styles.videoButton}
            onPress={handleVideoPick}
            activeOpacity={0.8}>
            <Icon name="videocam" size={24} color="#007AFF" />
            <Text style={styles.videoButtonText}>
              {videoUrl ? 'Video valgt' : 'Vælg video'}
            </Text>
          </TouchableOpacity>
          {videoUrl && (
            <TouchableOpacity
              style={styles.removeVideoButton}
              onPress={() => setVideoUrl('')}
              activeOpacity={0.7}>
              <Icon name="close-circle" size={20} color="#FF3B30" />
              <Text style={styles.removeVideoText}>Fjern video</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notes (Optional) */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Noter (valgfrit)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Tilføj noter om din PR..."
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
            {existingPR ? 'Opdater PR' : 'Gem PR'}
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
  videoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  videoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 12,
  },
  removeVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  removeVideoText: {
    fontSize: 14,
    color: '#FF3B30',
    marginLeft: 6,
    fontWeight: '600',
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

export default AddPRScreen;



