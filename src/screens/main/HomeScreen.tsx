/**
 * Home Screen
 * Main feed and workout check-ins
 */

import React, {Fragment, useEffect, useMemo, useRef, useState, useCallback, memo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  Alert,
  Keyboard,
  Platform,
  LayoutAnimation,
  TouchableWithoutFeedback,
  TextInput,
  Animated,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Reanimated, {useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing as ReanimatedEasing} from 'react-native-reanimated';
import Video from 'react-native-video';
import {useAuth} from '@/hooks/useAuth';
import {useNavigation, useFocusEffect, useIsFocused} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import NotificationService from '@/services/notifications/NotificationService';
import {useFeedStore, FeedItem} from '@/store/feedStore';
import {
  refreshWorkoutFeedFromServerForHome,
  subscribeWorkoutFeedRealtimeForHome,
} from '@/services/supabase/workoutPostService';
import MuscleGroupTileIcon from '@/components/ui/MuscleGroupTileIcon';
import {MuscleGroup} from '@/types/workout.types';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useGymlyActiveNow} from '@/hooks/useGymlyActiveNow';
import {Card} from '@/components/ui/Card';
import {StatCard} from '@/components/ui/StatCard';
import {DashboardSection} from '@/components/dashboard';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useChatStore} from '@/store/chatStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import {UserAvatar} from '@/components/ui/UserAvatar';
import UserProfileModal from '@/components/checkin/UserProfileModal';
import type {ActiveUser} from '@/components/checkin/ActiveUsersList';
import GymLogoView from '@/components/ui/GymLogoView';
import {
  coerceMuscleGroup,
  formatWorkoutTypeDisplay,
} from '@/utils/muscleGroupLabels';
import {formatDurationIgang} from '@/utils/activeSessionFormat';
import {sortActiveNowFriendRows} from '@/utils/sortActiveUsersForDisplay';
import {useUserTrainingStats} from '@/hooks/useUserTrainingStats';
import {useBadgeStore} from '@/store/badgeStore';
import * as streak from '@/utils/streakUtils';
import {useLocalCentersActivity} from '@/hooks/useLocalCentersActivity';
import type {LocalCenterActivity} from '@/services/supabase/localCentersActivityService';
import {findGymById} from '@/utils/gymDisplay';
import {
  fetchPostBicepsStates,
  fetchPostBicepsUsers,
  subscribePostBicepsRealtime,
  togglePostBicepsReaction,
  type PostBicepsUser,
} from '@/services/supabase/workoutReactionService';
import {
  getUserStatsMap,
  subscribeUserStats,
  type UserStats,
} from '@/services/supabase/userStatsService';

type HomeScreenNavigationProp = StackNavigationProp<any>;

/** Home layout rhythm — 20px screen gutters, 24px between sections */
const HOME_H_PADDING = 20;
const SECTION_GAP = 24;

const FRIENDS: Array<{id: string; name: string}> = [];
const MOST_FREQUENT_FRIENDS: Array<{id: string; name: string; lastMessage?: string}> = [];

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
    <Text style={styles.feedDescription}>
      {parts.map((part, index) => {
        if (part.isMention && part.userId) {
          return (
            <Text
              key={index}
              style={styles.feedMention}
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

const RenderCaptionWithMentions = ({
  text,
  mentionedUsers,
  navigation,
  username,
  onPressUsername,
}: {
  text: string;
  mentionedUsers?: string[];
  navigation: any;
  username: string;
  onPressUsername: () => void;
}) => {
  const parts: Array<{text: string; isMention: boolean; userId?: string}> = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({text: text.substring(lastIndex, match.index), isMention: false});
    }
    const mentionedName = match[1];
    const friend = FRIENDS.find(f => f.name === mentionedName);
    const userId = friend?.id || (mentionedUsers && mentionedUsers.length > 0 ? mentionedUsers[0] : undefined);
    parts.push({
      text: `@${mentionedName}`,
      isMention: true,
      userId,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({text: text.substring(lastIndex), isMention: false});
  }

  return (
    <Text style={styles.feedDescription}>
      <Text style={styles.feedCaptionUser} onPress={onPressUsername}>
        {username}
      </Text>
      <Text> </Text>
      {parts.map((part, index) => {
        if (part.isMention && part.userId) {
          return (
            <Text
              key={index}
              style={styles.feedMention}
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

type FeedPhotoProps = {
  item: FeedItem;
  onDoubleTapLike: (itemId: string, x: number, y: number) => void;
  onLayoutMeasured?: (itemId: string, layout: {x: number; y: number; width: number; height: number}) => void;
  userBicepsEmoji: string;
};

const FeedPhoto = memo(
  ({item, onDoubleTapLike, onLayoutMeasured, userBicepsEmoji}: FeedPhotoProps) => {
    if (!item.photoUri) {
      const workoutParts = (item.workoutInfo ?? '')
        .split('·')
        .map(part => part.trim())
        .filter(Boolean);
      const centerText = workoutParts[0] ?? 'Gymly center';
      const durationText = workoutParts[1] ?? 'Session';
      const workoutText = workoutParts[2] ?? 'Træning';
      return (
        <View style={styles.feedNoImageCard}>
          <Text style={styles.feedNoImageEyebrow}>🔥 SESSION DELT</Text>
          <Text style={styles.feedNoImageDuration}>{durationText.toUpperCase()}</Text>
          <Text style={styles.feedNoImageWorkout}>{workoutText}</Text>
          <Text style={styles.feedNoImageCenter} numberOfLines={1}>
            {centerText}
          </Text>
        </View>
      );
    }

    const [aspectRatio, setAspectRatio] = useState<number | null>(null);
    const [photoLayout, setPhotoLayout] = useState({width: 0, height: 0});

    useEffect(() => {
      if (!item.photoUri) {
        return;
      }
      let isMounted = true;
      Image.getSize(
        item.photoUri,
        (width, height) => {
          if (isMounted && width > 0 && height > 0) {
            setAspectRatio(width / height);
          }
        },
        () => {
          if (isMounted) {
            setAspectRatio(null);
          }
        },
      );
      return () => {
        isMounted = false;
      };
    }, [item.photoUri]);

    const scale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);

    const pinch = Gesture.Pinch()
      .onUpdate(event => {
        const nextScale = Math.min(3, Math.max(1, event.scale));
        scale.value = nextScale;
      })
      .onEnd(() => {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      });

    const pan = Gesture.Pan()
      .minPointers(2)
      .onStart(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate(event => {
        if (scale.value > 1) {
          translateX.value = startX.value + event.translationX;
          translateY.value = startY.value + event.translationY;
        }
      })
      .onEnd(() => {
        if (scale.value <= 1) {
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
        }
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .maxDistance(10)
      .onEnd(event => {
        runOnJS(onDoubleTapLike)(item.id, event.x, event.y);
      });

    const gesture = Gesture.Simultaneous(doubleTap, pinch, pan);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        {translateX: translateX.value},
        {translateY: translateY.value},
        {scale: scale.value},
      ],
    }));


    return (
      <GestureDetector gesture={gesture}>
        <View
          style={[styles.feedPhotoContainer, aspectRatio ? {aspectRatio} : null]}
          onLayout={event => {
            const {width, height} = event.nativeEvent.layout;
            onLayoutMeasured?.(item.id, event.nativeEvent.layout);
            if (width !== photoLayout.width || height !== photoLayout.height) {
              setPhotoLayout({width, height});
            }
          }}>
          <View style={styles.feedPhotoMask}>
            <Reanimated.View style={[styles.feedPhotoTransform, animatedStyle]}>
              <Image
                source={{uri: item.photoUri}}
                style={styles.feedPhoto}
                resizeMode="cover"
              />
            </Reanimated.View>
          </View>
          {item.rating && item.rating >= 1 && item.rating <= 5 && (
            <View style={styles.feedPhotoRating}>
              <Text style={styles.feedRatingEmoji}>
                {['☹️', '🙁', '😐', '😁', '🤩'][item.rating - 1]}
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.photoUri === next.item.photoUri &&
      prev.item.rating === next.item.rating &&
      prev.userBicepsEmoji === next.userBicepsEmoji
    );
  },
);


const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const isHomeFocused = useIsFocused();
  const user = useAuth();
  const insets = useSafeAreaInsets();
  const {
    totalActiveUsers,
    activeFriends: activeFriendsNow,
    currentUserActive: currentUserActiveNow,
    refresh: refreshGymlyActiveNow,
    durationNow,
  } = useGymlyActiveNow(user?.id);
  const currentUser = useAppStore(s => s.user);
  const friendIds = useFriendStore(s => s.friendIds);
  const loadFriendStore = useFriendStore(s => s.load);

  useEffect(() => {
    if (user?.id) {
      void loadFriendStore(user.id);
    }
  }, [user?.id, loadFriendStore]);

  const socialActiveNowList = useMemo(() => {
    const combined = [
      ...(currentUserActiveNow ? [currentUserActiveNow] : []),
      ...activeFriendsNow,
    ];
    return sortActiveNowFriendRows(combined, user?.id, friendIds);
  }, [currentUserActiveNow, activeFriendsNow, user?.id, friendIds]);
  const {
    localCenters,
    hasLocalCenters,
    loading: localCentersLoading,
  } = useLocalCentersActivity(user?.id);
  const getChatByParticipants = useChatStore(s => s.getChatByParticipants);
  const upsertChat = useChatStore(s => s.upsertChat);

  const openDmToFriend = useCallback(
    async (friendId: string, friendName: string) => {
      if (!currentUser?.id) {
        return;
      }
      const participantIds = [currentUser.id, friendId].sort();
      const nameById: Record<string, string> = {
        [currentUser.id]: currentUser.displayName || 'Dig',
        [friendId]: friendName,
      };
      const participantNames = participantIds.map(id => nameById[id] ?? 'Ven');
      const existingChat = getChatByParticipants(participantIds);
      try {
        const threadId = await getOrCreateDmThread(friendId);
        upsertChat({
          id: threadId,
          participantIds,
          participantNames,
          lastActivity: existingChat?.lastActivity ?? new Date(),
          unreadCount: existingChat?.unreadCount ?? 0,
          avatar: existingChat?.avatar,
          avatarInitials: existingChat?.avatarInitials,
        });
        navigation.navigate('Chat', {
          chatId: threadId,
          friendId,
          friendName,
          participants: [{id: friendId, name: friendName}],
        });
      } catch (e) {
        Alert.alert('Besked', (e as Error).message);
      }
    },
    [currentUser, getChatByParticipants, navigation, upsertChat],
  );
  const trainingStats = useUserTrainingStats(user?.id);
  const dashboardStreak = trainingStats.currentStreakDays;
  const dashboardWeeklyCheckins = trainingStats.totalCheckIns;
  const dashboardWeeklyMinutes = trainingStats.totalTrainingMinutes;
  const badgeUnlocks = useBadgeStore(s => s.unlockedByUser[user?.id ?? '']);
  const badgeCount =
    trainingStats.unlockedBadgesCount ||
    (badgeUnlocks ? Object.keys(badgeUnlocks).length : 0);
  const streakDisplayValue = useMemo(() => {
    const icon = streak.getStreakIcon(dashboardStreak);
    return icon ? `${icon} ${dashboardStreak}` : String(dashboardStreak);
  }, [dashboardStreak]);
  useEffect(() => {
    if (__DEV__) {
      console.log('[HomeScreen] stats read', {dashboardStreak, dashboardWeeklyCheckins, dashboardWeeklyMinutes});
    }
  }, [dashboardStreak, dashboardWeeklyCheckins, dashboardWeeklyMinutes]);
  const safeAreaBottom = insets?.bottom ?? 0;
  const {feedItems, deleteFeedItem} = useFeedStore();
  const userBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  const [addedFriends, setAddedFriends] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [feedReactions, setFeedReactions] = useState<Record<string, {liked: boolean; likes: number}>>({});
  const [authorStatsByUserId, setAuthorStatsByUserId] = useState<Record<string, UserStats>>({});
  const [bicepsBusyByPost, setBicepsBusyByPost] = useState<Record<string, boolean>>({});
  const [selectedActiveNowUser, setSelectedActiveNowUser] = useState<ActiveUser | null>(null);
  const [bicepsListVisible, setBicepsListVisible] = useState(false);
  const [bicepsListLoading, setBicepsListLoading] = useState(false);
  const [bicepsListUsers, setBicepsListUsers] = useState<PostBicepsUser[]>([]);
  const [bicepsListPostId, setBicepsListPostId] = useState<string | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentsByFeedItem, setCommentsByFeedItem] = useState<
    Record<string, Array<{author: string; text: string; id: string}>>
  >({});
  const [commentLikes, setCommentLikes] = useState<
    Record<string, Record<string, {liked: boolean; likes: number}>>
  >({});
  const [commentedItems, setCommentedItems] = useState<string[]>([]);
  const [commentInputFocused, setCommentInputFocused] = useState(false);
  const [animatingItems, setAnimatingItems] = useState<Record<string, boolean>>({});
  const activeNowPulseScale = useRef(new Animated.Value(1)).current;
  const activeNowPulseOpacity = useRef(new Animated.Value(0.6)).current;
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<any>(null);
  const [reelsModalVisible, setReelsModalVisible] = useState(false);
  const [reelsCurrentIndex, setReelsCurrentIndex] = useState(0);
  const [reelsItems, setReelsItems] = useState<FeedItem[]>([]);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [playingFeedVideos, setPlayingFeedVideos] = useState<Set<string>>(new Set());
  const [reelsCommentVisible, setReelsCommentVisible] = useState(false);
  const [reelsShareVisible, setReelsShareVisible] = useState(false);
  const [reelsShareSearch, setReelsShareSearch] = useState('');
  const [reelsShareSelections, setReelsShareSelections] = useState<Record<string, boolean>>({});
  const [reelsShareSearchFocused, setReelsShareSearchFocused] = useState(false);
  const [reelsShareKeyboardHeight, setReelsShareKeyboardHeight] = useState(0);
  const reelsScrollViewRef = useRef<ScrollView>(null);
  const reelsVideoRefs = useRef<Record<string, any>>({});
  const feedVideoRefs = useRef<Record<string, any>>({});
  const scrollViewRef = useRef<ScrollView>(null);
  const feedVideoLayouts = useRef<Record<string, {y: number; height: number}>>({});
  const scrollY = useRef(0);
  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reelsTranslateX = useSharedValue(0);
  const reelsOpacity = useSharedValue(1);
  const reelsHeartAnimations = useRef<Record<string, {x: number; y: number; opacity: Animated.Value; scale: Animated.Value}>>({});
  const overlayAnimations = useRef<
    Record<
      string,
      {
        opacity: Animated.Value;
        scale: Animated.Value;
        translateX: Animated.Value;
        translateY: Animated.Value;
      }
    >
  >({});
  const feedCardLayouts = useRef<
    Record<string, {width: number; height: number; y: number}>
  >({});
  const feedActionsLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const likeButtonLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const feedPhotoLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    return subscribeWorkoutFeedRealtimeForHome(user.id);
  }, [user?.id]);

  useEffect(() => {
    const uid = user?.id;
    const postIds = feedItems.map(item => item.id);
    if (!uid || postIds.length === 0) {
      setFeedReactions({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const states = await fetchPostBicepsStates(postIds, uid);
        if (cancelled) {
          return;
        }
        setFeedReactions(prev => {
          const next: Record<string, {liked: boolean; likes: number}> = {};
          for (const id of postIds) {
            const state = states[id];
            next[id] = {
              liked: state?.reactedByMe ?? false,
              likes: state?.count ?? 0,
            };
          }
          for (const [id, value] of Object.entries(prev)) {
            if (!next[id]) {
              next[id] = value;
            }
          }
          return next;
        });
      } catch {
        // ignore temporary reaction fetch errors
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [feedItems, user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      return;
    }
    return subscribePostBicepsRealtime(postId => {
      if (!feedItems.some(item => item.id === postId)) {
        return;
      }
      void (async () => {
        try {
          const states = await fetchPostBicepsStates([postId], uid);
          const state = states[postId];
          if (!state) {
            return;
          }
          setFeedReactions(prev => ({
            ...prev,
            [postId]: {liked: state.reactedByMe, likes: state.count},
          }));
          if (bicepsListVisible && bicepsListPostId === postId) {
            const users = await fetchPostBicepsUsers(postId);
            setBicepsListUsers(users);
          }
        } catch {
          // ignore transient realtime update errors
        }
      })();
    });
  }, [user?.id, feedItems, bicepsListVisible, bicepsListPostId]);

  useEffect(() => {
    const authorIds = [...new Set(feedItems.map(item => item.userId).filter(Boolean) as string[])];
    if (authorIds.length === 0) {
      setAuthorStatsByUserId({});
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const next = await getUserStatsMap(authorIds);
        if (mounted) {
          setAuthorStatsByUserId(next);
        }
      } catch {
        if (mounted) {
          setAuthorStatsByUserId({});
        }
      }
    };
    void load();
    const unsubs = authorIds.map(id => subscribeUserStats(id, () => void load()));
    return () => {
      mounted = false;
      unsubs.forEach(fn => fn());
    };
  }, [feedItems]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const prevActiveNowCountRef = useRef<number>(socialActiveNowList.length);

  // Subtle list transition when active users appear/disappear (only while Home is focused).
  // Global LayoutAnimation while another stack screen mounts (e.g. Notifications) can crash Fabric iOS.
  useEffect(() => {
    const prev = prevActiveNowCountRef.current;
    if (prev !== socialActiveNowList.length) {
      if (isHomeFocused) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      prevActiveNowCountRef.current = socialActiveNowList.length;
    }
  }, [socialActiveNowList.length, isHomeFocused]);

  useFocusEffect(
    useCallback(() => {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(activeNowPulseScale, {
              toValue: 1.4,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(activeNowPulseScale, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(activeNowPulseOpacity, {
              toValue: 0,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(activeNowPulseOpacity, {
              toValue: 0.6,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      pulseLoop.start();
      void trainingStats.refresh();
      if (user?.id) {
        refreshWorkoutFeedFromServerForHome(user.id).catch(() => {});
      }
      void refreshGymlyActiveNow();
      return () => {
        pulseLoop.stop();
      };
    }, [
      activeNowPulseOpacity,
      activeNowPulseScale,
      trainingStats.refresh,
      refreshGymlyActiveNow,
      user?.id,
    ])
  );

  // Initialize video playback when feed items change
  useEffect(() => {
    // Small delay to ensure layouts are measured
    const timer = setTimeout(() => {
      if (scrollViewRef.current) {
        // Trigger initial scroll check
        scrollViewRef.current.scrollTo({y: 0, animated: false});
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [feedItems]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const formatActiveDuration = (startTimestamp: number) => {
    const diffMinutes = Math.max(1, Math.floor((now - startTimestamp) / 60000));
    if (diffMinutes >= 60) {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}t ${minutes}m`;
    }
    return `${diffMinutes} min`;
  };

  // Parse muscle groups from focus string
  const getMuscleGroupsFromFocus = (focus: string): MuscleGroup[] => {
    const lower = focus.toLowerCase();
    const groups: MuscleGroup[] = [];
    
    if (lower.includes('bryst') || lower.includes('chest')) {
      groups.push('bryst');
    }
    if (lower.includes('triceps')) {
      groups.push('triceps');
    }
    if (lower.includes('biceps')) {
      groups.push('biceps');
    }
    if (lower.includes('ben') || lower.includes('legs')) {
      groups.push('ben');
    }
    if (lower.includes('ryg') || lower.includes('back')) {
      groups.push('ryg');
    }
    if (lower.includes('skulder') || lower.includes('shoulder')) {
      groups.push('skulder');
    }
    if (lower.includes('abs') || lower.includes('mave') || lower.includes('core')) {
      groups.push('mave');
    }
    if (lower.includes('reformer')) {
      groups.push('reformer');
    }
    if (lower.includes('pilates')) {
      groups.push('pilates');
    }
    if (
      lower.includes('cardio') ||
      lower.includes('kondi') ||
      lower.includes('løb') ||
      lower.includes('løbet') ||
      lower.includes('run') ||
      lower.includes('bike') ||
      lower.includes('cykel') ||
      lower.includes('stair') ||
      lower.includes('treadmill') ||
      lower.includes('hiit') ||
      lower.includes('hele kropp') ||
      lower.includes('hele_kroppen')
    ) {
      groups.push('cardio');
    }

    return groups.length > 0 ? groups : ['cardio'];
  };

  const handleAddFriend = (friendId: string, friendName: string) => {
    if (!addedFriends.includes(friendId)) {
      setAddedFriends(prev => [...prev, friendId]);
      const requesterName = user?.displayName?.trim() || 'Du';
      NotificationService.sendFriendRequestNotification(friendId, requesterName);
      Alert.alert('Venneanmodning sendt', `${friendName} har modtaget en venneanmodning fra dig.`);
    }
  };

  const handleViewProfile = (friendId: string, friendName: string, mutualFriends: number, gyms: string[]) => {
    navigation.navigate('FriendProfile', {
      friendId,
      friendName,
      mutualFriends,
      gyms,
    });
  };

  type SuggestedFriend = {
    id: string;
    name: string;
    mutualFriends: number;
    gyms: string[];
    avatar?: string;
  };
  const suggestedFriends = useMemo((): SuggestedFriend[] => [], []);

  type Particle = {
    opacity: Animated.Value;
    translateX: Animated.Value;
    translateY: Animated.Value;
    scale: Animated.Value;
  };
  const bicepsAnimations = useRef<
    Record<string, {scale: Animated.Value; particles: Particle[]}>
  >({});

  const createParticle = () => ({
    opacity: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(0),
  });

  const ensureBicepsAnimation = (itemId: string) => {
    if (!bicepsAnimations.current[itemId]) {
      bicepsAnimations.current[itemId] = {
        scale: new Animated.Value(1),
        particles: Array.from({length: 6}).map(() => createParticle()),
      };
    }
    return bicepsAnimations.current[itemId];
  };

  useEffect(() => {
    feedItems.forEach(item => {
      ensureBicepsAnimation(item.id);
    });
  }, [feedItems]);

  const runBicepsAnimation = (itemId: string, showParticles = true) => {
    const anim = ensureBicepsAnimation(itemId);
    
    // Start emoji animation
    setAnimatingItems(prev => ({...prev, [itemId]: true}));
    
    // Scale animation for button - make it bigger when pressed
    anim.scale.setValue(1);
    Animated.sequence([
      Animated.spring(anim.scale, {
        toValue: 1.2,
        friction: 5,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(anim.scale, {
        toValue: 1,
        friction: 6,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAnimatingItems(prev => {
        const next = {...prev};
        delete next[itemId];
        return next;
      });
    });
    
    // Particle animations - start from positions around the button
    if (!showParticles) {
      return;
    }
    anim.particles.forEach((particle, index) => {
      const angle = (index / anim.particles.length) * Math.PI * 2;
      const startDistance = 20; // Start position around button
      const endDistance = 50 + Math.random() * 20; // End position
      
      const startX = Math.cos(angle) * startDistance;
      const startY = Math.sin(angle) * startDistance;
      const endX = Math.cos(angle) * endDistance;
      const endY = Math.sin(angle) * endDistance;
      
      particle.opacity.setValue(1);
      particle.scale.setValue(0);
      particle.translateX.setValue(startX);
      particle.translateY.setValue(startY);
      
      Animated.parallel([
        Animated.sequence([
          Animated.spring(particle.scale, {
            toValue: 1.2,
            friction: 5,
            tension: 200,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.5,
            duration: 140,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateY, {
          toValue: endY,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateX, {
          toValue: endX,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const toggleLikeOptimistic = (itemId: string, skipParticles = false) => {
    setFeedReactions(prev => {
      const existing = prev[itemId] ?? {liked: false, likes: 0};
      const nextLiked = !existing.liked;
      if (nextLiked) {
        runBicepsAnimation(itemId, !skipParticles);
      }
      return {
        ...prev,
        [itemId]: {
          liked: nextLiked,
          likes: Math.max(0, existing.likes + (nextLiked ? 1 : -1)),
        },
      };
    });
  };

  const toggleLike = useCallback(
    async (itemId: string, skipParticles = false) => {
      if (bicepsBusyByPost[itemId]) {
        return;
      }
      const before = feedReactionsRef.current[itemId] ?? {liked: false, likes: 0};
      setBicepsBusyByPost(prev => ({...prev, [itemId]: true}));
      toggleLikeOptimistic(itemId, skipParticles);
      try {
        const result = await togglePostBicepsReaction(itemId);
        setFeedReactions(prev => ({
          ...prev,
          [itemId]: {liked: result.reacted, likes: result.count},
        }));
      } catch {
        setFeedReactions(prev => ({
          ...prev,
          [itemId]: before,
        }));
      } finally {
        setBicepsBusyByPost(prev => {
          const next = {...prev};
          delete next[itemId];
          return next;
        });
      }
    },
    [bicepsBusyByPost],
  );

  const feedReactionsRef = useRef(feedReactions);
  useEffect(() => {
    feedReactionsRef.current = feedReactions;
  }, [feedReactions]);

  const likeOnly = useCallback((itemId: string, skipParticles = false) => {
    const liked = feedReactionsRef.current[itemId]?.liked ?? false;
    if (!liked) {
      void toggleLike(itemId, skipParticles);
    }
  }, [toggleLike]);

  const ensureOverlayAnimation = useCallback((itemId: string) => {
    if (!overlayAnimations.current[itemId]) {
      overlayAnimations.current[itemId] = {
        opacity: new Animated.Value(0),
        scale: new Animated.Value(1),
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
      };
    }
    return overlayAnimations.current[itemId];
  }, []);

  const runOverlayAnimation = useCallback(
    (itemId: string, startX?: number, startY?: number) => {
      const anim = ensureOverlayAnimation(itemId);
      const layout = feedCardLayouts.current[itemId];
      const actions = feedActionsLayouts.current[itemId];
      const like = likeButtonLayouts.current[itemId];
      let targetX = -140;
      let targetY = 170;
      if (layout && actions && like) {
        const centerX = actions.x + like.x + like.width / 2;
        const centerY = actions.y + like.y + like.height / 2 - 6;
        targetX = -layout.width / 2 + centerX;
        targetY = -layout.height / 2 + centerY;
      }

      anim.opacity.setValue(1);
      anim.scale.setValue(1);
      if (layout && startX !== undefined && startY !== undefined) {
        anim.translateX.setValue(-layout.width / 2 + startX);
        anim.translateY.setValue(-layout.height / 2 + startY);
      } else {
        anim.translateX.setValue(0);
        anim.translateY.setValue(0);
      }

      Animated.parallel([
        Animated.timing(anim.translateX, {
          toValue: targetX,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(anim.translateY, {
          toValue: targetY,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        anim.opacity.setValue(0);
      });
    },
    [ensureOverlayAnimation],
  );

  const handlePhotoDoubleTap = useCallback(
    (itemId: string, tapX: number, tapY: number) => {
      const wasLiked = feedReactionsRef.current[itemId]?.liked ?? false;
      likeOnly(itemId, true);
      const photoLayout = feedPhotoLayouts.current[itemId];
      const startX = photoLayout ? photoLayout.x + tapX : undefined;
      const startY = photoLayout ? photoLayout.y + tapY : undefined;
      runOverlayAnimation(itemId, startX, startY);
      if (!wasLiked) {
        const likeAnim = ensureBicepsAnimation(itemId);
        if (likeAnim) {
          likeAnim.scale.setValue(1);
          setTimeout(() => {
            runBicepsAnimation(itemId, true);
            Animated.sequence([
              Animated.spring(likeAnim.scale, {
                toValue: 1.2,
                friction: 6,
                useNativeDriver: true,
              }),
              Animated.spring(likeAnim.scale, {
                toValue: 1,
                friction: 6,
                useNativeDriver: true,
              }),
            ]).start();
          }, 450);
        }
      }
    },
    [likeOnly, runOverlayAnimation, ensureBicepsAnimation],
  );

  const openProfile = useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);

  const openLocalCenterDetail = useCallback((center: LocalCenterActivity) => {
    const gym = findGymById(center.centerId);
    const activeFriends = center.activeFriends.map(f => ({
      checkInId: `${center.centerId}_${f.userId}_${f.startedAt}`,
      userId: f.userId,
      displayName: f.displayName,
      workoutType: f.workoutType,
      startedAt: f.startedAt,
      avatarUrl: f.avatarUrl,
    }));
    navigation.navigate('GymPresence', {
      activeCenter: {
        centerId: center.centerId,
        displayName: center.displayName,
        brandLabel: center.brand ?? center.displayName,
        address: center.address ?? undefined,
        danishGym: gym ?? null,
        distanceMeters: null,
        totalActiveCount: center.totalActiveCount,
        activeFriendsCount: center.activeFriendsCount,
        activeFriends,
        activeSessions: activeFriends,
      },
    });
  }, [navigation]);

  const openComments = (itemId: string) => {
    setActiveCommentItem(itemId);
    setCommentInput('');
    setCommentInputFocused(false);
    setCommentModalVisible(true);
  };

  const openBicepsList = useCallback(async (itemId: string) => {
    setBicepsListPostId(itemId);
    setBicepsListVisible(true);
    setBicepsListLoading(true);
    try {
      const users = await fetchPostBicepsUsers(itemId);
      setBicepsListUsers(users);
    } catch {
      setBicepsListUsers([]);
    } finally {
      setBicepsListLoading(false);
    }
  }, []);

  const closeBicepsList = useCallback(() => {
    setBicepsListVisible(false);
    setBicepsListUsers([]);
    setBicepsListPostId(null);
  }, []);

  const closeComments = () => {
    setCommentModalVisible(false);
    setActiveCommentItem(null);
    setCommentInput('');
    setCommentInputFocused(false);
  };

  useEffect(() => {
    if (!commentModalVisible && !reelsCommentVisible && !reelsShareVisible) {
      return;
    }
    const showSub = Keyboard.addListener('keyboardWillShow', event => {
      const height = event?.endCoordinates?.height ?? 0;
      setCommentKeyboardHeight(height);
      if (reelsShareVisible) {
        setReelsShareKeyboardHeight(height);
      }
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setCommentKeyboardHeight(0);
      setReelsShareKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [commentModalVisible, reelsCommentVisible, reelsShareVisible]);

  const handleFeedItemMenu = (itemId: string, itemUser: string) => {
    const currentUser = user?.displayName || user?.username || 'Du';
    // Only allow deletion if it's the current user's post
    if (itemUser === currentUser || itemUser === 'Du') {
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
              // Also remove reactions and comments
              setFeedReactions(prev => {
                const next = {...prev};
                delete next[itemId];
                return next;
              });
              setCommentsByFeedItem(prev => {
                const next = {...prev};
                delete next[itemId];
                return next;
              });
            },
          },
        ],
      );
    }
  };

  const handleSubmitComment = () => {
    const trimmed = commentInput.trim();
    if (!trimmed || !activeCommentItem) {
      return;
    }
    const authorName = user?.displayName || user?.username || 'Du';
    const commentId = `${activeCommentItem}_${Date.now()}_${Math.random()}`;
    setCommentsByFeedItem(prev => ({
      ...prev,
      [activeCommentItem]: [...(prev[activeCommentItem] ?? []), {author: authorName, text: trimmed, id: commentId}],
    }));
    setCommentedItems(prev =>
      prev.includes(activeCommentItem) ? prev : [...prev, activeCommentItem],
    );
    setCommentInput('');
  };

  const toggleCommentLike = (feedItemId: string, commentId: string) => {
    setCommentLikes(prev => {
      const feedLikes = prev[feedItemId] ?? {};
      const commentLike = feedLikes[commentId] ?? {liked: false, likes: 0};
      return {
        ...prev,
        [feedItemId]: {
          ...feedLikes,
          [commentId]: {
            liked: !commentLike.liked,
            likes: Math.max(0, commentLike.likes + (commentLike.liked ? -1 : 1)),
          },
        },
      };
    });
  };

  const openReels = (itemId: string) => {
    const videoItems = feedItems.filter(item => item.videoUri && item.type === 'pr');
    const startIndex = videoItems.findIndex(item => item.id === itemId);
    if (startIndex >= 0) {
      setReelsItems(videoItems);
      setReelsCurrentIndex(startIndex);
      setReelsModalVisible(true);
      setPlayingVideoId(videoItems[startIndex].id);
      // Scroll to the selected video after modal opens
      setTimeout(() => {
        const screenHeight = Dimensions.get('window').height;
        reelsScrollViewRef.current?.scrollTo({
          y: startIndex * screenHeight,
          animated: false,
        });
      }, 100);
    }
  };

  const showReelsHeartAnimation = (itemId: string, x: number, y: number) => {
    if (!reelsHeartAnimations.current[itemId]) {
      reelsHeartAnimations.current[itemId] = {
        x,
        y,
        opacity: new Animated.Value(0),
        scale: new Animated.Value(0),
      };
    } else {
      reelsHeartAnimations.current[itemId].x = x;
      reelsHeartAnimations.current[itemId].y = y;
    }
    
    const anim = reelsHeartAnimations.current[itemId];
    anim.opacity.setValue(0);
    anim.scale.setValue(0);
    
    Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          Animated.timing(anim.scale, {
            toValue: 1.2,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(anim.opacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(anim.scale, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  };

  const closeReels = () => {
    // Reset animation values
    reelsTranslateX.value = 0;
    reelsOpacity.value = 1;
    setReelsModalVisible(false);
    setPlayingVideoId(null);
    // Pause all videos
    Object.values(reelsVideoRefs.current).forEach(ref => {
      if (ref && ref.current) {
        ref.current.seek(0);
      }
    });
  };

  const handleReelsScroll = (event: any) => {
    const {contentOffset} = event.nativeEvent;
    const screenHeight = Dimensions.get('window').height;
    const newIndex = Math.round(contentOffset.y / screenHeight);
    if (newIndex !== reelsCurrentIndex && newIndex >= 0 && newIndex < reelsItems.length) {
      setReelsCurrentIndex(newIndex);
      setPlayingVideoId(reelsItems[newIndex].id);
    }
  };

  const toggleReelsShareSelection = (friendId: string) => {
    setReelsShareSelections(prev => ({
      ...prev,
      [friendId]: !prev[friendId],
    }));
  };

  const handleReelsSendShare = (friendId: string) => {
    const friend = FRIENDS.find(f => f.id === friendId);
    if (friend) {
      Alert.alert('Sendt', `Video sendt til ${friend.name}`);
      setReelsShareVisible(false);
      setReelsShareSelections({});
      setReelsShareSearch('');
      setReelsShareSearchFocused(false);
    }
  };

  const handleReelsShareSearchChange = (text: string) => {
    setReelsShareSearch(text);
    // Open modal when user starts typing (like comment modal)
    if (text.trim().length > 0 && !reelsShareVisible) {
      setReelsShareVisible(true);
    }
  };

  // Get filtered friends for search
  const filteredFriends = useMemo(() => {
    if (reelsShareSearch.trim() === '') {
      return FRIENDS;
    }
    return FRIENDS.filter(friend =>
      friend.name.toLowerCase().includes(reelsShareSearch.trim().toLowerCase()),
    );
  }, [reelsShareSearch]);

  const handleReelsSubmitComment = () => {
    const trimmed = commentInput.trim();
    if (!trimmed || !activeCommentItem) {
      return;
    }
    const authorName = user?.displayName || user?.username || 'Du';
    const commentId = `${activeCommentItem}_${Date.now()}_${Math.random()}`;
    setCommentsByFeedItem(prev => ({
      ...prev,
      [activeCommentItem]: [...(prev[activeCommentItem] ?? []), {author: authorName, text: trimmed, id: commentId}],
    }));
    setCommentedItems(prev =>
      prev.includes(activeCommentItem) ? prev : [...prev, activeCommentItem],
    );
    setCommentInput('');
  };

  const activeComments = activeCommentItem ? commentsByFeedItem[activeCommentItem] ?? [] : [];
  const [commentKeyboardHeight, setCommentKeyboardHeight] = useState(0);

  const updatePlayingVideos = useCallback((contentOffset: number, layoutHeight: number) => {
    // Calculate which videos are in viewport
    const viewportTop = contentOffset;
    const viewportBottom = contentOffset + layoutHeight;
    const viewportCenter = contentOffset + layoutHeight / 2;
    let closestVideo: {id: string; distance: number} | null = null;
    
    // Check each video item
    feedItems.forEach(item => {
      if (item.videoUri && item.type === 'pr') {
        const layout = feedVideoLayouts.current[item.id];
        if (layout) {
          const videoTop = layout.y;
          const videoBottom = layout.y + layout.height;
          const videoCenter = videoTop + layout.height / 2;
          
          // Check if video overlaps with viewport
          const visibleHeight = Math.max(0, Math.min(videoBottom, viewportBottom) - Math.max(videoTop, viewportTop));
          const visibilityRatio = layout.height > 0 ? visibleHeight / layout.height : 0;
          
          // Only consider videos that are at least 10% visible (very low threshold for instant start)
          if (visibilityRatio >= 0.1) {
            const distance = Math.abs(videoCenter - viewportCenter);
            if (!closestVideo || distance < closestVideo.distance) {
              closestVideo = {id: item.id, distance};
            }
          }
        }
      }
    });
    
    // Play the closest video to viewport center (only one at a time)
    setPlayingFeedVideos(prev => {
      if (closestVideo) {
        if (prev.has(closestVideo.id) && prev.size === 1) {
          return prev; // No change needed
        }
        return new Set([closestVideo.id]);
      } else {
        // No video in viewport, pause all
        if (prev.size === 0) return prev;
        return new Set();
      }
    });
  }, [feedItems]);

  const handleScroll = useCallback((event: any) => {
    const {contentOffset, layoutMeasurement} = event.nativeEvent;
    scrollY.current = contentOffset.y;
    
    // Update videos immediately for instant playback
    updatePlayingVideos(contentOffset.y, layoutMeasurement.height);
  }, [updatePlayingVideos]);

  const greetingName = user?.displayName?.trim();
  const normalized = greetingName?.toLowerCase().replace(/\s+/g, ' ') ?? '';
  const isGenericName =
    !greetingName ||
    greetingName.length < 2 ||
    /^(google\s*user|gymly\s*user|user)(!)?$/i.test(normalized) ||
    normalized.includes('google user') ||
    normalized.includes('gymly user');
  const greeting = !isGenericName ? `Hej, ${greetingName} 👋` : 'Hej 👋';

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}>
        {/* 1. Header / Welcome */}
        <View style={[styles.welcomeSection, {paddingHorizontal: HOME_H_PADDING}]}>
          <Text style={styles.welcomeText}>{greeting}</Text>
          <Text style={styles.subtitle}>
            {new Date().toLocaleDateString('da-DK', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text style={styles.welcomeCta}>Klar til dagens session?</Text>
        </View>

        {/* 2. Quick Stats Cards */}
        <View style={[styles.dashboardSection, {paddingHorizontal: HOME_H_PADDING}]}>
          <View style={styles.dashboardStatsRow}>
            <View style={styles.statCardWrapper}>
              <StatCard
                compact
                emoji="🔥"
                label="Dages streak"
                value={streakDisplayValue}
                accent
              />
            </View>
            <View style={styles.statCardWrapper}>
              <StatCard
                compact
                emoji="✅"
                label="Check-ins"
                value={dashboardWeeklyCheckins}
              />
            </View>
          </View>
          <View style={styles.dashboardStatsRow}>
            <View style={styles.statCardWrapper}>
              <StatCard
                compact
                emoji="⏰"
                label="Min. Trænet"
                value={dashboardWeeklyMinutes}
              />
            </View>
            <View style={styles.statCardWrapper}>
              <StatCard
                compact
                emoji="🏅"
                label="Badges"
                value={badgeCount}
                onPress={() => navigation.navigate('Badges')}
              />
            </View>
          </View>

          <DashboardSection
            title="Dine centre"
            subtitle="Se aktiviteten i dine lokale centre">
            {hasLocalCenters ? (
              <View style={styles.localCentersList}>
                {localCenters.map(center => (
                  <Pressable
                    key={center.centerId}
                    style={({pressed}) => [
                      styles.localCenterCard,
                      pressed && styles.localCenterCardPressed,
                    ]}
                    onPress={() => openLocalCenterDetail(center)}>
                    <GymLogoView
                      gymName={center.displayName}
                      brand={center.brand ?? undefined}
                      size={40}
                      unknownFallback="gymly-only"
                      surface="lavender"
                    />
                    <View style={styles.localCenterBody}>
                      <Text style={styles.localCenterName} numberOfLines={1}>
                        {center.displayName}
                      </Text>
                      <Text style={styles.localCenterCounts} numberOfLines={1}>
                        {center.totalActiveCount} aktive · {center.activeFriendsCount} venner
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={20} color={colors.textMuted} />
                  </Pressable>
                ))}
                {localCentersLoading ? (
                  <Text style={styles.localCenterLoading}>Opdaterer aktivitet...</Text>
                ) : null}
              </View>
            ) : (
              <Card padding="lg" style={styles.localCenterEmptyCard}>
                <Text style={styles.localCenterEmptyTitle}>Tilføj dine centre</Text>
                <Text style={styles.localCenterEmptyText}>
                  Vælg op til 3 lokale centre og følg aktiviteten live
                </Text>
                <TouchableOpacity
                  style={styles.localCenterEmptyBtn}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('EditProfile')}>
                  <Text style={styles.localCenterEmptyBtnText}>Tilføj center</Text>
                </TouchableOpacity>
              </Card>
            )}
          </DashboardSection>

          {/* 3. Aktive nu — globalt antal + venneliste (check_ins) */}
          <DashboardSection title="Aktive nu">
            <View style={styles.activeNowCounterRow}>
              <View style={styles.activeNowCounterDotWrap}>
                <Animated.View
                  style={[
                    styles.activeNowCounterPulse,
                    {
                      transform: [{scale: activeNowPulseScale}],
                      opacity: activeNowPulseOpacity,
                    },
                  ]}
                />
                <View style={styles.activeNowCounterDot} />
              </View>
              <Text style={styles.activeNowCounterText}>
                {totalActiveUsers} aktive på Gymly lige nu
              </Text>
            </View>
            <Card padding="lg" style={styles.activeNowHighlightCard}>
              {socialActiveNowList.length > 0 ? (
                <View style={styles.onlineUsersListCol}>
                  {socialActiveNowList.map(f => (
                    <View key={f.userId} style={styles.activeNowRow}>
                      {(() => {
                        const modalUser: ActiveUser = {
                          id: f.userId,
                          name: f.displayName,
                          avatar: f.avatarUrl ?? null,
                          isFriend: f.userId !== currentUser?.id,
                          workoutType: f.workoutType ?? undefined,
                          centerName: f.gymName,
                          startedAt: f.startedAt,
                        };
                        return (
                      <TouchableOpacity
                        style={styles.activeNowRowMain}
                        onPress={() => setSelectedActiveNowUser(modalUser)}
                        activeOpacity={0.85}>
                        <UserAvatar
                          name={f.displayName}
                          imageUrl={f.avatarUrl ?? undefined}
                          size="md"
                          showOnlineIndicator
                          isOnline
                        />
                        <View style={styles.activeNowRowBody}>
                          <Text style={styles.onlineUserNameList} numberOfLines={1}>
                            {f.displayName}
                          </Text>
                          <Text style={styles.onlineUserGymList} numberOfLines={2}>
                            {f.gymName} · {formatWorkoutTypeDisplay(f.workoutType)}
                          </Text>
                          <Text style={styles.onlineUserSessionList} numberOfLines={1}>
                            {formatDurationIgang(f.startedAt, durationNow)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                        );
                      })()}
                      {f.userId !== currentUser?.id ? (
                        <TouchableOpacity
                          onPress={() => void openDmToFriend(f.userId, f.displayName)}
                          style={styles.activeNowMessageBtn}
                          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                          accessibilityLabel="Besked"
                          activeOpacity={0.75}>
                          <Icon name="chatbubble-outline" size={22} color={colors.primary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyPreview}>
                  <Text style={styles.emptyPreviewText}>Ingen venner aktive lige nu</Text>
                  <Text style={styles.emptyPreviewSubtext}>
                    {totalActiveUsers > 0
                      ? 'Start en session eller se når dine venner tjekker ind.'
                      : 'Vær den første til at tjekke ind 🔥'}
                  </Text>
                  <Pressable
                    style={({pressed}) => [
                      styles.emptyCta,
                      pressed && styles.emptyCtaPressed,
                    ]}
                    onPress={() => navigation.navigate('CheckIn')}>
                    <Text style={styles.emptyCtaText}>Tjek ind</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          </DashboardSection>
        </View>

        {/* Feed */}
        <React.Fragment>
        {feedItems.length === 0 ? (
          <View style={styles.emptyPreview}>
            <Text style={styles.emptyPreviewText}>Intet på feedet endnu</Text>
            <Text style={styles.emptyPreviewSubtext}>
              Tilføj venner og del din træning for at se aktivitet her.
            </Text>
            <Pressable
              style={({pressed}) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
              onPress={() => navigation.navigate('Friends')}>
              <Text style={styles.emptyCtaText}>Find venner</Text>
            </Pressable>
          </View>
        ) : feedItems.map(item => {
            // Ensure animation is initialized
            const likeAnim = ensureBicepsAnimation(item.id);
            const overlayAnim = ensureOverlayAnimation(item.id);
            const likeScaleStyle = likeAnim
              ? {transform: [{scale: likeAnim.scale}]}
              : undefined;
            const particles = likeAnim?.particles ?? [];
            const hasCommented = commentedItems.includes(item.id);
            const commentColor = hasCommented ? '#2563EB' : '#0F172A';
            const isLiked = feedReactions[item.id]?.liked ?? false;
            const likeColor = isLiked ? '#2563EB' : '#0F172A';
            const isAnimating = animatingItems[item.id];
            return (
              <View
                key={item.id}
                style={styles.feedCard}
                onLayout={event => {
                  const {width, height, y} = event.nativeEvent.layout;
                  feedCardLayouts.current[item.id] = {width, height, y};
                }}>
              <View style={styles.feedCardHeader}>
                <TouchableOpacity
                  style={styles.feedHeaderProfile}
                  onPress={openProfile}
                  activeOpacity={0.8}>
                  <UserAvatar
                    name={item.user}
                    imageUrl={item.userAvatarUrl}
                    size="md"
                  />
                  <View style={{flex: 1}}>
                    <View style={styles.feedUserRow}>
                      <Text style={styles.feedUser}>{item.user}</Text>
                      {(() => {
                        const authorStreak = item.userId
                          ? (authorStatsByUserId[item.userId]?.currentStreak ?? 0)
                          : 0;
                        const badge = streak.getStreakBadge(authorStreak);
                        if (!badge) {
                          return null;
                        }
                        return (
                          <TouchableOpacity
                            onLongPress={() => Alert.alert(streak.formatStreakLabel(authorStreak))}
                            delayLongPress={220}
                            activeOpacity={0.85}
                            style={styles.feedStreakBadgePill}>
                            <Text style={styles.feedStreakEmoji}>{badge}</Text>
                            <Text style={styles.feedStreakCount}>{authorStreak}</Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                    <Text style={styles.feedTimestamp}>{item.timestamp}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleFeedItemMenu(item.id, item.user)}
                  activeOpacity={0.7}>
                  <Icon name="ellipsis-horizontal" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              {item.workoutInfo ? (
                <View style={styles.feedWorkoutChip}>
                  <Text style={styles.feedWorkoutChipIcon}>📍</Text>
                  <Text style={styles.feedWorkoutChipText} numberOfLines={1}>
                    {item.workoutInfo}
                  </Text>
                </View>
              ) : null}
              {item.type === 'photo' && (
                <>
                  <FeedPhoto
                    item={item}
                    onDoubleTapLike={handlePhotoDoubleTap}
                    onLayoutMeasured={(id, layout) => {
                      feedPhotoLayouts.current[id] = layout;
                    }}
                    userBicepsEmoji={userBicepsEmoji}
                  />
                  {item.rating != null && item.rating >= 1 && item.rating <= 5 && (
                    <View style={styles.feedPhotoMoodRow}>
                      <View style={styles.feedHighlightSecondary}>
                        <Text style={styles.feedRatingEmoji}>
                          {['☹️', '🙁', '😐', '😁', '🤩'][item.rating - 1]}
                        </Text>
                        <Text style={styles.feedHighlightSecondaryText}>Session delt</Text>
                      </View>
                    </View>
                  )}
                </>
              )}
              {item.type === 'pr' && (
                <>
                  {item.videoUri && (
                    <GestureDetector
                      gesture={Gesture.Exclusive(
                        Gesture.Tap()
                          .numberOfTaps(2)
                          .maxDelay(250)
                          .maxDistance(10)
                          .onEnd(() => {
                            // Only like if not already liked
                            const isCurrentlyLiked = feedReactions[item.id]?.liked ?? false;
                            if (!isCurrentlyLiked) {
                              runOnJS(likeOnly)(item.id);
                            }
                          }),
                        Gesture.Tap()
                          .numberOfTaps(1)
                          .onEnd(() => {
                            runOnJS(openReels)(item.id);
                          })
                      )}>
                      <View 
                        style={styles.feedVideoContainer}
                        onLayout={event => {
                          const layout = event.nativeEvent.layout;
                          const cardLayout = feedCardLayouts.current[item.id];
                          // Calculate absolute position relative to scroll view
                          const absoluteY = (cardLayout?.y || 0) + layout.y;
                          feedVideoLayouts.current[item.id] = {
                            y: absoluteY,
                            height: layout.height,
                          };
                        }}>
                        <Video
                          ref={ref => {
                            if (ref) {
                              feedVideoRefs.current[item.id] = ref;
                            }
                          }}
                          source={{uri: item.videoUri}}
                          style={styles.feedVideoThumbnail}
                          resizeMode="cover"
                          paused={!playingFeedVideos.has(item.id)}
                          muted={true}
                          repeat={true}
                          playInBackground={false}
                          playWhenInactive={false}
                          poster={item.videoThumbnailUri}
                          ignoreSilentSwitch="ignore"
                          progressUpdateInterval={250}
                        />
                      </View>
                    </GestureDetector>
                  )}
                  <View style={styles.feedHighlight}>
                    <Icon name="trophy" size={18} color="#FACC15" />
                    <Text style={styles.feedHighlightText}>Ny PR</Text>
                  </View>
                </>
              )}
              {item.type === 'summary' && (
                <>
                  <View style={styles.feedNoImageCard}>
                    <Text style={styles.feedNoImageEyebrow}>SESSION DELT</Text>
                    <Text style={styles.feedNoImageDuration}>
                      {(item.workoutInfo?.split('·')[1] ?? 'Session').trim().toUpperCase()}
                    </Text>
                    <Text style={styles.feedNoImageWorkout}>
                      {(item.workoutInfo?.split('·')[2] ?? 'Træning').trim()}
                    </Text>
                    <Text style={styles.feedNoImageCenter} numberOfLines={1}>
                      {(item.workoutInfo?.split('·')[0] ?? 'Gymly center').trim()}
                    </Text>
                  </View>
                  {item.muscles && item.muscles.length > 0 && (
                    <View style={styles.feedMuscleIconsRow}>
                      {item.muscles.map(muscle => (
                        <MuscleGroupTileIcon
                          key={muscle}
                          group={coerceMuscleGroup(String(muscle))}
                          size={20}
                          style={styles.feedMuscleIcon}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
              {item.description &&
                item.description.trim().length > 0 &&
                item.description.trim() !== (item.workoutInfo ?? '').trim() && (
                <RenderCaptionWithMentions
                  text={item.description}
                  mentionedUsers={item.mentionedUsers}
                  navigation={navigation}
                  username={item.user}
                  onPressUsername={openProfile}
                />
              )}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.feedCardBicepsOverlay,
                  {
                    opacity: overlayAnim.opacity,
                    transform: [
                      {translateX: overlayAnim.translateX},
                      {translateY: overlayAnim.translateY},
                      {scale: overlayAnim.scale},
                    ],
                  },
                ]}>
                <Text style={styles.feedCardBicepsEmoji}>{userBicepsEmoji}</Text>
              </Animated.View>
              <View
                style={styles.feedActions}
                onLayout={event => {
                  feedActionsLayouts.current[item.id] = event.nativeEvent.layout;
                }}>
                <View style={styles.feedActionGroup}>
                  <TouchableOpacity
                    style={[
                      styles.feedSocialPill,
                      styles.feedLikeButton,
                      isLiked && styles.feedSocialPillActive,
                    ]}
                    onPress={() => void toggleLike(item.id)}
                    activeOpacity={0.7}
                    onLayout={event => {
                      likeButtonLayouts.current[item.id] = event.nativeEvent.layout;
                    }}>
                    <View style={styles.likeButtonInner}>
                      <Animated.View 
                        style={likeScaleStyle}
                        renderToHardwareTextureAndroid={true}
                        shouldRasterizeIOS={true}>
                        <View style={styles.likeButtonContent}>
                          {/* Biceps emoji - always visible */}
                          <Animated.View
                            style={[
                              styles.likeButtonOverlay,
                            ]}>
                            <Text 
                              style={[
                                styles.bicepsEmoji,
                                isLiked && styles.bicepsEmojiLiked
                              ]}
                              allowFontScaling={false}
                              textBreakStrategy="simple"
                              suppressHighlighting={true}>
                              {isLiked ? userBicepsEmoji : '💪'}
                            </Text>
                          </Animated.View>
                        </View>
                      </Animated.View>
                      {particles.map((particle, idx) => (
                        <Animated.View
                          key={`${item.id}_particle_${idx}`}
                          style={[
                            styles.burstBiceps,
                            {
                              opacity: particle.opacity,
                              transform: [
                                {translateX: particle.translateX},
                                {translateY: particle.translateY},
                                {scale: particle.scale},
                              ],
                            },
                          ]}>
                          <Text style={styles.bicepsParticleEmoji}>
                            {userBicepsEmoji}
                          </Text>
                        </Animated.View>
                      ))}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.feedSocialCountTap}
                    onPress={() => openBicepsList(item.id)}
                    activeOpacity={0.75}>
                    <Text
                      style={[
                        styles.feedSocialPillText,
                        isLiked && styles.feedActionTextLiked,
                      ]}>
                      {feedReactions[item.id]?.likes ?? 0}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.feedActionGroup}>
                  <TouchableOpacity
                    style={styles.feedSocialPill}
                    onPress={() => openComments(item.id)}
                    activeOpacity={0.8}>
                    <Icon name="chatbubble-outline" size={16} color={commentColor} />
                    <Text
                      style={[
                        styles.feedSocialPillText,
                        hasCommented && styles.feedActionTextLiked,
                      ]}>
                      {commentsByFeedItem[item.id]?.length ?? 0}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {commentsByFeedItem[item.id] && commentsByFeedItem[item.id].length > 0 ? (
                <View style={styles.feedCommentPreview}>
                  <Text style={styles.feedCommentPreviewAuthor}>
                    {commentsByFeedItem[item.id][commentsByFeedItem[item.id].length - 1]?.author}:
                  </Text>
                  <Text style={styles.feedCommentPreviewText} numberOfLines={2}>
                    “{commentsByFeedItem[item.id][commentsByFeedItem[item.id].length - 1]?.text}”
                  </Text>
                </View>
              ) : null}
              </View>
            );
          })}
        </React.Fragment>

        {/* Suggested Friends - kun ægte brugere */}
        {suggestedFriends.length > 0 && (
          <View style={styles.suggestedFriendsCard}>
            <Text style={styles.suggestedFriendsTitle}>Forslåede venner</Text>
            <FlatList
              data={suggestedFriends}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.suggestedFriendsList}
              renderItem={({item}) => {
                const isAdded = addedFriends.includes(item.id);
                return (
                  <TouchableOpacity
                    style={styles.suggestedFriendCard}
                    activeOpacity={0.85}
                    onPress={() => handleViewProfile(item.id, item.name, item.mutualFriends, item.gyms)}>
                    <View style={styles.suggestedFriendAvatar}>
                      {item.avatar ? (
                        <Image source={{uri: item.avatar}} style={styles.suggestedFriendAvatarImage} />
                      ) : (
                        <Text style={styles.suggestedFriendAvatarText}>{item.name.charAt(0)}</Text>
                      )}
                    </View>
                    <Text style={styles.suggestedFriendName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.suggestedFriendMutual}>
                      {item.mutualFriends} fælles venner
                    </Text>
                    <View style={styles.suggestedFriendGyms}>
                      {item.gyms.slice(0, 2).map((gym, idx) => (
                        <Text key={idx} style={styles.suggestedFriendGym} numberOfLines={1}>
                          {gym}
                        </Text>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.suggestedFriendAddButton,
                        isAdded && styles.suggestedFriendAddButtonAdded,
                      ]}
                      activeOpacity={0.8}
                      onPress={e => {
                        e.stopPropagation();
                        handleAddFriend(item.id, item.name);
                      }}
                      disabled={isAdded}>
                      <Icon
                        name={isAdded ? 'checkmark' : 'person-add-outline'}
                        size={16}
                        color={isAdded ? '#22C55E' : colors.primary}
                      />
                      <Text
                        style={[
                          styles.suggestedFriendAddText,
                          isAdded && styles.suggestedFriendAddTextAdded,
                        ]}>
                        {isAdded ? 'Tilføjet' : 'Tilføj'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

      </ScrollView>

      <UserProfileModal
        user={selectedActiveNowUser}
        visible={!!selectedActiveNowUser}
        onClose={() => setSelectedActiveNowUser(null)}
        viewerUserId={currentUser?.id}
        viewerName={currentUser?.displayName || 'Dig'}
        activitySubtitle="Aktiv lige nu"
      />

      <Modal visible={bicepsListVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeBicepsList}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bicepsListSheet}>
                <View style={styles.commentHandle} />
                <View style={styles.commentHeader}>
                  <Text style={styles.modalTitle}>Biceps</Text>
                  <TouchableOpacity onPress={closeBicepsList} style={styles.commentCloseButton}>
                    <Icon name="close" size={22} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent}>
                  {bicepsListLoading ? (
                    <Text style={styles.commentEmpty}>Henter biceps...</Text>
                  ) : bicepsListUsers.length === 0 ? (
                    <Text style={styles.commentEmpty}>Ingen biceps endnu</Text>
                  ) : (
                    bicepsListUsers.map(row => (
                      <TouchableOpacity
                        key={`${row.userId}_${row.createdAt}`}
                        style={styles.bicepsUserRow}
                        onPress={() => navigation.navigate('FriendProfile', {friendId: row.userId, friendName: row.name})}
                        activeOpacity={0.75}>
                        <UserAvatar name={row.name} imageUrl={row.avatarUrl ?? undefined} size="sm" />
                        <View style={styles.bicepsUserMeta}>
                          <Text style={styles.commentAuthor}>{row.name}</Text>
                          <Text style={styles.bicepsUserUsername}>@{row.username}</Text>
                        </View>
                        <Text style={styles.bicepsUserCta}>Se profil</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={commentModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeComments}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.commentSheet,
                  commentInputFocused ? styles.commentSheetExpanded : styles.commentSheetCollapsed,
                ]}>
                  <View style={styles.commentHandle} />
                  <View style={styles.commentHeader}>
                    <Text style={styles.modalTitle}>Kommentarer</Text>
                    <TouchableOpacity onPress={closeComments} style={styles.commentCloseButton}>
                      <Icon name="close" size={22} color="#0F172A" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.commentList}
                    contentContainerStyle={styles.commentListContent}>
                    {activeComments.length === 0 ? (
                      <Text style={styles.commentEmpty}>Ingen kommentarer endnu</Text>
                    ) : (
                      activeComments.map((comment, index) => {
                        const itemKey = activeCommentItem ?? '';
                        const commentId = comment.id || `${itemKey}_comment_${index}`;
                        const commentLike =
                          (itemKey ? commentLikes[itemKey]?.[commentId] : undefined) ??
                          {liked: false, likes: 0};
                        return (
                          <View key={commentId} style={styles.commentRow}>
                            <View style={styles.commentAvatar}>
                              <Text style={styles.commentAvatarText}>
                                {comment.author.charAt(0)}
                              </Text>
                            </View>
                            <View style={{flex: 1}}>
                              <Text style={styles.commentAuthor}>{comment.author}</Text>
                              <Text style={styles.commentBody}>{comment.text}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.commentLikeButton}
                              onPress={() =>
                                activeCommentItem && toggleCommentLike(activeCommentItem, commentId)
                              }
                              activeOpacity={0.7}>
                              <Icon
                                name={commentLike.liked ? 'heart' : 'heart-outline'}
                                size={18}
                                color={commentLike.liked ? '#FF3040' : '#94A3B8'}
                              />
                              <Text style={styles.commentLikeCount}>
                                {commentLike.likes > 0 ? commentLike.likes : '0'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                  <View
                    style={[
                      styles.commentComposer,
                      commentKeyboardHeight > 0
                        ? {bottom: commentKeyboardHeight + safeAreaBottom}
                        : null,
                    ]}>
                    <View style={styles.commentEmojiRow}>
                      {['❤️', '🙌', '🔥', '💪', '🥲', '😍', '😮', '😂'].map(emoji => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.commentEmojiButton}
                          onPress={() => setCommentInput(prev => `${prev}${emoji}`)}>
                          <Text style={styles.commentEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.commentInputRow}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Tilføj en kommentar..."
                        placeholderTextColor="#94A3B8"
                        value={commentInput}
                        onChangeText={setCommentInput}
                        onFocus={() => setCommentInputFocused(true)}
                        onBlur={() => setCommentInputFocused(false)}
                        selectionColor={colors.primary}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                        multiline
                      />
                      <TouchableOpacity
                        style={[
                          styles.commentSendButton,
                          commentInput.trim().length === 0 && styles.commentSendButtonDisabled,
                        ]}
                        onPress={handleSubmitComment}
                        disabled={commentInput.trim().length === 0}>
                        <Icon
                          name="send"
                          size={20}
                          color={commentInput.trim().length === 0 ? '#94A3B8' : '#fff'}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Video Modal */}
      <Modal
        visible={videoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsVideoPlaying(false);
          setVideoModalVisible(false);
        }}>
        <View style={styles.videoModalOverlay}>
          <TouchableWithoutFeedback onPress={() => {
            setIsVideoPlaying(false);
            setVideoModalVisible(false);
          }}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.videoModalContent}>
            <TouchableOpacity
              style={styles.videoModalClose}
              onPress={() => {
                setIsVideoPlaying(false);
                setVideoModalVisible(false);
              }}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {selectedVideoUri && (
              <View style={styles.videoPlayerContainer}>
                <Video
                  ref={videoRef}
                  source={{uri: selectedVideoUri}}
                  style={styles.videoPlayer}
                  controls={true}
                  paused={!isVideoPlaying}
                  resizeMode="contain"
                  onLoad={() => setIsVideoPlaying(true)}
                  onError={(error) => {
                    Alert.alert('Fejl', 'Kunne ikke afspille videoen.');
                    console.error('Video error:', error);
                  }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Reels Modal - Always mounted so hooks run; hidden when comment modal is open */}
      <Modal
        visible={reelsModalVisible && !commentModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeReels}>
          <Reanimated.View 
            style={useAnimatedStyle(() => ({
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 1)',
              opacity: reelsOpacity.value,
            }))}>
            <GestureDetector
              gesture={Gesture.Pan()
              .activeOffsetX([-10, 10])
              .failOffsetY([-5, 5])
              .onUpdate(event => {
                const {translationX} = event;
                // Video follows finger smoothly
                reelsTranslateX.value = translationX;
                
                // More gradual opacity fade like Instagram (fade starts earlier and is smoother)
                const progress = Math.min(Math.abs(translationX) / screenWidth, 1);
                // Use a smoother curve for opacity (ease out)
                const opacity = 1 - (progress * progress * 0.8); // Quadratic curve for smoother fade
                reelsOpacity.value = Math.max(opacity, 0.2); // Don't fade completely during drag
              })
              .onEnd(event => {
                const {translationX, velocityX} = event;
                const swipeThreshold = screenWidth * 0.3; // 30% of screen width
                const velocityThreshold = 800; // Higher velocity threshold for more intentional swipes
                
                // Close if swiped far enough OR if velocity is high enough (like Instagram)
                const shouldClose = Math.abs(translationX) > swipeThreshold || Math.abs(velocityX) > velocityThreshold;
                
                if (shouldClose) {
                  // Animate out smoothly in the direction of swipe
                  const targetX = translationX > 0 ? screenWidth * 1.2 : -screenWidth * 1.2;
                  const duration = Math.max(200, Math.min(350, Math.abs(translationX) / 5)); // Dynamic duration based on distance
                  
                  reelsTranslateX.value = withTiming(targetX, {
                    duration,
                    easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
                  });
                  reelsOpacity.value = withTiming(0, {
                    duration,
                    easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
                  }, () => {
                    // Reset values before closing to prevent comeback
                    reelsTranslateX.value = 0;
                    reelsOpacity.value = 1;
                    runOnJS(closeReels)();
                  });
                } else {
                  // Snap back smoothly with spring-like animation
                  reelsTranslateX.value = withTiming(0, {
                    duration: 300,
                    easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
                  });
                  reelsOpacity.value = withTiming(1, {
                    duration: 300,
                    easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
                  });
                }
              })}>
            <Reanimated.View 
              style={[
                styles.reelsModalContainer,
                useAnimatedStyle(() => ({
                  transform: [{translateX: reelsTranslateX.value}],
                  opacity: reelsOpacity.value,
                })),
              ]}>
                <TouchableOpacity
                  style={styles.reelsCloseButton}
                  onPress={closeReels}>
                  <Icon name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <ScrollView
                  ref={reelsScrollViewRef}
                  pagingEnabled
                  showsVerticalScrollIndicator={false}
                  onScroll={handleReelsScroll}
                  scrollEventThrottle={16}
                  style={styles.reelsScrollView}>
                  {reelsItems.map((item, index) => {
                    const isCurrentVideo = index === reelsCurrentIndex && playingVideoId === item.id;
                    return (
                      <View key={item.id} style={styles.reelsVideoContainer}>
                        <GestureDetector
                          gesture={Gesture.Tap()
                            .numberOfTaps(2)
                            .maxDelay(250)
                            .maxDistance(10)
                            .onEnd((event) => {
                              // Only like if not already liked
                              const isCurrentlyLiked = feedReactions[item.id]?.liked ?? false;
                              if (!isCurrentlyLiked) {
                                // Show heart animation at tap location
                                runOnJS(showReelsHeartAnimation)(item.id, event.x, event.y);
                                runOnJS(likeOnly)(item.id);
                              }
                            })}>
                          <View style={StyleSheet.absoluteFill}>
                            <Video
                              ref={ref => {
                                if (ref) {
                                  reelsVideoRefs.current[item.id] = ref;
                                }
                              }}
                              source={{uri: item.videoUri}}
                              style={styles.reelsVideo}
                              resizeMode="cover"
                              paused={!isCurrentVideo}
                              muted={false}
                              repeat={true}
                              playInBackground={false}
                              playWhenInactive={false}
                              onLoad={() => {
                                if (isCurrentVideo) {
                                  setPlayingVideoId(item.id);
                                }
                              }}
                            />
                            {/* Heart animation overlay */}
                            {reelsHeartAnimations.current[item.id] && (
                              <Animated.View
                                style={[
                                  styles.reelsHeartAnimation,
                                  {
                                    left: reelsHeartAnimations.current[item.id].x - 25,
                                    top: reelsHeartAnimations.current[item.id].y - 25,
                                    opacity: reelsHeartAnimations.current[item.id].opacity,
                                    transform: [{scale: reelsHeartAnimations.current[item.id].scale}],
                                  },
                                ]}>
                                <Icon name="heart" size={50} color="#FF3040" />
                              </Animated.View>
                            )}
                          </View>
                        </GestureDetector>
                        <View style={[styles.reelsOverlay, {paddingBottom: safeAreaBottom - 20}]}>
                          {/* Left side content - user info and description */}
                          <View style={styles.reelsContent}>
                            <TouchableOpacity style={styles.reelsProfile}>
                              <UserAvatar
                                name={item.user}
                                imageUrl={item.userAvatarUrl}
                                size="md"
                              />
                              <Text style={styles.reelsUsername}>{item.user}</Text>
                            </TouchableOpacity>
                            {item.description && (
                              <View style={styles.reelsDescription}>
                                <Text style={styles.reelsDescriptionText} numberOfLines={2}>
                                  {item.description}
                                </Text>
                              </View>
                            )}
                            {/* "Synes godt om fra..." text */}
                            {feedReactions[item.id]?.likes > 0 && (
                              <View style={styles.reelsLikesInfo}>
                                <View style={styles.reelsLikesAvatars}>
                                  <View style={[styles.reelsLikesAvatar, styles.reelsLikesAvatarFirst]}>
                                    <Text style={styles.reelsLikesAvatarText}>U</Text>
                                  </View>
                                  <View style={[styles.reelsLikesAvatar, styles.reelsLikesAvatarSecond]}>
                                    <Text style={styles.reelsLikesAvatarText}>M</Text>
                                  </View>
                                </View>
                                <Text style={styles.reelsLikesText}>
                                  Synes godt om fra {item.user} og {feedReactions[item.id]?.likes - 1} andre
                                </Text>
                              </View>
                            )}
                            {/* Comment input at bottom */}
                            <TouchableOpacity
                              style={styles.reelsCommentInputContainer}
                              onPress={() => {
                                setActiveCommentItem(item.id);
                                setCommentInput('');
                                setCommentInputFocused(false);
                                setReelsCommentVisible(true);
                              }}>
                              <Text style={styles.reelsCommentInputText}>Tilføj kommentar...</Text>
                            </TouchableOpacity>
                          </View>
                          {/* Right side action buttons */}
                          <View style={[styles.reelsActions, {paddingBottom: safeAreaBottom + 60}]}>
                            <TouchableOpacity
                              style={styles.reelsActionButton}
                              onPress={() => void toggleLike(item.id)}>
                              <Icon
                                name={feedReactions[item.id]?.liked ? 'heart' : 'heart-outline'}
                                size={32}
                                color={feedReactions[item.id]?.liked ? '#FF3040' : '#fff'}
                              />
                              <TouchableOpacity onPress={() => openBicepsList(item.id)} activeOpacity={0.75}>
                                <Text style={styles.reelsActionText}>
                                  {feedReactions[item.id]?.likes ?? 0}
                                </Text>
                              </TouchableOpacity>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.reelsActionButton}
                              onPress={() => {
                                setActiveCommentItem(item.id);
                                setCommentInput('');
                                setCommentInputFocused(false);
                                setReelsCommentVisible(true);
                              }}>
                              <Icon name="chatbubble-outline" size={24} color="#fff" />
                              <Text style={styles.reelsActionText}>
                                {commentsByFeedItem[item.id]?.length ?? 0}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.reelsActionButton}
                              onPress={() => {
                                setReelsShareVisible(true);
                                setReelsShareSearch('');
                                setReelsShareSearchFocused(false);
                              }}>
                              <View style={{transform: [{rotate: '-45deg'}]}}>
                                <Icon name="send-outline" size={24} color="#fff" />
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </Reanimated.View>
            </GestureDetector>
          </Reanimated.View>

          {/* Reels Comment Modal */}
          {reelsCommentVisible && activeCommentItem && (
            <Modal
              visible={reelsCommentVisible}
              transparent
              animationType="slide"
              onRequestClose={() => {
                setReelsCommentVisible(false);
                setCommentInput('');
                setCommentInputFocused(false);
              }}>
              <View style={styles.reelsCommentOverlay}>
                <TouchableWithoutFeedback 
                  onPress={() => {
                    setReelsCommentVisible(false);
                    setCommentInput('');
                    setCommentInputFocused(false);
                  }}>
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View
                  style={[
                    styles.reelsCommentSheet,
                    commentInputFocused ? styles.reelsCommentSheetExpanded : styles.reelsCommentSheetCollapsed,
                  ]}>
                  <View style={styles.commentHandle} />
                  <View style={styles.commentHeader}>
                    <Text style={styles.modalTitle}>Kommentarer</Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setReelsCommentVisible(false);
                        setCommentInput('');
                        setCommentInputFocused(false);
                      }} 
                      style={styles.commentCloseButton}>
                      <Icon name="close" size={22} color="#0F172A" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.commentList}
                    contentContainerStyle={styles.commentListContent}>
                    {activeComments.length === 0 ? (
                      <Text style={styles.commentEmpty}>Ingen kommentarer endnu</Text>
                    ) : (
                      activeComments.map((comment, index) => {
                        const itemKey = activeCommentItem ?? '';
                        const commentId = comment.id || `${itemKey}_comment_${index}`;
                        const commentLike =
                          (itemKey ? commentLikes[itemKey]?.[commentId] : undefined) ??
                          {liked: false, likes: 0};
                        return (
                          <View key={commentId} style={styles.commentRow}>
                            <View style={styles.commentAvatar}>
                              <Text style={styles.commentAvatarText}>
                                {comment.author.charAt(0)}
                              </Text>
                            </View>
                            <View style={{flex: 1}}>
                              <Text style={styles.commentAuthor}>{comment.author}</Text>
                              <Text style={styles.commentBody}>{comment.text}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.commentLikeButton}
                              onPress={() =>
                                activeCommentItem && toggleCommentLike(activeCommentItem, commentId)
                              }
                              activeOpacity={0.7}>
                              <Icon
                                name={commentLike.liked ? 'heart' : 'heart-outline'}
                                size={18}
                                color={commentLike.liked ? '#FF3040' : '#94A3B8'}
                              />
                              <Text style={styles.commentLikeCount}>
                                {commentLike.likes > 0 ? commentLike.likes : '0'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                  <View
                    style={[
                      styles.commentComposer,
                      commentKeyboardHeight > 0
                        ? {bottom: commentKeyboardHeight + safeAreaBottom}
                        : null,
                    ]}>
                    <View style={styles.commentEmojiRow}>
                      {['❤️', '🙌', '🔥', '💪', '🥲', '😍', '😮', '😂'].map(emoji => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.commentEmojiButton}
                          onPress={() => setCommentInput(prev => `${prev}${emoji}`)}>
                          <Text style={styles.commentEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.commentInputRow}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Tilføj en kommentar..."
                        placeholderTextColor="#94A3B8"
                        value={commentInput}
                        onChangeText={setCommentInput}
                        onFocus={() => setCommentInputFocused(true)}
                        onBlur={() => setCommentInputFocused(false)}
                        selectionColor={colors.primary}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                        multiline
                      />
                      <TouchableOpacity
                        style={[
                          styles.commentSendButton,
                          commentInput.trim().length === 0 && styles.commentSendButtonDisabled,
                        ]}
                        onPress={handleReelsSubmitComment}
                        disabled={commentInput.trim().length === 0}>
                        <Icon
                          name="send"
                          size={20}
                          color={commentInput.trim().length === 0 ? '#94A3B8' : '#fff'}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* Reels Share Modal - Same structure as comment modal */}
          {reelsShareVisible && (
            <Modal
              visible={reelsShareVisible}
              transparent
              animationType="slide"
              onRequestClose={() => {
                setReelsShareVisible(false);
                setReelsShareSearch('');
                setReelsShareSearchFocused(false);
              }}>
              <View style={styles.reelsCommentOverlay}>
                <TouchableWithoutFeedback 
                  onPress={() => {
                    setReelsShareVisible(false);
                    setReelsShareSearch('');
                    setReelsShareSearchFocused(false);
                  }}>
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View 
                  style={[
                    styles.reelsCommentSheet,
                    styles.reelsCommentSheetCollapsed,
                    reelsShareKeyboardHeight > 0 
                      ? {paddingBottom: reelsShareKeyboardHeight + safeAreaBottom}
                      : null,
                  ]}>
                  <View style={styles.commentHandle} />
                  <View style={styles.commentHeader}>
                    <Text style={styles.modalTitle}>Videresend til</Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setReelsShareVisible(false);
                        setReelsShareSearch('');
                        setReelsShareSearchFocused(false);
                        Keyboard.dismiss();
                      }} 
                      style={styles.commentCloseButton}>
                      <Icon name="close" size={22} color="#0F172A" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.shareSearchRow}>
                    <Icon name="search" size={18} color="#94A3B8" />
                    <TextInput
                      value={reelsShareSearch}
                      onChangeText={handleReelsShareSearchChange}
                      onFocus={() => {
                        setReelsShareSearchFocused(true);
                        if (reelsShareSearch.trim().length > 0 && !reelsShareVisible) {
                          setReelsShareVisible(true);
                        }
                      }}
                      onBlur={() => setReelsShareSearchFocused(false)}
                      placeholder="Søg"
                      placeholderTextColor="#94A3B8"
                      style={styles.shareSearchInput}
                    />
                  </View>
                <ScrollView 
                  style={styles.shareFriendList}
                  contentContainerStyle={styles.shareFriendListContent}
                  keyboardShouldPersistTaps="handled">
                    {reelsShareSearch.trim() === '' ? (
                      <>
                        {/* Top 5 suggested friends in grid layout */}
                        {MOST_FREQUENT_FRIENDS.length > 0 && (
                          <View style={styles.shareSuggestedList}>
                            {MOST_FREQUENT_FRIENDS.map(friend => {
                            return (
                              <View key={friend.id} style={styles.shareSuggestedItemRow}>
                                <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
                                  <View style={styles.shareSuggestedAvatarContainer}>
                                    <View style={styles.shareSuggestedAvatar}>
                                      <Text style={styles.shareSuggestedAvatarText}>
                                        {friend.name.charAt(0)}
                                      </Text>
                                    </View>
                                    {friend.lastMessage && (
                                      <View style={styles.shareLastMessageBadge}>
                                        <Text style={styles.shareLastMessageText}>{friend.lastMessage}</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.shareSuggestedName} numberOfLines={1}>
                                    {friend.name}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.shareIndividualSendButton}
                                  onPress={() => handleReelsSendShare(friend.id)}
                                  activeOpacity={0.7}>
                                  <Icon name="send" size={18} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                          </View>
                        )}
                        {/* All other friends */}
                        {FRIENDS.filter(f => !MOST_FREQUENT_FRIENDS.find(mf => mf.id === f.id)).length > 0 && (
                          <View style={styles.shareFriendsSection}>
                            {FRIENDS.filter(f => !MOST_FREQUENT_FRIENDS.find(mf => mf.id === f.id)).map(friend => {
                            return (
                              <View key={friend.id} style={styles.shareFriendRow}>
                                <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
                                  <View style={styles.shareFriendAvatar}>
                                    <Text style={styles.shareFriendAvatarText}>
                                      {friend.name.charAt(0)}
                                    </Text>
                                  </View>
                                  <View style={{flex: 1}}>
                                    <Text style={styles.shareFriendName}>{friend.name}</Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={styles.shareIndividualSendButton}
                                  onPress={() => handleReelsSendShare(friend.id)}
                                  activeOpacity={0.7}>
                                  <Icon name="send" size={18} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                          </View>
                        )}
                        {MOST_FREQUENT_FRIENDS.length === 0 && FRIENDS.length === 0 && (
                          <View style={styles.shareEmptyState}>
                            <Text style={styles.shareEmptyText}>Ingen venner at vise</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      /* Search results */
                      filteredFriends.length > 0 ? (
                      filteredFriends.map(friend => {
                        return (
                          <View key={friend.id} style={styles.shareFriendRow}>
                            <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
                              <View style={styles.shareFriendAvatar}>
                                <Text style={styles.shareFriendAvatarText}>
                                  {friend.name.charAt(0)}
                                </Text>
                              </View>
                              <View style={{flex: 1}}>
                                <Text style={styles.shareFriendName}>{friend.name}</Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              style={styles.shareIndividualSendButton}
                              onPress={() => handleReelsSendShare(friend.id)}
                              activeOpacity={0.7}>
                              <Icon name="send" size={18} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        );
                      })
                      ) : (
                        <View style={styles.shareEmptyState}>
                          <Text style={styles.shareEmptyText}>Ingen resultater</Text>
                        </View>
                      )
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
        </Modal>
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
    paddingHorizontal: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  welcomeSection: {
    marginBottom: SECTION_GAP,
    paddingTop: spacing.xs,
  },
  dashboardSection: {
    marginBottom: 0,
  },
  dashboardStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'stretch',
  },
  statCardWrapper: {
    flex: 1,
    minHeight: 96,
  },
  quickActionsGrid: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewCard: {
    marginBottom: spacing.sm,
  },
  localCentersList: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  localCenterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  localCenterCardPressed: {
    opacity: 0.92,
    transform: [{scale: 0.98}],
  },
  localCenterBody: {
    flex: 1,
  },
  localCenterName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  localCenterCounts: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
  },
  localCenterLoading: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  localCenterEmptyCard: {
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  localCenterEmptyTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  localCenterEmptyText: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  localCenterEmptyBtn: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadows.glow,
  },
  localCenterEmptyBtnPressed: {
    opacity: 0.88,
    transform: [{scale: 0.97}],
  },
  localCenterEmptyBtnText: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.white,
    fontWeight: '700',
  },
  activeNowCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  activeNowCounterDotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  activeNowCounterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  activeNowCounterPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  activeNowCounterText: {
    ...typography.body,
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '600',
    flexShrink: 1,
  },
  activeNowHighlightCard: {
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '30',
    ...shadows.sm,
  },
  activityPreviewCard: {
    marginBottom: spacing.sm,
  },
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl + spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyPreviewText: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyPreviewSubtext: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyCta: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    ...shadows.glow,
  },
  emptyCtaPressed: {
    opacity: 0.9,
    transform: [{scale: 0.97}],
  },
  emptyCtaText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  rankGold: {backgroundColor: '#FFD700'},
  rankSilver: {backgroundColor: '#C0C0C0'},
  rankBronze: {backgroundColor: '#CD7F32'},
  leaderboardPreviewValue: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  leaderboardPreviewNameHighlight: {
    color: colors.primary,
    fontWeight: '700',
  },
  onlineUsersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  onlineUserItem: {
    alignItems: 'center',
    width: 64,
    marginBottom: 8,
  },
  onlineUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  onlineUserAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  onlineUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  onlineUserGym: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  onlineUsersListCol: {
    gap: 10,
  },
  activeNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeNowRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  activeNowRowBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  activeNowMessageBtn: {
    padding: 4,
  },
  onlineUserListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  onlineUserAvatarList: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
  },
  onlineUserListBody: {
    flex: 1,
    minWidth: 0,
  },
  onlineUserNameList: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  onlineUserGymList: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  onlineUserSessionList: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  leaderboardPreviewCard: {
    marginBottom: 16,
  },
  leaderboardPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  leaderboardPreviewItem: {
    alignItems: 'center',
  },
  leaderboardPreviewRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  leaderboardPreviewRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  leaderboardPreviewName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  welcomeCta: {
    ...typography.small,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  welcomeText: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  activeFriendsCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  activeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  activeSubtitleText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  activeCountBadge: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  activeCountText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondary,
  },
  activeFriendPreviewRow: {
    flexDirection: 'column',
  },
  activeFriendPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 12,
  },
  activeFriendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activeFriendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  activeFriendInfo: {
    flex: 1,
  },
  activeFriendName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  activeFriendMeta: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  activeFriendMuscleGroups: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 4,
  },
  activeFriendMuscleIcon: {
    width: 20,
    height: 20,
  },
  joinBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  joinBadgeText: {
    color: colors.white,
    fontWeight: '700',
  },
  joinBadgeDisabled: {
    backgroundColor: colors.surface,
  },
  joinBadgeTextDisabled: {
    color: colors.textTertiary,
  },
  checkInButton: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  checkInIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  checkInInfo: {
    flex: 1,
  },
  checkInTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  checkInSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  feedSection: {
    marginTop: 8,
  },
  feedCard: {
    marginBottom: spacing.xl,
    marginHorizontal: HOME_H_PADDING,
    backgroundColor: colors.backgroundCard,
    borderRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
    ...shadows.card,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  feedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  feedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  feedUser: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  feedStreakEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  feedStreakBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
  },
  feedStreakCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  feedStreakEmojiEmphasis: {
    textShadowColor: colors.primary + '44',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 5,
  },
  feedStreakEmojiStrong: {
    textShadowColor: colors.primary + '88',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 8,
  },
  feedTimestamp: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '400',
  },
  feedNoImageCard: {
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    minHeight: 196,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 2,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 6,
  },
  feedNoImageEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EDE9FE',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  feedNoImageDuration: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.4,
  },
  feedNoImageWorkout: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  feedNoImageCenter: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: '#DDD6FE',
    fontWeight: '600',
  },
  feedVideoContainer: {
    width: '100%',
    marginBottom: spacing.md,
    backgroundColor: '#000',
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedVideoThumbnail: {
    width: '100%',
    aspectRatio: 0.833, // 20% mere højde (1 / 1.2 = 0.833)
    backgroundColor: '#000',
  },
  feedVideoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  videoModalClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    padding: 8,
  },
  videoPlayerContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  feedImageText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  feedPhotoContainer: {
    width: '100%',
    backgroundColor: '#0B1220',
    borderRadius: 22,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'visible',
    zIndex: 10,
    elevation: 10,
  },
  feedPhotoMask: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  feedPhoto: {
    width: '100%',
    height: '100%',
  },
  feedPhotoTransform: {
    width: '100%',
    height: '100%',
  },
  feedPhotoRating: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedCardBicepsOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 100,
    elevation: 100,
  },
  feedCardBicepsEmoji: {
    fontSize: 36,
  },
  feedHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warning,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    marginLeft: HOME_H_PADDING,
  },
  feedHighlightText: {
    color: colors.white,
    fontWeight: '600',
  },
  feedSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  feedPhotoMoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  feedHighlightSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '14',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '35',
  },
  feedHighlightSecondaryText: {
    color: colors.primaryDark,
    fontWeight: '600',
    fontSize: 13,
  },
  feedRatingEmoji: {
    fontSize: 16,
  },
  feedMention: {
    color: colors.primary,
    fontWeight: '600',
  },
  feedWorkoutInfo: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.secondary, // Green color
  },
  feedWorkoutInfoLine: {
    display: 'none',
  },
  feedWorkoutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  feedWorkoutChipIcon: {
    fontSize: 14,
  },
  feedWorkoutChipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#065F46',
  },
  feedMuscleIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  feedMuscleIcon: {
    width: 20,
    height: 20,
  },
  feedDescription: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  feedCaptionUser: {
    fontWeight: '700',
    color: colors.text,
  },
  feedHeaderProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: 2,
    paddingBottom: spacing.md,
    zIndex: 1,
  },
  feedActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  feedSocialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedSocialPillActive: {
    backgroundColor: colors.primary + '20',
  },
  feedSocialPillEmoji: {
    fontSize: 14,
  },
  feedSocialPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  feedLikeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  likeButtonCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedSocialCountTap: {
    paddingHorizontal: 2,
  },
  likeButtonInner: {
    position: 'relative',
  },
  likeButtonContent: {
    position: 'relative',
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  likeButtonOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bicepsEmoji: {
    fontSize: 19,
    textDecorationLine: 'none',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  bicepsEmojiLiked: {
    opacity: 1,
    textDecorationLine: 'none',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  burstBiceps: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    top: 0,
  },
  bicepsParticleEmoji: {
    fontSize: 14,
  },
  feedActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  feedActionTextLiked: {
    color: colors.secondary,
  },
  feedCommentPreview: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  feedCommentPreviewAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  feedCommentPreviewText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
    alignItems: 'center',
  },
  activityModal: {
    alignItems: 'stretch',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  activityFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 12,
  },
  activityFriendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityFriendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  activityFriendName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  activityFriendGym: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  activityFriendFocus: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  activityFriendDuration: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.successLight,
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  joinButtonText: {
    color: colors.white,
    fontWeight: '700',
  },
  joinButtonDisabled: {
    backgroundColor: colors.surface,
  },
  joinButtonTextDisabled: {
    color: colors.textTertiary,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 12,
  },
  upcomingName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  upcomingGym: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  upcomingMuscleGroups: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 4,
  },
  upcomingMuscleIcon: {
    width: 20,
    height: 20,
  },
  upcomingTime: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: 6,
  },
  joinButtonSecondary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  joinButtonSecondaryText: {
    color: colors.secondary,
    fontWeight: '700',
  },
  joinButtonSecondaryDisabled: {
    borderColor: colors.border,
  },
  joinButtonSecondaryTextDisabled: {
    color: colors.textMuted,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  commentSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  bicepsListSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    height: '60%',
  },
  commentSheetCollapsed: {
    height: '55%',
  },
  commentSheetExpanded: {
    flex: 1,
  },
  commentHandle: {
    alignSelf: 'center',
    width: 50,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  commentCloseButton: {
    padding: 4,
  },
  commentList: {
    flex: 1,
    marginBottom: 8,
  },
  commentListContent: {
    paddingBottom: 120,
  },
  commentEmpty: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: 20,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  bicepsUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bicepsUserMeta: {
    flex: 1,
  },
  bicepsUserUsername: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  bicepsUserCta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontWeight: '700',
    color: colors.white,
    fontSize: 14,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commentBody: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  commentLikeButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 40,
  },
  commentLikeCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  commentComposer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  commentEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  commentEmojiButton: {
    paddingHorizontal: 2,
  },
  commentEmoji: {
    fontSize: 22,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
    gap: 12,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  commentSendButton: {
    backgroundColor: colors.secondary,
    borderRadius: 999,
    padding: 12,
  },
  commentSendButtonDisabled: {
    backgroundColor: colors.surface,
  },
  modalCloseButton: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: colors.secondary, // Green color
    fontSize: 16,
    fontWeight: '600',
  },
  suggestedFriendsCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: SECTION_GAP,
    marginHorizontal: HOME_H_PADDING,
    ...shadows.sm,
  },
  suggestedFriendsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  suggestedFriendsList: {
    paddingRight: HOME_H_PADDING,
  },
  suggestedFriendCard: {
    width: 140,
    marginRight: 12,
    alignItems: 'center',
  },
  suggestedFriendAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestedFriendAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  suggestedFriendAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.white,
  },
  suggestedFriendName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  suggestedFriendMutual: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 6,
    textAlign: 'center',
  },
  suggestedFriendGyms: {
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 32,
  },
  suggestedFriendGym: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 2,
  },
  suggestedFriendAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary, // Purple background for "Tilføj" button
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  suggestedFriendAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  suggestedFriendAddButtonAdded: {
    backgroundColor: colors.success,
  },
  suggestedFriendAddTextAdded: {
    color: colors.white,
  },
  reelsModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  reelsHeartAnimation: {
    position: 'absolute',
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 1000,
  },
  reelsCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 100,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  reelsScrollView: {
    flex: 1,
  },
  reelsVideoContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    backgroundColor: '#000',
    position: 'relative',
  },
  reelsVideo: {
    width: '100%',
    height: '100%',
  },
  reelsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  reelsContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
    paddingRight: 16,
  },
  reelsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reelsProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reelsAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelsAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  reelsUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  reelsDescription: {
    marginBottom: 8,
  },
  reelsDescriptionText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  reelsLikesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  reelsLikesAvatars: {
    flexDirection: 'row',
    marginRight: 4,
  },
  reelsLikesAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  reelsLikesAvatarFirst: {
    zIndex: 2,
  },
  reelsLikesAvatarSecond: {
    marginLeft: -8,
    zIndex: 1,
  },
  reelsLikesAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  reelsLikesText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '400',
  },
  reelsCommentInputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  reelsCommentInputText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  reelsActions: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 24,
    marginRight: 0,
    paddingBottom: 140,
    position: 'relative',
  },
  reelsActionButton: {
    alignItems: 'center',
    gap: 4,
  },
  reelsActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  reelsCommentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  reelsCommentSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '90%',
    minHeight: '50%',
  },
  reelsCommentSheetCollapsed: {
    height: '50%',
  },
  reelsCommentSheetExpanded: {
    flex: 1,
  },
  reelsShareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  reelsShareSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  shareSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  shareSearchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  shareCreateGroupButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFriendList: {
    flex: 1,
    minHeight: 200,
  },
  shareFriendListContent: {
    paddingBottom: 20,
    paddingTop: 8,
  },
  shareEmptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareEmptyText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '500',
  },
  shareSuggestedList: {
    marginBottom: 20,
  },
  shareSuggestedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  shareSuggestedItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareSuggestedAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  shareSuggestedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareSuggestedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  shareLastMessageBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.backgroundCard,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: '#000',
  },
  shareLastMessageText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  shareSuggestedName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  shareSelectedIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  shareFriendsSection: {
    marginTop: 8,
  },
  shareFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    justifyContent: 'space-between',
  },
  shareFriendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareFriendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  shareFriendName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  shareIndividualSendButton: {
    backgroundColor: colors.secondary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSendButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  shareSendButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});

export default HomeScreen;

