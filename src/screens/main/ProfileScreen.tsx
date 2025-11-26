/**
 * Profile Screen
 * User profile and workout history
 */

import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Switch, Alert} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import FavoriteGymsSelector from './FavoriteGymsSelector';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';

// Component for rendering favorite gym with logo
const FavoriteGymItem = ({gym, index}: {gym: DanishGym; index: number}) => {
  const logoUrl = getGymLogo(gym.brand);
  const hasLogo = hasGymLogo(gym.brand);
  const [logoError, setLogoError] = useState(false);

  return (
    <View style={styles.favoriteGymItem}>
      <View style={styles.favoriteGymNumber}>
        <Text style={styles.favoriteGymNumberText}>{index + 1}</Text>
      </View>
      {hasLogo && logoUrl && !logoError ? (
        <View style={styles.favoriteGymLogoContainer}>
          <Image
            source={{uri: logoUrl}}
            style={styles.favoriteGymLogo}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        </View>
      ) : (
        <View style={styles.favoriteGymIconPlaceholder}>
          <Icon name="fitness" size={24} color="#007AFF" />
        </View>
      )}
      <View style={styles.favoriteGymInfo}>
        <Text style={styles.favoriteGymName}>{gym.name}</Text>
        <Text style={styles.favoriteGymLocation}>
          {gym.city} {gym.brand && `• ${gym.brand}`}
        </Text>
      </View>
      <Icon name="star" size={20} color="#FFD700" />
    </View>
  );
};

type TimePeriod = 'week' | 'month' | 'year' | 'all';

type ProfileScreenNavigationProp = StackNavigationProp<any>;

type ProfileVisibility = 'everyone' | 'friends' | 'friends_and_gyms' | 'private';

const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const {user, setUser} = useAppStore();
  const {
    getWeeklyStats,
    getTotalWorkoutTime,
    getWorkoutTimeForPeriod,
    getCheckInsForPeriod,
    getWorkoutsWithFriendsForPeriod,
    getMostTrainedMuscleGroup,
    getWorkoutsWithFriends,
  } = useWorkoutStore();
  const [showGymSelector, setShowGymSelector] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('all');
  const [selectedStatsPeriod, setSelectedStatsPeriod] = useState<TimePeriod>('all');
  const [showProfileVisibilityPicker, setShowProfileVisibilityPicker] = useState(false);

  const favoriteGyms = useMemo(() => {
    if (!user?.favoriteGyms) return [];
    return user.favoriteGyms
      .map(id => danishGyms.find(gym => gym.id === id))
      .filter((gym): gym is DanishGym => gym !== undefined);
  }, [user?.favoriteGyms]);

  const weeklyStats = getWeeklyStats();
  const workoutTimeForPeriod = getWorkoutTimeForPeriod(selectedPeriod);
  const checkInsForPeriod = getCheckInsForPeriod(selectedStatsPeriod);
  const workoutsWithFriendsForPeriod = getWorkoutsWithFriendsForPeriod(selectedStatsPeriod);
  const mostTrainedMuscleGroup = getMostTrainedMuscleGroup();

  // Handle profile visibility change
  const handleProfileVisibilityChange = (visibility: ProfileVisibility) => {
    if (!user) return;
    
    const updatedUser = {
      ...user,
      privacySettings: {
        ...user.privacySettings,
        profileVisibility: visibility,
      },
      updatedAt: new Date(),
    };
    setUser(updatedUser);
    setShowProfileVisibilityPicker(false);
  };

  // Handle location sharing toggle
  const handleLocationSharingToggle = (enabled: boolean) => {
    if (!user) return;
    
    const updatedUser = {
      ...user,
      privacySettings: {
        ...user.privacySettings,
        locationSharingEnabled: enabled,
      },
      updatedAt: new Date(),
    };
    setUser(updatedUser);
  };

  // Get profile visibility label
  const getProfileVisibilityLabel = (visibility: string): string => {
    switch (visibility) {
      case 'friends':
        return 'Kun Venner';
      case 'friends_and_gyms':
        return 'Kun Venner & Lokal Centre';
      case 'everyone':
        return 'Alle';
      case 'private':
        return 'Privat';
      default:
        return 'Privat';
    }
  };

  // Format total workout time
  const formatTotalTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours}t`;
    }
    return `${hours}t ${mins}m`;
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {user?.profileImageUrl ? (
              <Image source={{uri: user.profileImageUrl}} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="person" size={48} color="#007AFF" />
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{user?.displayName}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
        </View>

        {/* PR's og Reps Section */}
        <TouchableOpacity
          style={styles.section}
          onPress={() => navigation.navigate('PersonalPRsReps')}
          activeOpacity={0.7}>
          <View style={styles.sectionHeader}>
            <View style={styles.prRepsHeaderLeft}>
              <Icon name="trophy" size={20} color="#007AFF" />
              <Text style={styles.sectionTitle}>Dine PR's og Reps</Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#8E8E93" />
          </View>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsContainer}>
          {/* Period Selection Buttons for Stats */}
          <View style={styles.statsPeriodButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.statsPeriodButton,
                selectedStatsPeriod === 'week' && styles.statsPeriodButtonActive,
              ]}
              onPress={() => setSelectedStatsPeriod('week')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.statsPeriodButtonText,
                  selectedStatsPeriod === 'week' && styles.statsPeriodButtonTextActive,
                ]}>
                Uge
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statsPeriodButton,
                selectedStatsPeriod === 'month' && styles.statsPeriodButtonActive,
              ]}
              onPress={() => setSelectedStatsPeriod('month')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.statsPeriodButtonText,
                  selectedStatsPeriod === 'month' && styles.statsPeriodButtonTextActive,
                ]}>
                Måned
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statsPeriodButton,
                selectedStatsPeriod === 'year' && styles.statsPeriodButtonActive,
              ]}
              onPress={() => setSelectedStatsPeriod('year')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.statsPeriodButtonText,
                  selectedStatsPeriod === 'year' && styles.statsPeriodButtonTextActive,
                ]}>
                År
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statsPeriodButton,
                selectedStatsPeriod === 'all' && styles.statsPeriodButtonActive,
              ]}
              onPress={() => setSelectedStatsPeriod('all')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.statsPeriodButtonText,
                  selectedStatsPeriod === 'all' && styles.statsPeriodButtonTextActive,
                ]}>
                I alt
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{checkInsForPeriod}</Text>
              <Text style={styles.statLabel}>Check-ins</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Venner</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{workoutsWithFriendsForPeriod}</Text>
              <Text style={styles.statLabel}>Workouts med venner</Text>
            </View>
          </View>
        </View>

        {/* Additional Stats */}
        <View style={styles.additionalStatsContainer}>
          {/* Period Selection Buttons */}
          <View style={styles.periodButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.periodButton,
                selectedPeriod === 'week' && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod('week')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === 'week' && styles.periodButtonTextActive,
                ]}>
                Uge
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.periodButton,
                selectedPeriod === 'month' && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod('month')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === 'month' && styles.periodButtonTextActive,
                ]}>
                Måned
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.periodButton,
                selectedPeriod === 'year' && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod('year')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === 'year' && styles.periodButtonTextActive,
                ]}>
                År
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.periodButton,
                selectedPeriod === 'all' && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod('all')}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === 'all' && styles.periodButtonTextActive,
                ]}>
                I alt
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.additionalStatItem}>
            <Icon name="time-outline" size={20} color="#007AFF" style={styles.statIcon} />
            <View style={styles.additionalStatContent}>
              <Text style={styles.additionalStatLabel}>Tid trænet</Text>
              <Text style={styles.additionalStatValue}>
                {formatTotalTime(workoutTimeForPeriod)}
              </Text>
            </View>
          </View>

          {mostTrainedMuscleGroup && (
            <View style={[styles.additionalStatItem, styles.additionalStatItemLast]}>
              <Icon name="fitness-outline" size={20} color="#007AFF" style={styles.statIcon} />
              <View style={styles.additionalStatContent}>
                <Text style={styles.additionalStatLabel}>Oftest trænet</Text>
                <Text style={styles.additionalStatValue}>{mostTrainedMuscleGroup}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Goals Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mål</Text>
            <TouchableOpacity
              style={styles.addGoalButton}
              onPress={() => navigation.navigate('AddGoal')}
              activeOpacity={0.7}>
              <Icon name="add-circle" size={20} color="#007AFF" />
              <Text style={styles.addGoalButtonText}>Tilføj Mål</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.emptyGoals}>
            <Icon name="flag-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyGoalsText}>Ingen mål endnu</Text>
            <Text style={styles.emptyGoalsSubtext}>
              Tilføj et mål for at holde dig motiveret
            </Text>
          </View>
        </View>

        {/* Favorite Gyms Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mine lokale centre</Text>
            <TouchableOpacity
              onPress={() => setShowGymSelector(true)}
              style={styles.editButton}>
              <Icon name="create-outline" size={20} color="#007AFF" />
              <Text style={styles.editButtonText}>
                {favoriteGyms.length > 0 ? 'Rediger' : 'Vælg'}
              </Text>
            </TouchableOpacity>
          </View>
          {favoriteGyms.length > 0 ? (
            favoriteGyms.map((gym, index) => (
              <FavoriteGymItem key={gym.id} gym={gym} index={index} />
            ))
          ) : (
            <View style={styles.emptyFavorites}>
              <Icon name="location-outline" size={32} color="#C7C7CC" />
              <Text style={styles.emptyFavoritesText}>
                Ingen lokale centre valgt
              </Text>
              <Text style={styles.emptyFavoritesSubtext}>
                Tryk på "Vælg" for at tilføje dine favorit centre
              </Text>
            </View>
          )}
        </View>

        {/* Privacy Settings Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privat Indstillinger</Text>
          
          {/* Profile Visibility */}
          <TouchableOpacity
            style={styles.privacyItem}
            onPress={() => setShowProfileVisibilityPicker(!showProfileVisibilityPicker)}
            activeOpacity={0.7}>
            <Icon name="eye" size={20} color="#007AFF" />
            <View style={styles.privacyItemContent}>
              <Text style={styles.privacyLabel}>Profil synlighed</Text>
              <Text style={styles.privacyValue}>
                {getProfileVisibilityLabel(user?.privacySettings.profileVisibility || 'private')}
              </Text>
            </View>
            <Icon name="chevron-down" size={20} color="#8E8E93" />
          </TouchableOpacity>
          
          {showProfileVisibilityPicker && (
            <View style={styles.visibilityOptions}>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  user?.privacySettings.profileVisibility === 'friends' && styles.visibilityOptionSelected,
                ]}
                onPress={() => handleProfileVisibilityChange('friends')}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.visibilityOptionText,
                    user?.privacySettings.profileVisibility === 'friends' && styles.visibilityOptionTextSelected,
                  ]}>
                  Kun Venner
                </Text>
                {user?.privacySettings.profileVisibility === 'friends' && (
                  <Icon name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  user?.privacySettings.profileVisibility === 'friends_and_gyms' && styles.visibilityOptionSelected,
                ]}
                onPress={() => handleProfileVisibilityChange('friends_and_gyms')}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.visibilityOptionText,
                    user?.privacySettings.profileVisibility === 'friends_and_gyms' && styles.visibilityOptionTextSelected,
                  ]}>
                  Kun Venner & Lokal Centre
                </Text>
                {user?.privacySettings.profileVisibility === 'friends_and_gyms' && (
                  <Icon name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  user?.privacySettings.profileVisibility === 'everyone' && styles.visibilityOptionSelected,
                ]}
                onPress={() => handleProfileVisibilityChange('everyone')}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.visibilityOptionText,
                    user?.privacySettings.profileVisibility === 'everyone' && styles.visibilityOptionTextSelected,
                  ]}>
                  Alle
                </Text>
                {user?.privacySettings.profileVisibility === 'everyone' && (
                  <Icon name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Location Sharing */}
          <View style={styles.privacyItem}>
            <Icon name="location" size={20} color="#007AFF" />
            <View style={styles.privacyItemContent}>
              <Text style={styles.privacyLabel}>Lokationsdeling</Text>
            </View>
            <Switch
              value={user?.privacySettings.locationSharingEnabled || false}
              onValueChange={handleLocationSharingToggle}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* This Week Section */}
        <ThisWeekSection />
      </ScrollView>

      {/* Favorite Gyms Selector Modal */}
      <FavoriteGymsSelector
        visible={showGymSelector}
        onClose={() => setShowGymSelector(false)}
      />
    </View>
  );
};

// This Week Workout Statistics Component
const ThisWeekSection = () => {
  const {getWeeklyStats, getThisWeekData} = useWorkoutStore();
  const weeklyStats = getWeeklyStats();
  const dailyData = getThisWeekData();

  // Find max duration for scaling the graph
  const maxDuration = Math.max(...dailyData.map(d => d.duration), 1);
  const graphHeight = 120;

  // Format day names (Danish)
  const dayNames = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

  return (
    <View style={styles.thisWeekSection}>
      <View style={styles.thisWeekHeader}>
        <View style={styles.thisWeekHeaderLeft}>
          <Icon name="fitness" size={20} color="#007AFF" />
          <Text style={styles.thisWeekTitle}>Denne uge</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.thisWeekStats}>
        <View style={styles.thisWeekStatItem}>
          <Text style={styles.thisWeekStatValue}>{weeklyStats.workouts}</Text>
          <Text style={styles.thisWeekStatLabel}>Træninger</Text>
        </View>
        <View style={styles.thisWeekStatItem}>
          <Text style={styles.thisWeekStatValue}>
            {weeklyStats.totalHours > 0 ? weeklyStats.totalHours.toFixed(1) : '0'}t
          </Text>
          <Text style={styles.thisWeekStatLabel}>Tid</Text>
        </View>
        <View style={styles.thisWeekStatItem}>
          <Text style={styles.thisWeekStatValue}>
            {weeklyStats.averageDuration > 0 ? weeklyStats.averageDuration : '0'}m
          </Text>
          <Text style={styles.thisWeekStatLabel}>Gennemsnit</Text>
        </View>
      </View>

      {/* Graph */}
      <View style={styles.thisWeekGraph}>
        <View style={styles.graphContainer}>
          {dailyData.map((day, index) => {
            const barHeight = maxDuration > 0 ? (day.duration / maxDuration) * graphHeight : 0;
            const hasWorkout = day.workouts > 0;
            // Get day index (0 = Monday, 6 = Sunday)
            const dayIndex = day.date.getDay() === 0 ? 6 : day.date.getDay() - 1;

            return (
              <View key={index} style={styles.graphDay}>
                <View style={styles.graphBarContainer}>
                  {hasWorkout ? (
                    <View
                      style={[
                        styles.graphBar,
                        {height: Math.max(barHeight, 4)},
                      ]}
                    />
                  ) : (
                    <View style={styles.graphBarEmpty} />
                  )}
                </View>
                <Text style={styles.graphDayLabel}>
                  {dayNames[dayIndex]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#666',
  },
  statsContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statsPeriodButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  statsPeriodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsPeriodButtonActive: {
    backgroundColor: '#007AFF',
  },
  statsPeriodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statsPeriodButtonTextActive: {
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
  },
  additionalStatsContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  additionalStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  additionalStatItemLast: {
    marginBottom: 0,
  },
  statIcon: {
    marginRight: 12,
  },
  additionalStatContent: {
    flex: 1,
  },
  additionalStatLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  additionalStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  periodButtonsContainer: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  prRepsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 4,
  },
  favoriteGymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  favoriteGymNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  favoriteGymNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  favoriteGymLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  favoriteGymLogo: {
    width: 40,
    height: 40,
  },
  favoriteGymIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  favoriteGymInfo: {
    flex: 1,
  },
  favoriteGymName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  favoriteGymLocation: {
    fontSize: 14,
    color: '#8E8E93',
  },
  emptyFavorites: {
    alignItems: 'center',
    padding: 32,
  },
  emptyFavoritesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyFavoritesSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addGoalButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyGoals: {
    alignItems: 'center',
    padding: 32,
  },
  emptyGoalsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyGoalsSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  privacyItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  privacyLabel: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  privacyValue: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  visibilityOptions: {
    marginLeft: 32,
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 8,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  visibilityOptionSelected: {
    backgroundColor: '#E3F2FD',
  },
  visibilityOptionText: {
    fontSize: 16,
    color: '#000',
  },
  visibilityOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  thisWeekSection: {
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
  thisWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  thisWeekHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thisWeekTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  thisWeekStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  thisWeekStatItem: {
    alignItems: 'center',
  },
  thisWeekStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  thisWeekStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  thisWeekGraph: {
    marginTop: 8,
  },
  graphContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 140,
  },
  graphDay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  graphBarContainer: {
    width: '80%',
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  graphBar: {
    width: 24,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    minHeight: 4,
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
  },
  graphBarEmpty: {
    width: 24,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    position: 'absolute',
    bottom: 0,
  },
  graphDayLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 8,
  },
  prRepsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default ProfileScreen;

