/**
 * Profile Screen
 * User profile and workout history
 */

import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Image, TouchableOpacity} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useWorkoutStore} from '@/store/workoutStore';
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

const ProfileScreen = () => {
  const {user} = useAppStore();
  const {getWeeklyStats} = useWorkoutStore();
  const [showGymSelector, setShowGymSelector] = useState(false);

  const favoriteGyms = useMemo(() => {
    if (!user?.favoriteGyms) return [];
    return user.favoriteGyms
      .map(id => danishGyms.find(gym => gym.id === id))
      .filter((gym): gym is DanishGym => gym !== undefined);
  }, [user?.favoriteGyms]);

  const weeklyStats = getWeeklyStats();

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

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{weeklyStats.workouts}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Venner</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{weeklyStats.workouts}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
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
          <Text style={styles.sectionTitle}>Privacy Indstillinger</Text>
          <View style={styles.privacyItem}>
            <Icon name="eye" size={20} color="#007AFF" />
            <Text style={styles.privacyText}>
              Profil synlighed: {user?.privacySettings.profileVisibility === 'friends' ? 'Venner' : user?.privacySettings.profileVisibility === 'everyone' ? 'Alle' : 'Privat'}
            </Text>
          </View>
          <View style={styles.privacyItem}>
            <Icon name="location" size={20} color="#007AFF" />
            <Text style={styles.privacyText}>
              Lokationsdeling: {user?.privacySettings.locationSharingEnabled ? 'Aktiveret' : 'Deaktiveret'}
            </Text>
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
    flexDirection: 'row',
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
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  privacyText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
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
});

export default ProfileScreen;

