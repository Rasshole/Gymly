/**
 * Personal PRs and Reps Screen
 * Shows user's personal records with video and weight, and rep records with weight
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
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {SafeAreaView} from 'react-native';
import {usePRStore} from '@/store/prStore';
import {useAppStore} from '@/store/appStore';
import {PersonalRecord, RepRecord, ExerciseType} from '@/types/pr.types';
import {colors} from '@/theme/colors';

const exercises: ExerciseType[] = [
  'Bænkpres',
  'Dødløft',
  'Benpres',
  'Squads',
  'Incline Dumbell',
  'Pull-Down',
  'Shoulder Pres Dumbell',
];

const PersonalPRsRepsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user} = useAppStore();
  const {getAllPRs, getAllRepRecords} = usePRStore();
  const [activeTab, setActiveTab] = useState<'pr' | 'reps'>('pr');

  const allPRs = getAllPRs();
  const allRepRecords = getAllRepRecords();

  const renderPRCard = (pr: PersonalRecord) => {
    return (
      <View key={pr.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.exerciseName}>{pr.exercise}</Text>
        </View>
        <View style={styles.prContent}>
          <View style={styles.weightContainer}>
            <Text style={styles.weightValue}>{pr.weight}</Text>
            <Text style={styles.weightUnit}>kg</Text>
          </View>
          {pr.videoUrl ? (
            <TouchableOpacity
              style={styles.videoContainer}
              onPress={() => {
                // TODO: Open video player
                Alert.alert('Video', 'Video afspiller åbnes her');
              }}
              activeOpacity={0.8}>
              <View style={styles.videoThumbnail}>
                <Icon name="play-circle" size={48} color="#007AFF" />
                <Text style={styles.videoText}>Se video</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.noVideoContainer}>
              <Icon name="videocam-off-outline" size={32} color="#8E8E93" />
              <Text style={styles.noVideoText}>Ingen video</Text>
            </View>
          )}
          <Text style={styles.dateText}>
            Sat {new Date(pr.date instanceof Date ? pr.date : new Date(pr.date)).toLocaleDateString('da-DK', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>
    );
  };

  const renderRepCard = (rep: RepRecord) => {
    return (
      <View key={rep.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.exerciseName}>{rep.exercise}</Text>
        </View>
        <View style={styles.repContent}>
          <View style={styles.weightContainer}>
            <Text style={styles.weightValue}>{rep.weight}</Text>
            <Text style={styles.weightUnit}>kg</Text>
          </View>
          <Text style={styles.dateText}>
            Opdateret {new Date(rep.date instanceof Date ? rep.date : new Date(rep.date)).toLocaleDateString('da-DK', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dine PR's og Reps</Text>
        <View style={styles.headerRight} />
      </View>

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
            PR's
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

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {activeTab === 'pr' ? (
          allPRs.length > 0 ? (
            allPRs.map(pr => renderPRCard(pr))
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="trophy-outline" size={80} color="#C7C7CC" />
              <Text style={styles.emptyTitle}>Ingen PR's endnu</Text>
              <Text style={styles.emptyText}>
                Du har ikke sat nogen personlige rekorder endnu.
              </Text>
            </View>
          )
        ) : allRepRecords.length > 0 ? (
          allRepRecords.map(rep => renderRepCard(rep))
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="barbell-outline" size={80} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>Ingen Reps registreret</Text>
            <Text style={styles.emptyText}>
              Du har ikke registreret nogen rep records endnu.
            </Text>
          </View>
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
  headerRight: {
    width: 32,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
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
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 8,
  },
  tabTextActive: {
    color: colors.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  prContent: {
    alignItems: 'center',
  },
  repContent: {
    alignItems: 'center',
  },
  weightContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  weightValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  weightUnit: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.secondary,
    marginLeft: 8,
  },
  videoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  videoThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  videoText: {
    fontSize: 14,
    color: colors.secondary,
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
    color: colors.textMuted,
    marginTop: 8,
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default PersonalPRsRepsScreen;

