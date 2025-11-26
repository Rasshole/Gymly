/**
 * Friend Workout Detail Screen
 * Shows detailed information about a friend's current workout
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';

type FriendWorkoutDetailRouteParams = {
  friendId: string;
  friendName: string;
  activeTime?: string;
  gymName?: string;
  muscleGroup?: string;
};

type FriendWorkoutDetailNavigationProp = StackNavigationProp<any>;

const FriendWorkoutDetailScreen = () => {
  const navigation = useNavigation<FriendWorkoutDetailNavigationProp>();
  const route =
    useRoute<RouteProp<{params: FriendWorkoutDetailRouteParams}, 'params'>>();
  const {friendName, activeTime, gymName, muscleGroup} = route.params || {};

  // Mock data - in real app, this would come from API
  const workoutDuration = activeTime || '00:15:30';
  const currentMuscleGroup = muscleGroup || 'Bryst & Triceps';
  const currentGym = gymName || 'PureGym';

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
        <Text style={styles.headerTitle}>Træningsdetaljer</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Friend Info Card */}
        <View style={styles.friendCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {friendName?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View style={styles.onlineIndicator} />
          </View>
          <Text style={styles.friendName}>{friendName}</Text>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>

        {/* Workout Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Træningsinformation</Text>

          {/* Duration Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Icon name="time-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Træningstid</Text>
              <Text style={styles.infoValue}>{workoutDuration}</Text>
            </View>
          </View>

          {/* Muscle Group Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Icon name="fitness-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Muskelgruppe</Text>
              <Text style={styles.infoValue}>{currentMuscleGroup}</Text>
            </View>
          </View>

          {/* Gym Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Icon name="location-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Center</Text>
              <Text style={styles.infoValue}>{currentGym}</Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => {
            // Navigate to join request
            navigation.goBack();
          }}
          activeOpacity={0.8}>
          <Text style={styles.joinButtonText}>Spørg om deltagelse</Text>
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
  friendCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#fff',
  },
  friendName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  onlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  joinButton: {
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
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default FriendWorkoutDetailScreen;



