/**
 * Profile Screen
 * User profile and workout history
 */

import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Switch, Alert, FlatList, Dimensions, Modal, TextInput} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {usePRStore} from '@/store/prStore';
import {useFeedStore} from '@/store/feedStore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import FavoriteGymsSelector from './FavoriteGymsSelector';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {PersonalRecord, RepRecord} from '@/types/pr.types';
import {colors} from '@/theme/colors';

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
type TabType = 'feed' | 'prs' | 'stats';

type ProfileScreenNavigationProp = StackNavigationProp<any>;

type ProfileVisibility = 'everyone' | 'friends' | 'friends_and_gyms' | 'private';

// Mock friends list for mentions
const FRIENDS = [
  {id: '1', name: 'Jeff'},
  {id: '2', name: 'Marie'},
  {id: '3', name: 'Lars'},
  {id: '4', name: 'Sofia'},
  {id: '5', name: 'Patti'},
];

// Component to render text with clickable mentions
const RenderTextWithMentions = ({text, mentionedUsers, navigation}: {text: string; mentionedUsers?: string[]; navigation: any}) => {
  const parts: Array<{text: string; isMention: boolean; userId?: string}> = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push({text: text.substring(lastIndex, match.index), isMention: false});
    }
    
    // Add mention
    const mentionedName = match[1];
    const friend = FRIENDS.find(f => f.name === mentionedName);
    const userId = friend?.id || (mentionedUsers && mentionedUsers.length > 0 ? mentionedUsers[0] : undefined);
    
    parts.push({
      text: `@${mentionedName}`,
      isMention: true,
      userId: userId,
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({text: text.substring(lastIndex), isMention: false});
  }

  return (
    <Text style={styles.profileFeedDescription}>
      {parts.map((part, index) => {
        if (part.isMention && part.userId) {
          return (
            <Text
              key={index}
              style={styles.profileFeedMention}
              onPress={() => {
                navigation.navigate('FriendProfile', {friendId: part.userId});
              }}>
              {part.text}
            </Text>
          );
        }
        return <Text key={index}>{part.text}</Text>;
      })}
    </Text>
  );
};

const PR_OPTIONS = ['Bænk', 'Bicepcurl', 'Benpres', 'Dødløft', 'Squat'] as const;
type PrOption = (typeof PR_OPTIONS)[number];

// Mock workout media data
interface WorkoutMedia {
  id: string;
  type: 'photo' | 'video';
  url: string;
  workoutDate: Date;
  thumbnailUrl?: string;
}

const mockWorkoutMedia: WorkoutMedia[] = [
  {
    id: 'media_1',
    type: 'photo',
    url: 'https://via.placeholder.com/400x400?text=Workout+Photo+1',
    workoutDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'media_2',
    type: 'video',
    url: 'https://via.placeholder.com/400x400?text=Workout+Video+1',
    workoutDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    thumbnailUrl: 'https://via.placeholder.com/400x400?text=Video+Thumbnail',
  },
  {
    id: 'media_3',
    type: 'photo',
    url: 'https://via.placeholder.com/400x400?text=Workout+Photo+2',
    workoutDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

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
  const [selectedStatsPeriod, setSelectedStatsPeriod] = useState<TimePeriod>('all');
  const [showProfileVisibilityPicker, setShowProfileVisibilityPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [activePRTab, setActivePRTab] = useState<'pr' | 'reps'>('pr');
  const [showWorkoutsInStats, setShowWorkoutsInStats] = useState(false);
  const [prModalVisible, setPrModalVisible] = useState(false);
  const [prStep, setPrStep] = useState<'select' | 'details'>('select');
  const [selectedPr, setSelectedPr] = useState<PrOption | null>(null);
  const [prWeight, setPrWeight] = useState('');
  const [prVideoAttached, setPrVideoAttached] = useState(false);
  
  const {getAllPRs, getAllRepRecords} = usePRStore();
  const allPRs = getAllPRs();
  const allRepRecords = getAllRepRecords();
  const {feedItems, deleteFeedItem} = useFeedStore();
  
  // Filter feed items to only show current user's posts
  const userFeedItems = useMemo(() => {
    const currentUser = user?.displayName || user?.username || 'Du';
    return feedItems.filter(item => item.user === currentUser || item.user === 'Du');
  }, [feedItems, user]);

  const favoriteGyms = useMemo(() => {
    if (!user?.favoriteGyms) return [];
    return user.favoriteGyms
      .map(id => danishGyms.find(gym => gym.id === id))
      .filter((gym): gym is DanishGym => gym !== undefined);
  }, [user?.favoriteGyms]);

  const weeklyStats = getWeeklyStats();
  const workoutTimeForPeriod = getWorkoutTimeForPeriod(selectedStatsPeriod);
  const checkInsForPeriod = getCheckInsForPeriod(selectedStatsPeriod);
  const workoutsWithFriendsForPeriod = getWorkoutsWithFriendsForPeriod(selectedStatsPeriod);
  const mostTrainedMuscleGroup = getMostTrainedMuscleGroup();
  
  // Calculate additional stats
  const workoutTimeWithFriendsForPeriod = useMemo(() => {
    // Mock: 30% of workout time is with friends
    return Math.floor(workoutTimeForPeriod * 0.3);
  }, [workoutTimeForPeriod]);
  
  const {workouts} = useWorkoutStore();
  
  const mostFrequentGym = useMemo(() => {
    // Get most frequent gym from workouts for selected period
    if (!workouts || workouts.length === 0) return null;
    
    const now = new Date();
    let startDate: Date;
    
    switch (selectedStatsPeriod) {
      case 'week': {
        const weekStart = new Date(now);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(weekStart.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'all':
      default:
        startDate = new Date(0);
        break;
    }
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    const filteredWorkouts = workouts.filter(w => 
      w.startTime >= startDate && w.startTime <= endDate
    );
    
    if (filteredWorkouts.length === 0) return null;
    
    const gymCounts: Record<number, {count: number; time: number; name?: string}> = {};
    filteredWorkouts.forEach(workout => {
      if (workout.gymId) {
        if (!gymCounts[workout.gymId]) {
          const gym = danishGyms.find(g => g.id === workout.gymId);
          gymCounts[workout.gymId] = {
            count: 0,
            time: 0,
            name: gym?.name || 'Ukendt center',
          };
        }
        gymCounts[workout.gymId].count += 1;
        gymCounts[workout.gymId].time += workout.duration;
      }
    });
    
    const entries = Object.entries(gymCounts);
    if (entries.length === 0) return null;
    
    const mostFrequent = entries.reduce((a, b) => 
      a[1].count > b[1].count ? a : b
    );
    
    return {
      name: mostFrequent[1].name || 'Ukendt center',
      checkins: mostFrequent[1].count,
      time: mostFrequent[1].time,
    };
  }, [workouts, selectedStatsPeriod]);
  
  const [showMuscleGroupModal, setShowMuscleGroupModal] = useState(false);
  
  // Calculate muscle group stats for modal
  const muscleGroupStats = useMemo(() => {
    if (!workouts || workouts.length === 0) return {};
    
    const counts: Record<string, number> = {};
    workouts.forEach(workout => {
      if (workout.muscleGroup) {
        counts[workout.muscleGroup] = (counts[workout.muscleGroup] || 0) + 1;
      }
    });
    
    return counts;
  }, [workouts]);
  
  const totalPRsSet = allPRs.length;

  // Get filtered workouts for selected period
  const filteredWorkouts = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    
    switch (selectedStatsPeriod) {
      case 'week': {
        const weekStart = new Date(now);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(weekStart.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'all':
      default:
        return workouts.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    return workouts
      .filter(w => {
        const wStartTime = w.startTime instanceof Date ? w.startTime : new Date(w.startTime);
        return wStartTime >= startDate && wStartTime <= endDate;
      })
      .sort((a, b) => {
        const aTime = a.startTime instanceof Date ? a.startTime.getTime() : new Date(a.startTime).getTime();
        const bTime = b.startTime instanceof Date ? b.startTime.getTime() : new Date(b.startTime).getTime();
        return bTime - aTime;
      });
  }, [workouts, selectedStatsPeriod]);

  // Helper function to check if workout has PRs (check if any PR was set on the same day)
  const getWorkoutPRs = useMemo(() => {
    return (workoutDate: Date) => {
      const workoutDateStr = workoutDate.toDateString();
      return allPRs.filter(pr => {
        const prDate = pr.date instanceof Date ? pr.date : new Date(pr.date);
        return prDate.toDateString() === workoutDateStr;
      });
    };
  }, [allPRs]);

  // Helper function to get friends for workout (mock data)
  const getWorkoutFriends = useMemo(() => {
    // Mock: 30% of workouts have friends
    return (workoutId: string) => {
      // Simple hash to consistently determine if workout has friends
      const hash = workoutId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      if (hash % 10 < 3) {
        return ['Jeff', 'Marie'];
      }
      return [];
    };
  }, []);

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

  const handleDeleteFeedItem = (itemId: string) => {
    Alert.alert(
      'Slet indlæg',
      'Er du sikker på, at du vil slette dette indlæg?',
      [
        {
          text: 'Annuller',
          style: 'cancel',
        },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => {
            deleteFeedItem(itemId);
          },
        },
      ],
    );
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
        return 'Venner & Lokal Centre';
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

  // PR Modal handlers
  const handleOpenPrModal = () => {
    setPrModalVisible(true);
    setPrStep('select');
    setSelectedPr(null);
    setPrWeight('');
    setPrVideoAttached(false);
  };

  const handleSelectPrOption = (option: PrOption) => {
    setSelectedPr(option);
    setPrStep('details');
  };

  const handlePrWeightChange = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, '');
    setPrWeight(numeric);
  };

  const handleAttachPrVideo = () => {
    setPrVideoAttached(true);
    Alert.alert('Video tilføjet', 'Din video er markeret som uploadet (maks 30 sek).');
  };

  const handleSubmitPr = () => {
    if (!selectedPr) {
      return;
    }
    if (!prWeight.trim()) {
      Alert.alert('Angiv vægt', 'Indtast vægten for din nye PR.');
      return;
    }
    if (!prVideoAttached) {
      Alert.alert('Tilføj video', 'Upload en video som bevis (maks 30 sek).');
      return;
    }
    Alert.alert('Stærkt!', `${prWeight.trim()} kg i ${selectedPr} sat!`);
    setPrModalVisible(false);
    // TODO: Actually save PR to store
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
          <View style={styles.profileHeaderInfo}>
            <View style={styles.profileHeaderTopRow}>
              <Text style={styles.displayName}>{user?.displayName}</Text>
              <TouchableOpacity
                style={styles.editProfileButton}
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.7}>
                <Icon name="brush-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.username}>@{user?.username}</Text>
            {/* Følgere/Følger/Venner Stats */}
            <View style={styles.profileStatsRow}>
              <TouchableOpacity style={styles.profileStatItem}>
                <Text style={styles.profileStatNumber}>0</Text>
                <Text style={styles.profileStatLabel}>Følgere</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileStatItem}>
                <Text style={styles.profileStatNumber}>0</Text>
                <Text style={styles.profileStatLabel}>Følger</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileStatItem}>
                <Text style={styles.profileStatNumber}>0</Text>
                <Text style={styles.profileStatLabel}>Venner</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Feed/PRs/Stats Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'feed' && styles.tabActive]}
            onPress={() => setActiveTab('feed')}
            activeOpacity={0.7}>
            <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>
              Feed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'prs' && styles.tabActive]}
            onPress={() => setActiveTab('prs')}
            activeOpacity={0.7}>
            <Text style={[styles.tabText, activeTab === 'prs' && styles.tabTextActive]}>
              PR's & Reps
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
            onPress={() => setActiveTab('stats')}
            activeOpacity={0.7}>
            <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
              Stats
            </Text>
          </TouchableOpacity>
        </View>

        {/* Feed Tab Content */}
        {activeTab === 'feed' && (
          <View style={styles.feedContainer}>
            {userFeedItems.length > 0 ? (
              <ScrollView>
                {userFeedItems.map(item => (
                  <View key={item.id} style={styles.profileFeedCard}>
                    <View style={styles.profileFeedCardHeader}>
                      <View style={styles.profileFeedAvatar}>
                        <Text style={styles.profileFeedAvatarText}>{item.user.charAt(0)}</Text>
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.profileFeedUser}>{item.user}</Text>
                        <Text style={styles.profileFeedTimestamp}>{item.timestamp}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeleteFeedItem(item.id)}
                        activeOpacity={0.7}>
                        <Icon name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                    {item.type === 'photo' && item.photoUri && (
                      <Image source={{uri: item.photoUri}} style={styles.profileFeedPhoto} />
                    )}
                    {item.type === 'summary' && (
                      <View style={styles.profileFeedSummaryRow}>
                        <View style={styles.profileFeedHighlightSecondary}>
                          {item.rating && item.rating >= 1 && item.rating <= 5 ? (
                            <Text style={styles.profileFeedRatingEmoji}>
                              {['☹️', '🙁', '😐', '😁', '🤩'][item.rating - 1]}
                            </Text>
                          ) : (
                            <Icon name="flash" size={16} color="#38BDF8" />
                          )}
                          <Text style={styles.profileFeedHighlightSecondaryText}>Session delt</Text>
                        </View>
                        {item.workoutInfo && (
                          <Text style={styles.profileFeedWorkoutInfo}>{item.workoutInfo}</Text>
                        )}
                      </View>
                    )}
                    {item.description && item.description.trim().length > 0 && (
                      <RenderTextWithMentions 
                        text={item.description} 
                        mentionedUsers={item.mentionedUsers}
                        navigation={navigation}
                      />
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyFeed}>
                <Icon name="images-outline" size={48} color="#C7C7CC" />
                <Text style={styles.emptyFeedText}>Ingen indlæg endnu</Text>
                <Text style={styles.emptyFeedSubtext}>
                  Del billeder og videoer fra dine træninger
                </Text>
              </View>
            )}
          </View>
        )}

        {/* PR's & Reps Tab Content */}
        {activeTab === 'prs' && (
          <View style={styles.prsContainer}>
            {/* PR's & Reps Sub-tabs */}
            <View style={styles.prsTabsHeader}>
              <View style={styles.prsTabsContainer}>
                <TouchableOpacity
                  style={[styles.prsTab, activePRTab === 'pr' && styles.prsTabActive]}
                  onPress={() => setActivePRTab('pr')}
                  activeOpacity={0.7}>
                  <Icon
                    name="trophy"
                    size={18}
                    color={activePRTab === 'pr' ? '#007AFF' : '#8E8E93'}
                  />
                  <Text
                    style={[
                      styles.prsTabText,
                      activePRTab === 'pr' && styles.prsTabTextActive,
                    ]}>
                    PR's
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.prsTab, activePRTab === 'reps' && styles.prsTabActive]}
                  onPress={() => setActivePRTab('reps')}
                  activeOpacity={0.7}>
                  <Icon
                    name="barbell"
                    size={18}
                    color={activePRTab === 'reps' ? '#007AFF' : '#8E8E93'}
                  />
                  <Text
                    style={[
                      styles.prsTabText,
                      activePRTab === 'reps' && styles.prsTabTextActive,
                    ]}>
                    Reps
                  </Text>
                </TouchableOpacity>
              </View>
              {activePRTab === 'pr' && (
                <TouchableOpacity
                  style={styles.prAddButton}
                  onPress={handleOpenPrModal}
                  activeOpacity={0.7}>
                  <Icon name="add-circle" size={28} color="#007AFF" />
                </TouchableOpacity>
              )}
            </View>

            {/* PR's Content */}
            {activePRTab === 'pr' ? (
              allPRs.length > 0 ? (
                <View>
                  {allPRs.map((pr: PersonalRecord) => (
                    <View key={pr.id} style={styles.prsCard}>
                      <Text style={styles.prsExerciseName}>{pr.exercise}</Text>
                      <View style={styles.prsWeightContainer}>
                        <Text style={styles.prsWeightValue}>{pr.weight}</Text>
                        <Text style={styles.prsWeightUnit}>kg</Text>
                      </View>
                      {pr.videoUrl ? (
                        <TouchableOpacity
                          style={styles.prsVideoContainer}
                          onPress={() => {
                            Alert.alert('Video', 'Video afspiller åbnes her');
                          }}
                          activeOpacity={0.8}>
                          <View style={styles.prsVideoThumbnail}>
                            <Icon name="play-circle" size={40} color="#007AFF" />
                            <Text style={styles.prsVideoText}>Se video</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.prsNoVideoContainer}>
                          <Icon name="videocam-off-outline" size={24} color="#8E8E93" />
                          <Text style={styles.prsNoVideoText}>Ingen video</Text>
                        </View>
                      )}
                      <Text style={styles.prsDateText}>
                        Sat {new Date(pr.date instanceof Date ? pr.date : new Date(pr.date)).toLocaleDateString('da-DK', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.prsEmptyContainer}>
                  <Icon name="trophy-outline" size={64} color="#C7C7CC" />
                  <Text style={styles.prsEmptyTitle}>Ingen PR's endnu</Text>
                  <Text style={styles.prsEmptyText}>
                    Du har ikke sat nogen personlige rekorder endnu.
                  </Text>
                </View>
              )
            ) : allRepRecords.length > 0 ? (
              <View>
                {allRepRecords.map((rep: RepRecord) => (
                  <View key={rep.id} style={styles.prsCard}>
                    <Text style={styles.prsExerciseName}>{rep.exercise}</Text>
                    <View style={styles.prsWeightContainer}>
                      <Text style={styles.prsWeightValue}>{rep.weight}</Text>
                      <Text style={styles.prsWeightUnit}>kg</Text>
                    </View>
                    <Text style={styles.prsDateText}>
                      Opdateret {new Date(rep.date instanceof Date ? rep.date : new Date(rep.date)).toLocaleDateString('da-DK', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.prsEmptyContainer}>
                <Icon name="barbell-outline" size={64} color="#C7C7CC" />
                <Text style={styles.prsEmptyTitle}>Ingen Reps registreret</Text>
                <Text style={styles.prsEmptyText}>
                  Du har ikke registreret nogen rep records endnu.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Stats Tab Content */}
        {activeTab === 'stats' && (
          <View>
            {/* Stats Container */}
            <View style={styles.statsContainer}>
              {/* Workouts List Button - Moved to top */}
              <View style={styles.workoutsListButtonContainer}>
                <TouchableOpacity
                  style={styles.workoutsListButton}
                  onPress={() => setShowWorkoutsInStats(!showWorkoutsInStats)}
                  activeOpacity={0.7}>
                  <Text style={styles.bicepsEmojiIcon}>
                    {user?.bicepsEmoji || '💪🏻'}
                  </Text>
                  <Text style={styles.workoutsListButtonText}>Seneste Træninger</Text>
                  <Text style={styles.workoutsListButtonCount}>
                    ({filteredWorkouts.length})
                  </Text>
                  <Icon 
                    name={showWorkoutsInStats ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color="#007AFF" 
                    style={{marginLeft: 'auto'}} 
                  />
                </TouchableOpacity>
              </View>
              
              {/* Workouts List - Shown when button is clicked */}
              {showWorkoutsInStats && (
                <View style={styles.workoutsListContainer}>
                  {filteredWorkouts.length > 0 ? (
                    filteredWorkouts.map(workout => {
                      const workoutPRs = getWorkoutPRs(workout.startTime instanceof Date ? workout.startTime : new Date(workout.startTime));
                      const workoutFriends = getWorkoutFriends(workout.id);
                      return (
                        <View key={workout.id} style={styles.workoutCard}>
                          <View style={styles.workoutCardHeader}>
                            <View style={styles.workoutCardHeaderLeft}>
                              <Icon name="fitness" size={24} color="#007AFF" />
                              <View style={styles.workoutCardHeaderInfo}>
                                <Text style={styles.workoutCardDate}>
                                  {workout.startTime instanceof Date 
                                    ? workout.startTime.toLocaleDateString('da-DK', { 
                                        weekday: 'long', 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                      })
                                    : new Date(workout.startTime).toLocaleDateString('da-DK', { 
                                        weekday: 'long', 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                      })
                                  }
                                </Text>
                                <Text style={styles.workoutCardTime}>
                                  {formatTotalTime(workout.duration)}
                                </Text>
                              </View>
                            </View>
                            {workoutPRs.length > 0 && (
                              <View style={styles.workoutPRBadge}>
                                <Icon name="trophy" size={16} color="#FFD700" />
                                <Text style={styles.workoutPRBadgeText}>{workoutPRs.length}</Text>
                              </View>
                            )}
                          </View>
                          {workout.muscleGroup && (
                            <Text style={styles.workoutCardMuscleGroup}>{workout.muscleGroup}</Text>
                          )}
                          {workoutFriends.length > 0 && (
                            <View style={styles.workoutCardFriends}>
                              <Icon name="people" size={16} color="#34C759" />
                              <Text style={styles.workoutCardFriendsText}>
                                Trænet med {workoutFriends.join(', ')}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyWorkouts}>
                      <Icon name="fitness-outline" size={48} color="#C7C7CC" />
                      <Text style={styles.emptyWorkoutsText}>Ingen træninger endnu</Text>
                    </View>
                  )}
                </View>
              )}
              
              {/* Period Selection Buttons */}
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
                    styles.statsPeriodButtonLast,
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

              {/* Combined Stats - Check-ins and Time */}
              <View style={styles.additionalStatItem}>
                <Icon name="checkmark-circle-outline" size={20} color="#007AFF" style={styles.statIcon} />
                <View style={styles.additionalStatContent}>
                  <Text style={styles.additionalStatLabel}>Check-ins</Text>
                  <Text style={styles.additionalStatValue}>{checkInsForPeriod}</Text>
                </View>
                </View>

              <View style={styles.additionalStatItem}>
                <Icon name="people-outline" size={20} color="#007AFF" style={styles.statIcon} />
                <View style={styles.additionalStatContent}>
                  <Text style={styles.additionalStatLabel}>Check-ins med venner</Text>
                  <Text style={styles.additionalStatValue}>{workoutsWithFriendsForPeriod}</Text>
              </View>
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

              <View style={styles.additionalStatItem}>
                <Icon name="people-outline" size={20} color="#007AFF" style={styles.statIcon} />
                <View style={styles.additionalStatContent}>
                  <Text style={styles.additionalStatLabel}>Tid trænet med venner</Text>
                  <Text style={styles.additionalStatValue}>
                    {formatTotalTime(workoutTimeWithFriendsForPeriod)}
                  </Text>
                </View>
              </View>

              {/* Most Trained Muscle Group */}
              {mostTrainedMuscleGroup && (
                <View style={styles.additionalStatItem}>
                  <Icon name="fitness-outline" size={20} color="#007AFF" style={styles.statIcon} />
                  <View style={styles.additionalStatContent}>
                    <Text style={styles.additionalStatLabel}>Oftest trænet</Text>
                    <Text style={styles.additionalStatValue}>{mostTrainedMuscleGroup}</Text>
                  </View>
                </View>
              )}

              {/* Most Frequent Gym */}
              {mostFrequentGym && (
                <View style={styles.additionalStatItem}>
                  <Icon name="location-outline" size={20} color="#007AFF" style={styles.statIcon} />
                  <View style={styles.additionalStatContent}>
                    <Text style={styles.additionalStatLabel}>Oftest center trænet i</Text>
                    <Text style={styles.additionalStatValue}>{mostFrequentGym.name}</Text>
                    <Text style={styles.additionalStatSubtext}>
                      {mostFrequentGym.checkins} check-ins • {formatTotalTime(mostFrequentGym.time)} tid
                    </Text>
                  </View>
                </View>
              )}

              {/* PR's Beaten */}
              <View style={[styles.additionalStatItem, styles.additionalStatItemLast]}>
                <Icon name="trophy-outline" size={20} color="#007AFF" style={styles.statIcon} />
                <View style={styles.additionalStatContent}>
                  <Text style={styles.additionalStatLabel}>PR's slået</Text>
                  <Text style={styles.additionalStatValue}>{totalPRsSet}</Text>
                </View>
              </View>
            </View>

            {/* This Week Section */}
            <ThisWeekSection />

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

            {/* Privacy Settings */}
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
                      Venner & Lokal Centre
                    </Text>
                    {user?.privacySettings.profileVisibility === 'friends_and_gyms' && (
                      <Icon name="checkmark" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
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
                      user?.privacySettings.profileVisibility === 'private' && styles.visibilityOptionSelected,
                    ]}
                    onPress={() => handleProfileVisibilityChange('private')}
                    activeOpacity={0.7}>
                    <Text
                      style={[
                        styles.visibilityOptionText,
                        user?.privacySettings.profileVisibility === 'private' && styles.visibilityOptionTextSelected,
                      ]}>
                      Privat
                    </Text>
                    {user?.privacySettings.profileVisibility === 'private' && (
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
          </View>
        )}

        {/* Workouts Tab Content - Removed, now shown in Stats tab */}
        {false && activeTab === 'workouts' && (
          <View>
            {/* Period Selection for Workouts */}
            <View style={styles.statsContainer}>
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
                    styles.statsPeriodButtonLast,
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
            </View>

            {/* Workouts List */}
            <View style={styles.workoutsListContainer}>
              {filteredWorkouts.length > 0 ? (
                filteredWorkouts.map((workout) => {
                    const workoutDate = workout.startTime instanceof Date
                      ? workout.startTime
                      : new Date(workout.startTime);
                    const workoutPRs = getWorkoutPRs(workoutDate);
                    const workoutFriends = getWorkoutFriends(workout.id);
                    const gym = workout.gymId
                      ? danishGyms.find(g => g.id === workout.gymId)
                      : null;

                    return (
                      <View key={workout.id} style={styles.workoutCard}>
                        <View style={styles.workoutCardHeader}>
                          <View style={styles.workoutCardHeaderLeft}>
                            <Text style={styles.workoutCardDate}>
                              {workoutDate.toLocaleDateString('da-DK', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </Text>
                            <Text style={styles.workoutCardTime}>
                              {workoutDate.toLocaleTimeString('da-DK', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </View>
                          {workoutPRs.length > 0 && (
                            <View style={styles.workoutPRBadge}>
                              <Icon name="trophy" size={16} color="#FFD700" />
                              <Text style={styles.workoutPRBadgeText}>
                                {workoutPRs.length} PR{workoutPRs.length > 1 ? "'er" : ''}
                              </Text>
                            </View>
                          )}
                        </View>

                        {workout.muscleGroup && (
                          <View style={styles.workoutCardInfo}>
                            <Icon name="fitness-outline" size={16} color="#8E8E93" />
                            <Text style={styles.workoutCardInfoText}>
                              {workout.muscleGroup}
                            </Text>
                          </View>
                        )}

                        {workoutFriends.length > 0 && (
                          <View style={styles.workoutCardInfo}>
                            <Icon name="people-outline" size={16} color="#8E8E93" />
                            <Text style={styles.workoutCardInfoText}>
                              Med {workoutFriends.join(', ')}
                            </Text>
                          </View>
                        )}

                        <View style={styles.workoutCardInfo}>
                          <Icon name="time-outline" size={16} color="#8E8E93" />
                          <Text style={styles.workoutCardInfoText}>
                            {formatTotalTime(workout.duration)}
                          </Text>
                        </View>

                        <View style={styles.workoutCardInfo}>
                          <Icon name="location-outline" size={16} color="#8E8E93" />
                          <Text style={styles.workoutCardInfoText}>
                            {gym ? `${gym.name}${gym.city ? `, ${gym.city}` : ''}` : 'Ukendt center'}
                          </Text>
                        </View>

                        {workoutPRs.length > 0 && (
                          <View style={styles.workoutPRsList}>
                            {workoutPRs.map((pr) => (
                              <View key={pr.id} style={styles.workoutPRItem}>
                                <Icon name="trophy" size={14} color="#FFD700" />
                                <Text style={styles.workoutPRItemText}>
                                  {pr.exercise}: {pr.weight} kg
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.workoutsEmptyContainer}>
                    <Icon name="fitness-outline" size={48} color="#C7C7CC" />
                    <Text style={styles.workoutsEmptyText}>Ingen træninger i denne periode</Text>
                  </View>
                )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* PR Modal */}
      <Modal visible={prModalVisible} transparent animationType="fade">
        <View style={styles.prModalOverlay}>
          <View style={styles.prModalCard}>
            {prStep === 'select' && (
              <>
                <Text style={styles.prModalTitle}>Hvilken PR vil du sætte?</Text>
                <Text style={styles.prModalText}>Vælg øvelsen herunder</Text>
                {PR_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.prOptionButton}
                    onPress={() => handleSelectPrOption(option)}
                    activeOpacity={0.85}>
                    <Text style={styles.prOptionText}>{option}</Text>
                    <Icon name="chevron-forward" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.prModalClose} onPress={() => setPrModalVisible(false)}>
                  <Text style={styles.prModalCloseText}>Luk</Text>
                </TouchableOpacity>
              </>
            )}
            {prStep === 'details' && selectedPr && (
              <>
                <Text style={styles.prModalTitle}>{selectedPr}</Text>
                <Text style={styles.prModalText}>Angiv vægt og upload en video (maks 30 sek)</Text>
                <Text style={styles.prSectionLabel}>Vægt (kg)</Text>
                <TextInput
                  style={styles.prInput}
                  keyboardType="numeric"
                  placeholder="Fx 120"
                  placeholderTextColor="#94A3B8"
                  value={prWeight}
                  onChangeText={handlePrWeightChange}
                />
                <Text style={styles.prSectionLabel}>Bevis</Text>
                <TouchableOpacity
                  style={[
                    styles.prVideoButton,
                    prVideoAttached && styles.prVideoButtonAttached,
                  ]}
                  onPress={handleAttachPrVideo}
                  activeOpacity={0.85}>
                  <Icon
                    name={prVideoAttached ? 'checkmark-circle' : 'cloud-upload-outline'}
                    size={20}
                    color={prVideoAttached ? '#22C55E' : '#0F172A'}
                    style={{marginRight: 8}}
                  />
                  <Text
                    style={[
                      styles.prVideoButtonText,
                      prVideoAttached && styles.prVideoButtonTextAttached,
                    ]}>
                    {prVideoAttached ? 'Video tilføjet (maks 30 sek)' : 'Upload video'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.prSubmitButton,
                    (!prWeight.trim() || !prVideoAttached) && styles.prSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitPr}
                  disabled={!prWeight.trim() || !prVideoAttached}>
                  <Text style={styles.prSubmitButtonText}>Del PR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.prModalClose}
                  onPress={() => setPrModalVisible(false)}>
                  <Text style={styles.prModalCloseText}>Fortryd</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeaderInfo: {
    width: '100%',
    alignItems: 'center',
  },
  profileHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  editProfileButton: {
    marginLeft: 12,
    padding: 4,
  },
  username: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  profileStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  profileStatItem: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  profileStatNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  profileStatLabel: {
    fontSize: 14,
    color: '#666',
  },
  statsContainer: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statsPeriodButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statsPeriodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statsPeriodButtonLast: {
    marginRight: 0,
  },
  statsPeriodButtonActive: {
    backgroundColor: colors.secondary,
  },
  statsPeriodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
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
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
  },
  additionalStatsContainer: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: colors.primary,
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
    color: colors.textMuted,
    marginBottom: 4,
  },
  additionalStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  additionalStatSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  workoutsListButtonContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  workoutsListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'center',
  },
  bicepsEmojiIcon: {
    fontSize: 20,
  },
  workoutsListButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  workoutsListButtonCount: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 4,
  },
  workoutsListContainer: {
    marginBottom: 16,
  },
  workoutCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  workoutCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  workoutCardHeaderLeft: {
    flex: 1,
  },
  workoutCardDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  workoutCardTime: {
    fontSize: 14,
    color: '#8E8E93',
  },
  workoutCardMuscleGroup: {
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '500',
  },
  workoutCardFriends: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  workoutCardFriendsText: {
    fontSize: 14,
    color: '#34C759',
    marginLeft: 6,
    fontWeight: '500',
  },
  emptyWorkouts: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  emptyWorkoutsText: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 12,
    textAlign: 'center',
  },
  workoutPRBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  workoutPRBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8860B',
    marginLeft: 4,
  },
  workoutCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  workoutCardInfoText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
  },
  workoutPRsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
  },
  workoutPRItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  workoutPRItemText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  workoutsEmptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  workoutsEmptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
    textAlign: 'center',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
    color: colors.secondary,
    fontWeight: '600',
    marginLeft: 4,
  },
  favoriteGymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  favoriteGymLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary,
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
    color: colors.text,
    marginBottom: 2,
  },
  favoriteGymLocation: {
    fontSize: 14,
    color: colors.textMuted,
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
    color: colors.textMuted,
    textAlign: 'center',
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addGoalButtonText: {
    fontSize: 16,
    color: colors.secondary,
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
    color: colors.textMuted,
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
    color: colors.text,
    fontWeight: '500',
  },
  privacyValue: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  visibilityOptions: {
    marginLeft: 32,
    marginBottom: 12,
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary,
  },
  visibilityOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  visibilityOptionTextSelected: {
    color: colors.secondary,
    fontWeight: '600',
  },
  thisWeekSection: {
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
    color: colors.text,
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
    color: colors.text,
    marginBottom: 4,
  },
  thisWeekStatLabel: {
    fontSize: 12,
    color: colors.textMuted,
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
    backgroundColor: colors.secondary,
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
    color: colors.textMuted,
    marginTop: 8,
  },
  prRepsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    marginBottom: 16,
    padding: 4,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.secondary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: '#fff',
  },
  feedContainer: {
    marginBottom: 16,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -2,
  },
  mediaItem: {
    width: (Dimensions.get('window').width - 48) / 3,
    aspectRatio: 1,
    marginBottom: 2,
    marginRight: 2,
    backgroundColor: '#E5E5EA',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5EA',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPlayIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{translateX: -12}, {translateY: -12}],
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileFeedCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  profileFeedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileFeedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileFeedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  profileFeedUser: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  profileFeedTimestamp: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  profileFeedPhoto: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  profileFeedSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  profileFeedHighlightSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  profileFeedHighlightSecondaryText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  profileFeedRatingEmoji: {
    fontSize: 16,
  },
  profileFeedMention: {
    color: colors.primary,
    fontWeight: '600',
  },
  profileFeedWorkoutInfo: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  profileFeedDescription: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
  },
  emptyFeed: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyFeedText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 4,
  },
  emptyFeedSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  prsContainer: {
    marginBottom: 16,
  },
  prsTabsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  prsTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 4,
    flex: 1,
    marginRight: 12,
  },
  prAddButton: {
    padding: 4,
  },
  prsTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  prsTabActive: {
    backgroundColor: colors.backgroundCard,
  },
  prsTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 6,
  },
  prsTabTextActive: {
    color: colors.secondary,
  },
  prsCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  prsExerciseName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  prsWeightContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  prsWeightValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  prsWeightUnit: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.secondary,
    marginLeft: 8,
  },
  prsVideoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  prsVideoThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  prsVideoText: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 6,
    fontWeight: '600',
  },
  prsNoVideoContainer: {
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
  },
  prsNoVideoText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  prsDateText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  prsEmptyContainer: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  prsEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  prsEmptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  prModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 24,
  },
  prModalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'stretch',
  },
  prModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  prModalText: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
  },
  prOptionButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  prOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  prSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475467',
    marginTop: 12,
    marginBottom: 6,
  },
  prInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 16,
  },
  prVideoButton: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  prVideoButtonAttached: {
    borderColor: '#22C55E',
    backgroundColor: '#ECFDF5',
  },
  prVideoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  prVideoButtonTextAttached: {
    color: '#15803D',
  },
  prSubmitButton: {
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  prSubmitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  prSubmitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  prModalClose: {
    marginTop: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  prModalCloseText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
});

export default ProfileScreen;

