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
  Modal,
  Alert,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  TextInput,
  Animated,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Reanimated, {useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS} from 'react-native-reanimated';
import Video from 'react-native-video';
import {useAppStore} from '@/store/appStore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import NotificationService from '@/services/notifications/NotificationService';
import {useFeedStore, FeedItem} from '@/store/feedStore';
import {getMuscleGroupImage} from '@/utils/muscleGroupImages';
import {MuscleGroup} from '@/types/workout.types';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';
import RenderTextWithMentions from '@/components/RenderTextWithMentions';
import {MOCK_FRIENDS} from '@/data/mockFriends';
import {Card, EmptyState} from '@/components/ui';

type HomeScreenNavigationProp = StackNavigationProp<any>;
type FeedComment = {
  id: string;
  author: string;
  text: string;
  likes: number;
  likedByUser: boolean;
};

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const {user} = useAppStore();
  const {bottom: safeAreaBottom} = useSafeAreaInsets();
  const {feedItems, deleteFeedItem} = useFeedStore();
  const userBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [addedFriends, setAddedFriends] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [activeJoinRequests, setActiveJoinRequests] = useState<string[]>([]);
  const [upcomingJoinRequests, setUpcomingJoinRequests] = useState<string[]>([]);
  const [feedReactions, setFeedReactions] = useState<Record<string, {liked: boolean; likes: number}>>({});
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentsByFeedItem, setCommentsByFeedItem] = useState<Record<string, FeedComment[]>>({});
  const [commentedItems, setCommentedItems] = useState<string[]>([]);
  const [commentInputFocused, setCommentInputFocused] = useState(false);
  const [animatingItems, setAnimatingItems] = useState<Record<string, boolean>>({});
  const [videoAspectRatios, setVideoAspectRatios] = useState<Record<string, number>>({});
  const [expandedReels, setExpandedReels] = useState<Record<string, boolean>>({});
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [reelsModalVisible, setReelsModalVisible] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const reelsListRef = useRef<FlatList<FeedItem>>(null);
  const [activeFeedVideoId, setActiveFeedVideoId] = useState<string | null>(null);
  const activeFeedVideoIdRef = useRef<string | null>(null);
  const scrollYRef = useRef(0);
  const videoLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const reelTranslateX = useSharedValue(0);
  const reelsSwipeStyle = useAnimatedStyle(() => ({
    transform: [{translateX: reelTranslateX.value}],
  }));
  const reelSwipeEnabled = !commentModalVisible && !shareModalVisible;
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
  const feedCardLayouts = useRef<Record<string, {width: number; height: number}>>({});
  const feedActionsLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const likeButtonLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const feedPhotoLayouts = useRef<Record<string, {x: number; y: number; width: number; height: number}>>({});
  const videoFeedItems = useMemo(() => feedItems.filter(item => item.videoUri), [feedItems]);
  const videoFeedIds = useMemo(() => videoFeedItems.map(item => item.id), [videoFeedItems]);
  const windowHeight = Dimensions.get('window').height;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeFriends = useMemo(() => [], []);

  const upcomingSessions = useMemo(() => [], []);

  const activeCount = activeFriends.length;

  const formatActiveDuration = (startTimestamp: number) => {
    const diffMinutes = Math.max(1, Math.floor((now - startTimestamp) / 60000));
    if (diffMinutes >= 60) {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}t ${minutes}m`;
    }
    return `${diffMinutes} min`;
  };

  const formatUpcomingDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const day = date.toLocaleDateString('da-DK', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const time = date.toLocaleTimeString('da-DK', {hour: '2-digit', minute: '2-digit'});
    return `${day} • kl. ${time}`;
  };

  const getReelDescription = (text?: string) => {
    if (!text) {
      return '';
    }
    return text
      .split('\n')
      .filter(line => !line.trim().toLowerCase().startsWith('ny pr i'))
      .join('\n')
      .trim();
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
    
    return groups.length > 0 ? groups : ['hele_kroppen'];
  };

  const handleJoinActive = (friendName: string, friendId: string) => {
    if (activeJoinRequests.includes(friendId)) {
      // Remove request
      setActiveJoinRequests(prev => prev.filter(id => id !== friendId));
    } else {
      // Add request
      setActiveJoinRequests(prev => [...prev, friendId]);
    }
  };

  const handleJoinUpcoming = (friendName: string, sessionId: string) => {
    if (upcomingJoinRequests.includes(sessionId)) {
      // Remove request
      setUpcomingJoinRequests(prev => prev.filter(id => id !== sessionId));
    } else {
      // Add request
      setUpcomingJoinRequests(prev => [...prev, sessionId]);
    }
  };

  const handleAddFriend = (friendId: string, friendName: string) => {
    if (!addedFriends.includes(friendId)) {
      setAddedFriends(prev => [...prev, friendId]);
      const requesterName = user?.name || 'Du';
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

  const suggestedFriends = useMemo(
    () => [
      {
        id: 'suggest_1',
        name: 'Lars',
        avatar: null,
        mutualFriends: 3,
        gyms: ['PureGym Fields', 'Repeat Fitness'],
      },
      {
        id: 'suggest_2',
        name: 'Sofia',
        avatar: null,
        mutualFriends: 5,
        gyms: ['Urban Gym', 'PureGym Vanløse'],
      },
      {
        id: 'suggest_3',
        name: 'Thomas',
        avatar: null,
        mutualFriends: 2,
        gyms: ['Repeat Fitness Nørrebro'],
      },
      {
        id: 'suggest_4',
        name: 'Emma',
        avatar: null,
        mutualFriends: 4,
        gyms: ['PureGym Fields', 'Urban Gym'],
      },
      {
        id: 'suggest_5',
        name: 'Mikkel',
        avatar: null,
        mutualFriends: 1,
        gyms: ['Repeat Fitness Frederiksberg'],
      },
      {
        id: 'suggest_6',
        name: 'Anna',
        avatar: null,
        mutualFriends: 6,
        gyms: ['PureGym Vanløse', 'Urban Gym'],
      },
      {
        id: 'suggest_7',
        name: 'Oliver',
        avatar: null,
        mutualFriends: 3,
        gyms: ['Repeat Fitness Nørrebro', 'PureGym Fields'],
      },
      {
        id: 'suggest_8',
        name: 'Ida',
        avatar: null,
        mutualFriends: 2,
        gyms: ['Urban Gym Christianshavn'],
      },
    ],
    [],
  );

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

  const toggleLike = (itemId: string, skipParticles = false) => {
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

  const feedReactionsRef = useRef(feedReactions);
  useEffect(() => {
    feedReactionsRef.current = feedReactions;
  }, [feedReactions]);

  const toggleLikeRef = useRef(toggleLike);
  useEffect(() => {
    toggleLikeRef.current = toggleLike;
  }, [toggleLike]);

  useEffect(() => {
    activeFeedVideoIdRef.current = activeFeedVideoId;
  }, [activeFeedVideoId]);

  const likeOnly = useCallback((itemId: string, skipParticles = false) => {
    const liked = feedReactionsRef.current[itemId]?.liked ?? false;
    if (!liked) {
      toggleLikeRef.current(itemId, skipParticles);
    }
  }, []);

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

  const handleVideoDoubleTap = useCallback(
    (itemId: string, tapX: number, tapY: number) => {
      const wasLiked = feedReactionsRef.current[itemId]?.liked ?? false;
      likeOnly(itemId, true);
      const videoLayout = videoLayouts.current[itemId];
      const startX = videoLayout ? videoLayout.x + tapX : undefined;
      const startY = videoLayout ? videoLayout.y + tapY : undefined;
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
          }, 250);
        }
      }
    },
    [likeOnly, runOverlayAnimation, ensureBicepsAnimation, runBicepsAnimation],
  );

  const updateActiveFeedVideo = useCallback(
    (scrollY: number) => {
      if (reelsModalVisible || videoFeedIds.length === 0) {
        if (activeFeedVideoIdRef.current) {
          setActiveFeedVideoId(null);
        }
        return;
      }
      let bestId: string | null = null;
      let bestRatio = 0;
      const viewportTop = scrollY;
      const viewportBottom = scrollY + windowHeight;
      videoFeedIds.forEach(id => {
        const layout = videoLayouts.current[id];
        if (!layout) {
          return;
        }
        const itemTop = layout.y;
        const itemBottom = layout.y + layout.height;
        const visible = Math.min(viewportBottom, itemBottom) - Math.max(viewportTop, itemTop);
        const ratio = visible > 0 ? visible / layout.height : 0;
        if (ratio >= 0.3 && ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      });
      if (bestId !== activeFeedVideoIdRef.current) {
        setActiveFeedVideoId(bestId);
      }
    },
    [reelsModalVisible, videoFeedIds, windowHeight],
  );

  const handleFeedScroll = useCallback(
    (event: any) => {
      const currentY = event.nativeEvent.contentOffset.y;
      scrollYRef.current = currentY;
      updateActiveFeedVideo(currentY);
    },
    [updateActiveFeedVideo],
  );

  const openReels = useCallback(
    (itemId: string) => {
      if (videoFeedItems.length === 0) {
        return;
      }
      const index = videoFeedItems.findIndex(item => item.id === itemId);
      const safeIndex = index >= 0 ? index : 0;
      setActiveReelIndex(safeIndex);
      setActiveReelId(videoFeedItems[safeIndex]?.id ?? null);
      setReelsModalVisible(true);
      setActiveFeedVideoId(null);
    },
    [videoFeedItems],
  );

  const closeReels = useCallback(() => {
    setReelsModalVisible(false);
    setActiveReelId(null);
    reelTranslateX.value = 0;
  }, [reelTranslateX]);

  const toggleReelDescription = (itemId: string) => {
    setExpandedReels(prev => ({...prev, [itemId]: !prev[itemId]}));
  };

  const handleSendShare = (friendName: string) => {
    setShareModalVisible(false);
    setShareSearch('');
    Alert.alert('Sendt', `Videoen er sendt til ${friendName}.`);
  };

  const openProfile = useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);

  const openComments = (itemId: string) => {
    setActiveCommentItem(itemId);
    setCommentInput('');
    setCommentInputFocused(false);
    setCommentModalVisible(true);
  };

  const closeComments = () => {
    setCommentModalVisible(false);
    setActiveCommentItem(null);
    setCommentInput('');
    setCommentInputFocused(false);
  };

  useEffect(() => {
    if (!commentModalVisible) {
      return;
    }
    const showSub = Keyboard.addListener('keyboardWillShow', event => {
      setCommentKeyboardHeight(event?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setCommentKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [commentModalVisible]);

  useEffect(() => {
    if (!reelsModalVisible) {
      requestAnimationFrame(() => updateActiveFeedVideo(scrollYRef.current));
      return;
    }
    if (videoFeedItems.length === 0) {
      return;
    }
    const safeIndex = Math.min(activeReelIndex, videoFeedItems.length - 1);
    requestAnimationFrame(() => {
      reelsListRef.current?.scrollToIndex({index: safeIndex, animated: false});
    });
  }, [reelsModalVisible, activeReelIndex, videoFeedItems.length, updateActiveFeedVideo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateActiveFeedVideo(scrollYRef.current);
    }, 200);
    return () => clearTimeout(timer);
  }, [videoFeedIds.length, updateActiveFeedVideo]);

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
    setCommentsByFeedItem(prev => ({
      ...prev,
      [activeCommentItem]: [
        ...(prev[activeCommentItem] ?? []),
        {
          id: `comment_${Date.now()}`,
          author: authorName,
          text: trimmed,
          likes: 0,
          likedByUser: false,
        },
      ],
    }));
    setCommentedItems(prev =>
      prev.includes(activeCommentItem) ? prev : [...prev, activeCommentItem],
    );
    setCommentInput('');
  };

  const toggleCommentLike = (feedItemId: string, commentId: string) => {
    setCommentsByFeedItem(prev => {
      const currentComments = prev[feedItemId] ?? [];
      return {
        ...prev,
        [feedItemId]: currentComments.map(comment => {
          if (comment.id !== commentId) {
            return comment;
          }
          const nextLiked = !comment.likedByUser;
          return {
            ...comment,
            likedByUser: nextLiked,
            likes: Math.max(0, comment.likes + (nextLiked ? 1 : -1)),
          };
        }),
      };
    });
  };

  const activeComments = activeCommentItem ? commentsByFeedItem[activeCommentItem] ?? [] : [];
  const [commentKeyboardHeight, setCommentKeyboardHeight] = useState(0);
  const reelViewabilityConfig = useRef({itemVisiblePercentThreshold: 80}).current;
  const onReelViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: Array<{item: FeedItem; index?: number}>}) => {
      if (viewableItems.length > 0) {
        const first = viewableItems[0];
        setActiveReelId(first.item.id);
        if (typeof first.index === 'number') {
          setActiveReelIndex(first.index);
        }
      }
    },
  ).current;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={handleFeedScroll}
        onContentSizeChange={() => updateActiveFeedVideo(scrollYRef.current)}
        scrollEventThrottle={16}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Hej, {user?.displayName}! 👋</Text>
          <Text style={styles.subtitle}>Klar til at træne i dag?</Text>
        </View>

        {/* Active Friends */}
        <TouchableOpacity
          style={[styles.activeFriendsCard, {marginHorizontal: 16}]}
          activeOpacity={0.85}
          onPress={() => setActivityModalVisible(true)}>
          <View style={styles.activeCardHeader}>
            <View>
              <Text style={styles.activeTitle}>Venner i gym lige nu</Text>
              <Text style={styles.activeSubtitleText}>Tryk for at se flere detaljer</Text>
          </View>
            <View style={styles.activeCountBadge}>
              <Text style={styles.activeCountText}>{activeCount}</Text>
          </View>
          </View>
          <View style={styles.activeFriendPreviewRow}>
            {activeFriends.slice(0, 3).map(friend => (
              <View key={friend.id} style={styles.activeFriendPreview}>
                <View style={styles.activeFriendAvatar}>
                  <Text style={styles.activeFriendAvatarText}>{friend.name.charAt(0)}</Text>
                </View>
                <View style={styles.activeFriendInfo}>
                  <Text style={styles.activeFriendName}>{friend.name}</Text>
                  <Text style={styles.activeFriendMeta}>
                    {friend.gym} • {formatActiveDuration(friend.startTimestamp)}
                  </Text>
                  <View style={styles.activeFriendMuscleGroups}>
                    {getMuscleGroupsFromFocus(friend.focus).map((muscleGroup, idx) => (
                      <Image
                        key={idx}
                        source={getMuscleGroupImage(muscleGroup)}
                        style={styles.activeFriendMuscleIcon}
                        resizeMode="contain"
                      />
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.joinBadge,
                    activeJoinRequests.includes(friend.id) && styles.joinBadgeDisabled,
                  ]}
                  onPress={() => handleJoinActive(friend.name, friend.id)}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.joinBadgeText,
                      activeJoinRequests.includes(friend.id) && styles.joinBadgeTextDisabled,
                    ]}>
                    {activeJoinRequests.includes(friend.id) ? 'Anmodet' : 'Deltag'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Feed */}
        <React.Fragment>
        {feedItems.length === 0 ? (
          <EmptyState
            icon="fitness-outline"
            title="Ingen træninger endnu"
            message="Dine venner har endnu ikke delt nogen træninger. Start med at tjekke ind på et gym!"
            actionLabel="Tjek ind på gym"
            onAction={() => navigation.navigate('CheckIn')}
          />
        ) : (
          feedItems.map(item => {
            // Ensure animation is initialized
            const likeAnim = ensureBicepsAnimation(item.id);
            const overlayAnim = ensureOverlayAnimation(item.id);
            const likeScaleStyle = likeAnim
              ? {transform: [{scale: likeAnim.scale}]}
              : undefined;
            const particles = likeAnim?.particles ?? [];
            const hasCommented = commentedItems.includes(item.id);
            const commentColor = hasCommented ? colors.primary : colors.text;
            const isLiked = feedReactions[item.id]?.liked ?? false;
            const likeColor = isLiked ? colors.primary : colors.text;
            const isAnimating = animatingItems[item.id];
            const hasVideo = Boolean(item.videoUri);
            const isVideoActive = activeFeedVideoId === item.id;
            return (
              <View
                key={item.id}
                style={styles.feedCard}
                onLayout={event => {
                  const {width, height} = event.nativeEvent.layout;
                  feedCardLayouts.current[item.id] = {width, height};
                }}>
              <View style={styles.feedCardHeader}>
                <TouchableOpacity
                  style={styles.feedHeaderProfile}
                  onPress={openProfile}
                  activeOpacity={0.8}>
                  <View style={styles.feedAvatar}>
                    <Text style={styles.feedAvatarText}>{item.user.charAt(0)}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.feedUser}>{item.user}</Text>
                    <Text style={styles.feedTimestamp}>{item.timestamp}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleFeedItemMenu(item.id, item.user)}
                  activeOpacity={0.7}>
                  <Icon name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {item.workoutInfo && (
                <Text style={styles.feedWorkoutInfoLine}>{item.workoutInfo}</Text>
              )}
              {hasVideo ? (
                <GestureDetector
                  gesture={Gesture.Exclusive(
                    Gesture.Tap()
                      .numberOfTaps(2)
                      .maxDelay(250)
                      .onEnd(event => {
                        runOnJS(handleVideoDoubleTap)(item.id, event.x, event.y);
                      }),
                    Gesture.Tap()
                      .numberOfTaps(1)
                      .onEnd(() => {
                        runOnJS(openReels)(item.id);
                      }),
                  )}>
                  <View
                    style={[
                      styles.feedVideoContainer,
                      {aspectRatio: videoAspectRatios[item.id] ?? 1},
                    ]}
                    onLayout={event => {
                      const {x, y, width, height} = event.nativeEvent.layout;
                      videoLayouts.current[item.id] = {x, y, width, height};
                      updateActiveFeedVideo(scrollYRef.current);
                    }}>
                    <Video
                      source={{uri: item.videoUri!}}
                      style={styles.feedVideo}
                      resizeMode="cover"
                      paused={!isVideoActive}
                      muted
                      repeat
                      playInBackground={false}
                      playWhenInactive={false}
                      poster={item.videoThumbnailUri}
                      posterResizeMode="cover"
                      onLoad={({naturalSize}) => {
                        if (!naturalSize?.width || !naturalSize?.height) {
                          return;
                        }
                        const ratio = naturalSize.width / naturalSize.height;
                        setVideoAspectRatios(prev =>
                          prev[item.id] === ratio ? prev : {...prev, [item.id]: ratio},
                        );
                      }}
                      onError={() => {
                        Alert.alert('Fejl', 'Kunne ikke afspille videoen.');
                      }}
                    />
                    <View style={styles.feedVideoTapHint}>
                      <Icon name="play" size={22} color="#fff" />
                    </View>
                  </View>
                </GestureDetector>
              ) : (
                item.type === 'photo' && (
                  <FeedPhoto
                    item={item}
                    onDoubleTapLike={handlePhotoDoubleTap}
                    onLayoutMeasured={(id, layout) => {
                      feedPhotoLayouts.current[id] = layout;
                    }}
                    userBicepsEmoji={userBicepsEmoji}
                  />
                )
              )}
              {item.type === 'pr' && (
                <View style={styles.feedHighlight}>
                  <Icon name="trophy" size={18} color={colors.warning} />
                  <Text style={styles.feedHighlightText}>Ny PR</Text>
                </View>
              )}
              {item.type === 'summary' && (
                <View style={styles.feedSummaryRow}>
                  <View style={styles.feedHighlightSecondary}>
                    {item.rating && item.rating >= 1 && item.rating <= 5 ? (
                      <Text style={styles.feedRatingEmoji}>
                        {['☹️', '🙁', '😐', '😁', '🤩'][item.rating - 1]}
                      </Text>
                    ) : (
                      <Text style={styles.feedRatingEmoji}>{userBicepsEmoji}</Text>
                    )}
                    <Text style={styles.feedHighlightSecondaryText}>Session delt</Text>
                  </View>
                  {item.muscles && item.muscles.length > 0 && (
                    <View style={styles.feedMuscleIconsRow}>
                      {item.muscles.map(muscle => (
                        <Image
                          key={muscle}
                          source={getMuscleGroupImage(muscle)}
                          style={styles.feedMuscleIcon}
                          resizeMode="contain"
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
              {item.description &&
                item.description.trim().length > 0 &&
                item.description.trim() !== (item.workoutInfo ?? '').trim() && (
                <RenderCaptionWithMentions
                  text={item.description}
                  mentionedUsers={item.mentionedUsers}
                  friends={MOCK_FRIENDS}
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
                      styles.feedLikeButton,
                      isLiked && styles.feedLikeButtonActive,
                    ]}
                    onPress={() => toggleLike(item.id)}
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
                  <View style={styles.feedActionTextContainer}>
                    <Text
                      style={[
                        styles.feedActionText,
                        isLiked && styles.feedActionTextLiked,
                      ]}>
                      {feedReactions[item.id]?.likes ?? 0}
                    </Text>
                  </View>
                </View>
                <View style={styles.feedActionGroup}>
                  <TouchableOpacity
                    style={styles.feedActionButton}
                    onPress={() => openComments(item.id)}
                    activeOpacity={0.8}>
                    <Icon name="chatbubble-outline" size={20} color={commentColor} />
                  </TouchableOpacity>
                  <View style={styles.feedActionTextContainer}>
                    <Text
                      style={[
                        styles.feedActionText,
                        hasCommented && styles.feedActionTextLiked,
                      ]}>
                      {commentsByFeedItem[item.id]?.length ?? 0}
                    </Text>
                  </View>
                </View>
              </View>
              </View>
            );
          })
        )}
        </React.Fragment>

        {/* Suggested Friends Section */}
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

      </ScrollView>

      {!reelsModalVisible && (
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
                      activeComments.map(comment => (
                        <View key={comment.id} style={styles.commentRow}>
                          <View style={styles.commentAvatar}>
                            <Text style={styles.commentAvatarText}>
                              {comment.author.charAt(0)}
                            </Text>
                          </View>
                          <View style={styles.commentContent}>
                            <Text style={styles.commentAuthor}>{comment.author}</Text>
                            <Text style={styles.commentBody}>{comment.text}</Text>
                          </View>
                          <View style={styles.commentLikeColumn}>
                            <TouchableOpacity
                              style={styles.commentLikeButton}
                              onPress={() => toggleCommentLike(activeCommentItem!, comment.id)}
                              activeOpacity={0.8}>
                              <Icon
                                name={comment.likedByUser ? 'heart' : 'heart-outline'}
                                size={16}
                                color={comment.likedByUser ? colors.primary : '#94A3B8'}
                              />
                            </TouchableOpacity>
                            <Text
                              style={[
                                styles.commentLikeCount,
                                comment.likedByUser && styles.commentLikeCountActive,
                              ]}>
                              {comment.likes}
                            </Text>
                          </View>
                        </View>
                      ))
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
      )}

      <Modal visible={activityModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setActivityModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.activityModal]}>
                <Text style={styles.modalTitle}>Venner i gym</Text>
                <ScrollView style={{width: '100%'}} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSectionLabel}>Aktive lige nu</Text>
              {activeFriends.map(friend => (
                <View key={friend.id} style={styles.activityFriendRow}>
                  <View style={styles.activityFriendAvatar}>
                    <Text style={styles.activityFriendAvatarText}>{friend.name.charAt(0)}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.activityFriendName}>{friend.name}</Text>
                    <Text style={styles.activityFriendGym}>{friend.gym}</Text>
                    <View style={styles.activeFriendMuscleGroups}>
                      {getMuscleGroupsFromFocus(friend.focus).map((muscleGroup, idx) => (
                        <Image
                          key={idx}
                          source={getMuscleGroupImage(muscleGroup)}
                          style={styles.activeFriendMuscleIcon}
                          resizeMode="contain"
                        />
                      ))}
                    </View>
                    <Text style={styles.activityFriendDuration}>
                      Aktiv i {formatActiveDuration(friend.startTimestamp)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.joinButton,
                      activeJoinRequests.includes(friend.id) && styles.joinButtonDisabled,
                    ]}
                    onPress={() => handleJoinActive(friend.name, friend.id)}
                    activeOpacity={0.85}>
                    <Text
                      style={[
                        styles.joinButtonText,
                        activeJoinRequests.includes(friend.id) && styles.joinButtonTextDisabled,
                      ]}>
                      {activeJoinRequests.includes(friend.id) ? 'Anmodet' : 'Deltag'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={[styles.modalSectionLabel, {marginTop: 24}]}>Kommende træninger</Text>
              {upcomingSessions.map(session => (
                <View key={session.id} style={styles.upcomingRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.upcomingName}>{session.name}</Text>
                    <Text style={styles.upcomingGym}>{session.gym}</Text>
                    <View style={styles.upcomingMuscleGroups}>
                      {getMuscleGroupsFromFocus(session.focus).map((muscleGroup, idx) => (
                        <Image
                          key={idx}
                          source={getMuscleGroupImage(muscleGroup)}
                          style={styles.upcomingMuscleIcon}
                          resizeMode="contain"
                        />
                      ))}
                    </View>
                    <Text style={styles.upcomingTime}>{formatUpcomingDate(session.scheduledAt)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.joinButtonSecondary,
                      upcomingJoinRequests.includes(session.id) && styles.joinButtonSecondaryDisabled,
                    ]}
                    onPress={() => handleJoinUpcoming(session.name, session.id)}
                    activeOpacity={0.85}>
                    <Text
                      style={[
                        styles.joinButtonSecondaryText,
                        upcomingJoinRequests.includes(session.id) && styles.joinButtonSecondaryTextDisabled,
                      ]}>
                      {upcomingJoinRequests.includes(session.id) ? 'Anmodet' : 'Deltag'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setActivityModalVisible(false)}>
                  <Text style={styles.modalCloseText}>Luk</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Reels Modal */}
      <Modal
        visible={reelsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReels}>
        <GestureDetector
          gesture={Gesture.Pan()
            .activeOffsetX([-80, 80])
            .failOffsetY([-20, 20])
            .minDistance(60)
            .enabled(reelSwipeEnabled)
            .onUpdate(event => {
              if (Math.abs(event.translationX) > 0) {
                reelTranslateX.value = event.translationX;
              }
            })
            .onEnd(event => {
              if (event.translationX < -80 || event.translationX > 80) {
                runOnJS(closeReels)();
              } else {
                reelTranslateX.value = withTiming(0);
              }
            })}>
          <Reanimated.View style={[styles.reelsModalContainer, reelsSwipeStyle]}>
            <TouchableOpacity
              style={styles.reelsCloseButton}
              onPress={closeReels}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <FlatList
              ref={reelsListRef}
              data={videoFeedItems}
              keyExtractor={item => item.id}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onReelViewableItemsChanged}
              viewabilityConfig={reelViewabilityConfig}
              getItemLayout={(_, index) => ({
                length: windowHeight,
                offset: windowHeight * index,
                index,
              })}
              onScrollToIndexFailed={({index}) => {
                reelsListRef.current?.scrollToOffset({offset: windowHeight * index, animated: false});
              }}
              renderItem={({item}) => {
                const likeAnim = ensureBicepsAnimation(item.id);
                const isExpanded = expandedReels[item.id];
                const reelDescription = getReelDescription(item.description);
                const previewLimit = 18;
                const shouldTruncate = reelDescription.length > previewLimit;
                const displayDescription =
                  isExpanded || !shouldTruncate
                    ? reelDescription
                    : reelDescription.slice(0, previewLimit).trimEnd();
                const hasLiked = feedReactions[item.id]?.liked ?? false;
                const hasReelComments = (commentsByFeedItem[item.id]?.length ?? 0) > 0;
                const doubleTapReel = Gesture.Tap()
                  .numberOfTaps(2)
                  .maxDelay(250)
                  .onEnd(() => {
                    runOnJS(likeOnly)(item.id, true);
                    runOnJS(runBicepsAnimation)(item.id, false);
                  });
                return (
                  <View style={[styles.reelItem, {height: windowHeight}]}>
                    <GestureDetector gesture={doubleTapReel}>
                      <View style={StyleSheet.absoluteFill}>
                        <Video
                          source={{uri: item.videoUri!}}
                          style={styles.reelVideo}
                          resizeMode="cover"
                          paused={activeReelId !== item.id}
                          repeat
                          muted={false}
                          playInBackground={false}
                          playWhenInactive={false}
                          onError={() => Alert.alert('Fejl', 'Kunne ikke afspille videoen.')}
                        />
                      </View>
                    </GestureDetector>
                    <View style={styles.reelOverlay} pointerEvents="box-none">
                      <View style={styles.reelLeft} pointerEvents="box-none">
                        <Text style={styles.reelUsername}>{item.user}</Text>
                        {item.workoutInfo ? (
                          <Text style={styles.reelMeta}>{item.workoutInfo}</Text>
                        ) : null}
                        {displayDescription ? (
                          <Text
                            style={styles.reelDescription}
                            numberOfLines={isExpanded ? 0 : 1}
                            ellipsizeMode="clip">
                            {displayDescription}
                            {shouldTruncate ? (
                              <Text
                                style={styles.reelSeeMore}
                                onPress={() => toggleReelDescription(item.id)}>
                                {isExpanded ? ' Skjul' : ' Se mere'}
                              </Text>
                            ) : null}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.reelRight} pointerEvents="box-none">
                        <TouchableOpacity
                          style={styles.reelActionButton}
                          onPress={() => toggleLike(item.id)}
                          activeOpacity={0.8}>
                          <Animated.View style={{transform: [{scale: likeAnim.scale}]}}>
                            <Text
                              style={[
                                styles.reelActionEmoji,
                                hasLiked && styles.reelActionEmojiLiked,
                              ]}>
                              {hasLiked ? userBicepsEmoji : '💪'}
                            </Text>
                          </Animated.View>
                        </TouchableOpacity>
                        <Text
                          style={[
                            styles.reelActionCount,
                            hasLiked && styles.reelActionCountActive,
                          ]}>
                          {feedReactions[item.id]?.likes ?? 0}
                        </Text>
                        <TouchableOpacity
                          style={styles.reelActionButton}
                          onPress={() => openComments(item.id)}
                          activeOpacity={0.8}>
                          <Icon name="chatbubble" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text
                          style={[
                            styles.reelActionCount,
                            hasReelComments && styles.reelActionCountActive,
                          ]}>
                          {commentsByFeedItem[item.id]?.length ?? 0}
                        </Text>
                        <TouchableOpacity
                          style={styles.reelActionButton}
                          onPress={() => setShareModalVisible(true)}
                          activeOpacity={0.8}>
                          <Icon name="paper-plane" size={22} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
            {commentModalVisible && (
              <View style={styles.reelSheetOverlay}>
                <TouchableWithoutFeedback onPress={closeComments}>
                  <View style={styles.bottomSheetOverlay}>
                    <TouchableWithoutFeedback>
                      <View
                        style={[
                          styles.commentSheet,
                          commentInputFocused
                            ? styles.commentSheetExpanded
                            : styles.commentSheetCollapsed,
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
                            activeComments.map(comment => (
                              <View key={comment.id} style={styles.commentRow}>
                                <View style={styles.commentAvatar}>
                                  <Text style={styles.commentAvatarText}>
                                    {comment.author.charAt(0)}
                                  </Text>
                                </View>
                                <View style={styles.commentContent}>
                                  <Text style={styles.commentAuthor}>{comment.author}</Text>
                                  <Text style={styles.commentBody}>{comment.text}</Text>
                                </View>
                                <View style={styles.commentLikeColumn}>
                                  <TouchableOpacity
                                    style={styles.commentLikeButton}
                                    onPress={() => toggleCommentLike(activeCommentItem!, comment.id)}
                                    activeOpacity={0.8}>
                                    <Icon
                                      name={comment.likedByUser ? 'heart' : 'heart-outline'}
                                      size={16}
                                      color={comment.likedByUser ? colors.primary : '#94A3B8'}
                                    />
                                  </TouchableOpacity>
                                  <Text
                                    style={[
                                      styles.commentLikeCount,
                                      comment.likedByUser && styles.commentLikeCountActive,
                                    ]}>
                                    {comment.likes}
                                  </Text>
                                </View>
                              </View>
                            ))
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
              </View>
            )}
            {shareModalVisible && (
              <View style={styles.reelSheetOverlay}>
                <TouchableWithoutFeedback onPress={() => setShareModalVisible(false)}>
                  <View style={styles.shareOverlay}>
                    <TouchableWithoutFeedback>
                      <View style={styles.shareSheet}>
                        <View style={styles.shareHandle} />
                        <View style={styles.shareSearchRow}>
                          <Icon name="search" size={18} color="#94A3B8" />
                          <TextInput
                            value={shareSearch}
                            onChangeText={setShareSearch}
                            placeholder="Søg"
                            placeholderTextColor="#94A3B8"
                            style={styles.shareSearchInput}
                          />
                        </View>
                        <ScrollView style={styles.shareFriendList}>
                          {FRIENDS.filter(friend =>
                            friend.name.toLowerCase().includes(shareSearch.trim().toLowerCase()),
                          ).map(friend => (
                            <TouchableOpacity
                              key={friend.id}
                              style={styles.shareFriendRow}
                              onPress={() => handleSendShare(friend.name)}
                              activeOpacity={0.85}>
                              <View style={styles.shareFriendAvatar}>
                                <Text style={styles.shareFriendAvatarText}>
                                  {friend.name.charAt(0)}
                                </Text>
                              </View>
                              <View style={{flex: 1}}>
                                <Text style={styles.shareFriendName}>{friend.name}</Text>
                              </View>
                              <View style={styles.shareFriendButton}>
                                <Text style={styles.shareFriendButtonText}>Send</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </TouchableWithoutFeedback>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            )}
          </Reanimated.View>
        </GestureDetector>
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
    paddingHorizontal: 0, // No horizontal padding - feed fills edge to edge
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
  },
  welcomeSection: {
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  welcomeText: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  activeFriendsCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  activeTitle: {
    ...typography.h4,
    color: colors.text,
  },
  activeSubtitleText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs / 2,
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
    // No background, no border, no margin - continuous feed like Instagram
    marginBottom: 0,
    backgroundColor: 'transparent', // Transparent so it blends with background
    overflow: 'visible',
    position: 'relative',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
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
  feedUser: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  feedTimestamp: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  feedImagePlaceholder: {
    // No borderRadius - full edge to edge
    backgroundColor: colors.surface,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  feedVideoContainer: {
    width: '100%',
    marginBottom: 12,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  feedVideo: {
    width: '100%',
    height: '100%',
  },
  feedVideoTapHint: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelsModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  reelsCloseButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  reelItem: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  reelVideo: {
    width: '100%',
    height: '100%',
  },
  reelOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    paddingHorizontal: 16,
    paddingBottom: 24,
    justifyContent: 'flex-end',
  },
  reelSheetOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
  },
  reelLeft: {
    alignSelf: 'flex-start',
    maxWidth: '70%',
  },
  reelUsername: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  reelMeta: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 6,
    opacity: 0.9,
  },
  reelDescription: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  reelRight: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    alignItems: 'center',
    gap: 10,
  },
  reelActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelActionEmoji: {
    fontSize: 22,
  },
  reelActionEmojiLiked: {
    opacity: 1,
  },
  reelActionCount: {
    color: '#fff',
    fontSize: 12,
    marginTop: -6,
  },
  reelActionCountActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  reelSeeMore: {
    color: colors.primary,
    fontWeight: '600',
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    maxHeight: '75%',
  },
  shareHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3A3A',
    marginBottom: 12,
  },
  shareSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  shareSearchInput: {
    flex: 1,
    color: '#fff',
  },
  shareFriendList: {
    marginTop: 16,
  },
  shareFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F2F2F',
    gap: 12,
  },
  shareFriendAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFriendAvatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  shareFriendName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  shareFriendButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2A2A2A',
  },
  shareFriendButtonSelected: {
    backgroundColor: colors.primary,
  },
  shareFriendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  shareFriendButtonTextSelected: {
    color: '#fff',
  },
  shareSendButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareSendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  feedImageText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  feedPhotoContainer: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'visible',
    zIndex: 10,
    elevation: 10,
  },
  feedPhotoMask: {
    width: '100%',
    height: '100%',
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: 16,
  },
  feedHighlightText: {
    color: colors.white,
    fontWeight: '600',
  },
  feedSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  feedHighlightSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary, // Purple background for "Session delt"
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedHighlightSecondaryText: {
    color: colors.white,
    fontWeight: '600',
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
    fontSize: 12,
    fontWeight: '500',
    color: colors.secondary,
    marginBottom: 10,
    paddingHorizontal: 16,
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
    lineHeight: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  feedCaptionUser: {
    fontWeight: '700',
    color: colors.text,
  },
  feedHeaderProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 1,
  },
  feedActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedLikeButton: {
    padding: 4,
    backgroundColor: 'transparent',
  },
  feedLikeButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
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
  feedActionTextContainer: {
    marginLeft: 0,
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
    fontSize: 24,
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
    color: colors.primary,
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
  },
  commentContent: {
    flex: 1,
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
  commentLikeColumn: {
    alignItems: 'center',
    width: 36,
  },
  commentLikeButton: {
    padding: 4,
  },
  commentLikeCount: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  commentLikeCountActive: {
    color: colors.primary,
    fontWeight: '600',
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  suggestedFriendsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  suggestedFriendsList: {
    paddingRight: 16,
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
});

export default HomeScreen;

