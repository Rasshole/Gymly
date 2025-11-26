/**
 * PR & Reps Screen
 * Display and manage personal records and rep tracking
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {usePRStore} from '@/store/prStore';
import {ExerciseType} from '@/types/pr.types';
import AddPRScreen from './AddPRScreen';
import AddRepScreen from './AddRepScreen';

type PRRepsScreenNavigationProp = StackNavigationProp<any>;

const exercises: ExerciseType[] = [
  'Bænkpres',
  'Dødløft',
  'Benpres',
  'Squads',
  'Incline Dumbell',
  'Pull-Down',
  'Shoulder Pres Dumbell',
];

const PRRepsScreen = () => {
  const navigation = useNavigation<PRRepsScreenNavigationProp>();
  const {getPR, getRepRecord, getAllPRs, getAllRepRecords} = usePRStore();
  const [activeTab, setActiveTab] = useState<'pr' | 'reps'>('pr');

  const allPRs = getAllPRs();
  const allRepRecords = getAllRepRecords();

  const renderExerciseCard = (exercise: ExerciseType) => {
    const pr = getPR(exercise);
    const repRecord = getRepRecord(exercise);

    return (
      <View key={exercise} style={styles.exerciseCard}>
        <View style={styles.exerciseHeader}>
          <Text style={styles.exerciseName}>{exercise}</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              if (activeTab === 'pr') {
                navigation.navigate('AddPR', {
                  exercise,
                  existingPR: pr,
                });
              } else {
                navigation.navigate('AddRep', {
                  exercise,
                  existingRep: repRecord,
                });
              }
            }}
            activeOpacity={0.7}>
            <Icon
              name={pr || repRecord ? 'create-outline' : 'add-circle-outline'}
              size={20}
              color="#007AFF"
            />
          </TouchableOpacity>
        </View>

        {activeTab === 'pr' ? (
          <View style={styles.prContent}>
            {pr ? (
              <>
                <View style={styles.prValueContainer}>
                  <Text style={styles.prValue}>{pr.weight}</Text>
                  <Text style={styles.prUnit}>kg</Text>
                </View>
                {pr.videoUrl ? (
                  <TouchableOpacity
                    style={styles.videoContainer}
                    onPress={() => {
                      // TODO: Open video player
                      Alert.alert('Video', 'Video afspiller åbnes her');
                    }}
                    activeOpacity={0.8}>
                    <Icon name="play-circle" size={48} color="#007AFF" />
                    <Text style={styles.videoText}>Se video</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noVideoContainer}>
                    <Icon name="videocam-outline" size={32} color="#8E8E93" />
                    <Text style={styles.noVideoText}>Ingen video</Text>
                  </View>
                )}
                <Text style={styles.dateText}>
                  Sat {new Date(pr.date).toLocaleDateString('da-DK', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="trophy-outline" size={48} color="#C7C7CC" />
                <Text style={styles.emptyText}>Ingen PR sat endnu</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    navigation.navigate('AddPR', {exercise});
                  }}
                  activeOpacity={0.8}>
                  <Text style={styles.addButtonText}>Tilføj PR</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.repsContent}>
            {repRecord ? (
              <>
                <View style={styles.repsValueContainer}>
                  <Text style={styles.repsValue}>{repRecord.weight}</Text>
                  <Text style={styles.repsUnit}>kg</Text>
                  <Text style={styles.repsLabel}>for 10 reps</Text>
                </View>
                <Text style={styles.dateText}>
                  Opdateret {new Date(repRecord.date).toLocaleDateString('da-DK', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="barbell-outline" size={48} color="#C7C7CC" />
                <Text style={styles.emptyText}>Ingen reps registreret</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    navigation.navigate('AddRep', {exercise});
                  }}
                  activeOpacity={0.8}>
                  <Text style={styles.addButtonText}>Tilføj reps</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pr' && styles.tabActive]}
          onPress={() => setActiveTab('pr')}
          activeOpacity={0.7}>
          <Icon
            name="trophy"
            size={20}
            color={activeTab === 'pr' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'pr' && styles.tabTextActive,
            ]}>
            PR
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reps' && styles.tabActive]}
          onPress={() => setActiveTab('reps')}
          activeOpacity={0.7}>
          <Icon
            name="barbell"
            size={20}
            color={activeTab === 'reps' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'reps' && styles.tabTextActive,
            ]}>
            Reps
          </Text>
        </TouchableOpacity>
      </View>

      {/* Exercises List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {exercises.map(exercise => renderExerciseCard(exercise))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabActive: {
    backgroundColor: '#E3F2FD',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginLeft: 8,
  },
  tabTextActive: {
    color: '#007AFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  exerciseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  editButton: {
    padding: 4,
  },
  prContent: {
    alignItems: 'center',
  },
  prValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  prValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  prUnit: {
    fontSize: 24,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  videoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  videoText: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 8,
    fontWeight: '600',
  },
  noVideoContainer: {
    alignItems: 'center',
    marginBottom: 12,
    padding: 16,
  },
  noVideoText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  repsContent: {
    alignItems: 'center',
  },
  repsValueContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  repsValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  repsUnit: {
    fontSize: 24,
    fontWeight: '600',
    color: '#007AFF',
  },
  repsLabel: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 12,
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

export default PRRepsScreen;



