/**
 * Online Screen
 * Premium active users – træner nu, online nu, aktiv for X min
 */

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useOnlineUsers} from '@/hooks/data';
import type {OnlineUser} from '@/types/online.types';
import danishGyms from '@/data/danishGyms';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import EmptyState from '@/components/ui/EmptyState';
import {FilterChips} from '@/components/ui/FilterChips';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';

type FilterType = 'venner' | 'alle';

const matchesSearch = (u: OnlineUser, q: string): boolean => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [
    u.displayName,
    u.city,
    u.gymName,
    u.badge,
    u.muscleGroup,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
};

const getStatusLabel = (user: OnlineUser): string => {
  switch (user.status) {
    case 'training_now':
      return user.muscleGroup ? `Træner ${user.muscleGroup}` : 'Træner nu';
    case 'active_minutes':
      const mins = user.activeMinutesAgo ?? 0;
      return `Aktiv for ${mins} min siden`;
    case 'online_now':
      return 'Online';
    default:
      return 'Online';
  }
};

const getStatusColor = (status: OnlineUser['status']): string => {
  switch (status) {
    case 'training_now':
      return colors.success;
    case 'active_minutes':
      return colors.warning;
    case 'online_now':
      return colors.primary;
    default:
      return colors.textMuted;
  }
};

const OnlineScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const {getChatByParticipants, addChat, initializeChatMessages} = useChatStore();
  const [filter, setFilter] = useState<FilterType>('venner');
  const [searchQuery, setSearchQuery] = useState('');
  const currentUserId = user?.id || 'current_user';

  const {users: usersFromSource} = useOnlineUsers(currentUserId, {
    filter,
  });

  const displayUsers = useMemo(
    () => usersFromSource.filter((u) => matchesSearch(u, searchQuery)),
    [usersFromSource, searchQuery]
  );

  const handleSeProfil = (u: OnlineUser) => {
    navigation.navigate('FriendProfile', {
      userId: u.userId,
      friendName: u.displayName,
      mutualFriends: 0,
      gyms: u.gymName ? [u.gymName] : [],
    });
  };

  const handleSendBesked = (u: OnlineUser) => {
    const participantIds = [currentUserId, u.userId].sort();
    const existingChat = getChatByParticipants(participantIds);
    const chatId = existingChat?.id ?? `chat_${u.userId}`;
    if (!existingChat) {
      addChat({
        id: chatId,
        participantIds,
        participantNames: ['Dig', u.displayName],
        lastActivity: new Date(),
        unreadCount: 0,
        avatarInitials: u.avatarInitials,
      });
      initializeChatMessages(chatId, []);
    }
    navigation.navigate('Chat', {
      chatId,
      friendId: u.userId,
      friendName: u.displayName,
      participants: [{id: u.userId, name: u.displayName}],
    });
  };

  const handleInviterTilGruppe = (u: OnlineUser) => {
    navigation.navigate('Friends', {screen: 'Grupper'} as never);
  };

  const handleSeGym = (u: OnlineUser) => {
    if (!u.gymId) return;
    const gym = danishGyms.find((g) => g.id === u.gymId);
    if (gym) {
      navigation.navigate('GymDetail', {gymId: gym.id, gym});
    }
  };

  const renderUserCard = ({item}: {item: OnlineUser}) => {
    const statusColor = getStatusColor(item.status);
    const statusLabel = getStatusLabel(item);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => handleSeProfil(item)}
          activeOpacity={0.9}>
          <View style={styles.avatarWrap}>
            {item.profileImageUrl ? (
              <Image source={{uri: item.profileImageUrl}} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {item.avatarInitials || item.displayName.charAt(0)}
                </Text>
              </View>
            )}
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.displayName}
              </Text>
              {item.badge && (
                <View style={styles.badge}>
                  <Icon name="medal" size={12} color={colors.warning} />
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </View>
            {(item.gymName || item.city) && (
              <Text style={styles.location} numberOfLines={1}>
                {[item.gymName, item.city].filter(Boolean).join(' • ')}
              </Text>
            )}
            <View style={[styles.statusChip, {backgroundColor: statusColor + '20'}]}>
              <View style={[styles.statusChipDot, {backgroundColor: statusColor}]} />
              <Text style={[styles.statusChipText, {color: statusColor}]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSeProfil(item)}
            activeOpacity={0.8}>
            <Icon name="person-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Profil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSendBesked(item)}
            activeOpacity={0.8}>
            <Icon name="chatbubble-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Besked</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleInviterTilGruppe(item)}
            activeOpacity={0.8}>
            <Icon name="people-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Gruppe</Text>
          </TouchableOpacity>
          {item.gymId && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleSeGym(item)}
              activeOpacity={0.8}>
              <Icon name="location-outline" size={18} color={colors.primary} />
              <Text style={styles.actionText}>Gym</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const filterOptions = [
    {value: 'venner' as const, label: 'Venner'},
    {value: 'alle' as const, label: 'Alle'},
  ];

  const searchPlaceholder =
    filter === 'venner'
      ? 'Søg efter venner...'
      : 'Søg på alle profiler...';

  const listEmpty =
    usersFromSource.length === 0 ? (
      <EmptyState
        icon="people-outline"
        title="Ingen er online lige nu"
        message="Tjek ind selv for at vise dig til andre, eller inviter venner til Gymly for at se deres aktivitet."
        actionLabel="Tjek ind"
        onAction={() => navigation.navigate('CheckIn')}
      />
    ) : (
      <EmptyState
        icon="search-outline"
        title="Ingen matcher din søgning"
        message="Prøv et andet navn eller søgeord."
      />
    );

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <FilterChips
          options={filterOptions}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={displayUsers}
        renderItem={renderUserCard}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={
          displayUsers.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={listEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.backgroundCard,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...typography.h4,
    color: colors.primary,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.warning + '20',
    borderRadius: radius.sm,
  },
  badgeText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  location: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 6,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    ...typography.caption,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '08',
  },
  actionText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
});

export default OnlineScreen;
