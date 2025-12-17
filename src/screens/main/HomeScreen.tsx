/**
 * Home Screen
 * Main feed and workout check-ins
 */

import React, {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  TextInput,
  Animated,
  FlatList,
  Image,
} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import NotificationService from '@/services/notifications/NotificationService';
import {useFeedStore} from '@/store/feedStore';
import {colors} from '@/theme/colors';

type HomeScreenNavigationProp = StackNavigationProp<any>;

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

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const {user} = useAppStore();
  const {feedItems, deleteFeedItem} = useFeedStore();
  const userBicepsEmoji = user?.bicepsEmoji || '💪🏻';
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [addedFriends, setAddedFriends] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [activeJoinRequests, setActiveJoinRequests] = useState<string[]>([]);
  const [upcomingJoinRequests, setUpcomingJoinRequests] = useState<string[]>([]);
  const [feedReactions, setFeedReactions] = useState<Record<string, {liked: boolean; likes: number}>>({
    feed_photo_1: {liked: false, likes: 42},
    feed_pr_1: {liked: false, likes: 18},
    feed_summary_1: {liked: false, likes: 9},
  });
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentsByFeedItem, setCommentsByFeedItem] = useState<Record<string, string[]>>({
    feed_photo_1: ['Ser stærkt ud! 🔥', 'Sikke et team!'],
    feed_pr_1: ['Vanvittig PR!', 'Hvordan var sidste rep?'],
    feed_summary_1: ['Elsker Repeat Fitness!', 'God inspiration 💪'],
  });
  const [commentedItems, setCommentedItems] = useState<string[]>([]);
  const [animatingItems, setAnimatingItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeFriends = useMemo(
    () => [
      {
        id: 'friend_jeff',
        name: 'Jeff',
        gym: 'PureGym Fields',
        focus: 'Bryst & triceps',
        startTimestamp: Date.now() - 18 * 60000,
      },
      {
        id: 'friend_marie',
        name: 'Marie',
        gym: 'Repeat Fitness Nørrebro',
        focus: 'Ben & core',
        startTimestamp: Date.now() - 42 * 60000,
      },
    ],
    [],
  );

  const upcomingSessions = useMemo(
    () => [
      {
        id: 'upcoming_sofia',
        name: 'Sofia',
        gym: 'Repeat Fitness Frederiksberg',
        focus: 'Ryg & biceps',
        scheduledAt: Date.now() + 36 * 60 * 60 * 1000, // 1½ dag frem
      },
      {
        id: 'upcoming_lars',
        name: 'Lars',
        gym: 'Urban Gym Christianshavn',
        focus: 'Ben & skuldre',
        scheduledAt: Date.now() + 60 * 60 * 60 * 1000, // ~2½ dag frem
      },
    ],
    [],
  );

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
        particles: Array.from({length: 5}).map(() => createParticle()),
      };
    }
    return bicepsAnimations.current[itemId];
  };

  useEffect(() => {
    feedItems.forEach(item => {
      ensureBicepsAnimation(item.id);
    });
  }, [feedItems]);

  const runBicepsAnimation = (itemId: string) => {
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

  const toggleLike = (itemId: string) => {
    setFeedReactions(prev => {
      const existing = prev[itemId] ?? {liked: false, likes: 0};
      const nextLiked = !existing.liked;
      if (nextLiked) {
        runBicepsAnimation(itemId);
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

  const openComments = (itemId: string) => {
    setActiveCommentItem(itemId);
    setCommentInput('');
    setCommentModalVisible(true);
  };

  const closeComments = () => {
    setCommentModalVisible(false);
    setActiveCommentItem(null);
    setCommentInput('');
  };

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
    setCommentsByFeedItem(prev => ({
      ...prev,
      [activeCommentItem]: [...(prev[activeCommentItem] ?? []), trimmed],
    }));
    setCommentedItems(prev =>
      prev.includes(activeCommentItem) ? prev : [...prev, activeCommentItem],
    );
    setCommentInput('');
  };

  const activeComments = activeCommentItem ? commentsByFeedItem[activeCommentItem] ?? [] : [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Welcome Section */}
        <View style={[styles.welcomeSection, {paddingHorizontal: 16}]}>
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
                  <Text style={styles.activeFriendFocus}>{friend.focus}</Text>
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
        {feedItems.map(item => {
            // Ensure animation is initialized
            const likeAnim = ensureBicepsAnimation(item.id);
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
              <View key={item.id} style={styles.feedCard}>
              <View style={styles.feedCardHeader}>
                <View style={styles.feedAvatar}>
                  <Text style={styles.feedAvatarText}>{item.user.charAt(0)}</Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.feedUser}>{item.user}</Text>
                  <Text style={styles.feedTimestamp}>{item.timestamp}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleFeedItemMenu(item.id, item.user)}
                  activeOpacity={0.7}>
                  <Icon name="ellipsis-horizontal" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              {item.type === 'photo' &&
                (item.photoUri ? (
                  <Image source={{uri: item.photoUri}} style={styles.feedPhoto} />
                ) : (
                  <View style={styles.feedImagePlaceholder}>
                    <Text style={styles.feedImageText}>Foto fra træning</Text>
                  </View>
                ))}
              {item.type === 'pr' && (
                <View style={styles.feedHighlight}>
                  <Icon name="trophy" size={18} color="#FACC15" />
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
                      <Icon name="flash" size={16} color="#3B82F6" />
                    )}
                    <Text style={styles.feedHighlightSecondaryText}>Session delt</Text>
                  </View>
                  {item.workoutInfo && (
                    <Text style={styles.feedWorkoutInfo}>{item.workoutInfo}</Text>
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
              <View style={styles.feedActions}>
                <View style={styles.feedActionGroup}>
                  <TouchableOpacity
                    style={[
                      styles.feedLikeButton,
                      isLiked && styles.feedLikeButtonActive,
                    ]}
                    onPress={() => toggleLike(item.id)}
                    activeOpacity={0.7}>
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
          })}
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
                        color={isAdded ? '#22C55E' : '#3B82F6'}
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

        {/* Test Notification Button (for development) */}
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => {
            // Simulate a friend check-in for testing
            NotificationService.simulateRandomCheckIn();
          }}
          activeOpacity={0.8}>
          <Icon name="notifications" size={20} color="#007AFF" />
          <Text style={styles.testButtonText}>Test notifikation</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={commentModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeComments}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.commentSheet}>
                <View style={styles.commentHandle} />
                <View style={styles.commentHeader}>
                  <Text style={styles.modalTitle}>Kommentarer</Text>
                  <TouchableOpacity onPress={closeComments} style={styles.commentCloseButton}>
                    <Icon name="close" size={22} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.commentList}>
                  {activeComments.length === 0 ? (
                    <Text style={styles.commentEmpty}>Ingen kommentarer endnu</Text>
                  ) : (
                    activeComments.map((comment, index) => (
                      <View key={`${activeCommentItem}_comment_${index}`} style={styles.commentRow}>
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>F</Text>
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.commentAuthor}>Friend</Text>
                          <Text style={styles.commentBody}>{comment}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Skriv en kommentar..."
                    placeholderTextColor="#94A3B8"
                    value={commentInput}
                    onChangeText={setCommentInput}
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
                    <Text style={styles.activityFriendFocus}>{friend.focus}</Text>
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
                    <Text style={styles.upcomingFocus}>{session.focus}</Text>
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
    paddingVertical: 16,
  },
  welcomeSection: {
    marginBottom: 24,
    paddingTop: 8,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
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
  activeFriendFocus: {
    fontSize: 13,
    color: colors.successLight,
    marginTop: 2,
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
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  testButtonText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
    marginLeft: 8,
  },
  feedSection: {
    marginTop: 8,
  },
  feedCard: {
    // No background, no border, no margin - continuous feed like Instagram
    marginBottom: 0,
    backgroundColor: 'transparent', // Transparent so it blends with background
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  feedImageText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  feedPhoto: {
    width: '100%',
    height: 220,
    // No borderRadius - full edge to edge
    marginBottom: 0,
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
    backgroundColor: colors.blue, // Blue background for "Session delt"
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
  feedDescription: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    color: colors.secondary,
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
  upcomingFocus: {
    fontSize: 13,
    color: colors.textTertiary,
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
    maxHeight: '80%',
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
    maxHeight: 250,
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
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 16,
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
    color: colors.text,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.blue, // Blue background for "Tilføj" button
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

