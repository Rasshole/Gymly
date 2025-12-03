/**
 * Home Screen
 * Main feed and workout check-ins
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
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

type HomeScreenNavigationProp = StackNavigationProp<any>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const {user} = useAppStore();
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
  const feedItems = useFeedStore(state => state.feedItems);

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
    color: string;
  };
  const bicepsAnimations = useRef<
    Record<string, {scale: Animated.Value; particles: Particle[]; emojiOpacity: Animated.Value; thumbsOpacity: Animated.Value}>
  >({});

  const bicepsColors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94'];

  const createParticle = (color: string) => ({
    opacity: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(0),
    color,
  });

  const ensureBicepsAnimation = (itemId: string) => {
    if (!bicepsAnimations.current[itemId]) {
      bicepsAnimations.current[itemId] = {
        scale: new Animated.Value(1),
        emojiOpacity: new Animated.Value(0),
        thumbsOpacity: new Animated.Value(1),
        particles: Array.from({length: 5}).map((_, idx) =>
          createParticle(bicepsColors[idx % bicepsColors.length]),
        ),
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
    
    // Ensure opacity values exist
    if (!anim.thumbsOpacity) {
      anim.thumbsOpacity = new Animated.Value(1);
    }
    if (!anim.emojiOpacity) {
      anim.emojiOpacity = new Animated.Value(0);
    }
    
    // Start emoji animation
    setAnimatingItems(prev => ({...prev, [itemId]: true}));
    
    // Scale animation for button
    anim.scale.setValue(0.8);
    Animated.spring(anim.scale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
    
    // Smooth transition from thumbs up to 💪
    anim.thumbsOpacity.setValue(1);
    anim.emojiOpacity.setValue(0);
    
    Animated.parallel([
      Animated.timing(anim.thumbsOpacity, {
        toValue: 0,
        duration: 210,
        useNativeDriver: true,
      }),
      Animated.timing(anim.emojiOpacity, {
        toValue: 1,
        duration: 210,
        useNativeDriver: true,
      }),
    ]).start();
    
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
            friction: 3,
            tension: 100,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.5,
            duration: 280,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateY, {
          toValue: endY,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateX, {
          toValue: endX,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start();
    });
    
    // Reset emoji after 700ms with smooth transition back
    setTimeout(() => {
      // Smooth transition back from 💪 to thumbs up
      Animated.parallel([
        Animated.timing(anim.emojiOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(anim.thumbsOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAnimatingItems(prev => {
          const next = {...prev};
          delete next[itemId];
          return next;
        });
      });
    }, 700);
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
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Hej, {user?.displayName}! 👋</Text>
          <Text style={styles.subtitle}>Klar til at træne i dag?</Text>
        </View>

        {/* Active Friends */}
        <TouchableOpacity
          style={styles.activeFriendsCard}
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
        <View style={styles.feedSection}>
          {feedItems.map(item => {
            // Ensure animation is initialized
            const likeAnim = ensureBicepsAnimation(item.id);
            const likeScaleStyle = likeAnim
              ? {transform: [{scale: likeAnim.scale}]}
              : undefined;
            const particles = likeAnim?.particles ?? [];
            const hasCommented = commentedItems.includes(item.id);
            const commentColor = hasCommented ? '#2563EB' : '#0F172A';
            const isAnimating = animatingItems[item.id];
            const thumbsOpacity = likeAnim.thumbsOpacity;
            const emojiOpacity = likeAnim.emojiOpacity;
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
                <Icon name="ellipsis-horizontal" size={18} color="#94A3B8" />
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
                <View style={styles.feedHighlightSecondary}>
                  <Icon name="flash" size={16} color="#38BDF8" />
                  <Text style={styles.feedHighlightSecondaryText}>Session delt</Text>
                </View>
              )}
              <Text style={styles.feedDescription}>{item.description}</Text>
              <View style={styles.feedActions}>
                <TouchableOpacity
                  style={[
                    styles.feedLikeButton,
                    feedReactions[item.id]?.liked && styles.feedLikeButtonActive,
                  ]}
                  onPress={() => toggleLike(item.id)}
                  activeOpacity={0.7}>
                  <View style={styles.likeButtonInner}>
                    <Animated.View style={likeScaleStyle}>
                      <View style={styles.likeButtonContent}>
                        {/* Thumbs up (fades out during animation) */}
                        {(!isAnimating || feedReactions[item.id]?.liked) && (
                          <Animated.View
                            style={[
                              styles.likeButtonOverlay,
                              {opacity: isAnimating ? thumbsOpacity : 1},
                            ]}>
                            {feedReactions[item.id]?.liked ? (
                              <Icon name="thumbs-up" size={20} color="#1877F2" />
                            ) : (
                              <Icon
                                name="thumbs-up-outline"
                                size={20}
                                color="#65676B"
                              />
                            )}
                          </Animated.View>
                        )}
                        {/* 💪 emoji (fades in during animation) */}
                        {isAnimating && (
                          <Animated.View
                            style={[
                              styles.likeButtonOverlay,
                              {opacity: emojiOpacity},
                            ]}>
                            <Text style={styles.bicepsEmoji}>💪</Text>
                          </Animated.View>
                        )}
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
                        <Text
                          style={[
                            styles.bicepsParticleEmoji,
                            {
                              textShadowColor: particle.color,
                              textShadowOffset: {width: 0, height: 0},
                              textShadowRadius: 25,
                            },
                          ]}>
                          💪
                        </Text>
                      </Animated.View>
                    ))}
          </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.feedActionButton}
                  onPress={() => openComments(item.id)}
                  activeOpacity={0.8}>
                  <Icon name="chatbubble-outline" size={20} color={commentColor} />
                  <Text
                    style={[
                      styles.feedActionText,
                      hasCommented && styles.feedActionTextLiked,
                    ]}>
                    {commentsByFeedItem[item.id]?.length ?? 0}
          </Text>
                </TouchableOpacity>
          </View>
        </View>
            );
          })}

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
                        color={isAdded ? '#22C55E' : '#007AFF'}
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
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  welcomeSection: {
    marginBottom: 24,
    paddingTop: 8,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  activeFriendsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    color: '#0F172A',
  },
  activeSubtitleText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  activeCountBadge: {
    backgroundColor: '#E0F2FF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  activeCountText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  activeFriendPreviewRow: {
    flexDirection: 'column',
  },
  activeFriendPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#DCFCE7',
    borderRadius: 14,
    padding: 12,
  },
  activeFriendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activeFriendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  activeFriendInfo: {
    flex: 1,
  },
  activeFriendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  activeFriendMeta: {
    fontSize: 13,
    color: '#64748B',
  },
  activeFriendFocus: {
    fontSize: 13,
    color: '#16A34A',
    marginTop: 2,
  },
  joinBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  joinBadgeText: {
    color: '#fff',
    fontWeight: '700',
  },
  joinBadgeDisabled: {
    backgroundColor: '#CBD5E1',
  },
  joinBadgeTextDisabled: {
    color: '#475569',
  },
  checkInButton: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  checkInIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
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
    color: '#000',
    marginBottom: 4,
  },
  checkInSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  testButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  feedSection: {
    marginTop: 8,
  },
  feedCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  feedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4338CA',
  },
  feedUser: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  feedTimestamp: {
    fontSize: 12,
    color: '#94A3B8',
  },
  feedImagePlaceholder: {
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  feedImageText: {
    color: '#475569',
    fontWeight: '600',
  },
  feedPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    marginBottom: 12,
  },
  feedHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  feedHighlightText: {
    color: '#92400E',
    fontWeight: '600',
  },
  feedHighlightSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  feedHighlightSecondaryText: {
    color: '#075985',
    fontWeight: '600',
  },
  feedDescription: {
    fontSize: 15,
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 12,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedLikeButton: {
    padding: 4,
    backgroundColor: 'transparent',
  },
  feedLikeButtonActive: {
    backgroundColor: 'transparent',
  },
  likeButtonCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1877F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    color: '#0F172A',
  },
  feedActionTextLiked: {
    color: '#2563EB',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
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
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475467',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  activityFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  activityFriendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityFriendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  activityFriendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  activityFriendGym: {
    fontSize: 14,
    color: '#475467',
  },
  activityFriendFocus: {
    fontSize: 13,
    color: '#94A3B8',
  },
  activityFriendDuration: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },
  joinButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  joinButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  joinButtonTextDisabled: {
    color: '#475569',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  upcomingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  upcomingGym: {
    fontSize: 14,
    color: '#475467',
  },
  upcomingFocus: {
    fontSize: 13,
    color: '#94A3B8',
  },
  upcomingTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 6,
  },
  joinButtonSecondary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  joinButtonSecondaryText: {
    color: '#007AFF',
    fontWeight: '700',
  },
  joinButtonSecondaryDisabled: {
    borderColor: '#CBD5E1',
  },
  joinButtonSecondaryTextDisabled: {
    color: '#94A3B8',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  commentSheet: {
    backgroundColor: '#fff',
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
    backgroundColor: '#CBD5F5',
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
    color: '#94A3B8',
    paddingVertical: 20,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontWeight: '700',
    color: '#007AFF',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  commentBody: {
    fontSize: 14,
    color: '#475467',
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
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    color: '#0F172A',
  },
  commentSendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 999,
    padding: 12,
  },
  commentSendButtonDisabled: {
    backgroundColor: '#CBD5F5',
  },
  modalCloseButton: {
    marginTop: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  suggestedFriendsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  suggestedFriendsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
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
    backgroundColor: '#E0E7FF',
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
    color: '#4338CA',
  },
  suggestedFriendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
    textAlign: 'center',
  },
  suggestedFriendMutual: {
    fontSize: 12,
    color: '#64748B',
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
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 2,
  },
  suggestedFriendAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  suggestedFriendAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  suggestedFriendAddButtonAdded: {
    backgroundColor: '#D1FAE5',
  },
  suggestedFriendAddTextAdded: {
    color: '#22C55E',
  },
});

export default HomeScreen;

