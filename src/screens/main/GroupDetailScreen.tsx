/**
 * Group Detail Screen
 * Gruppens detaljer – beskrivelse, medlemmer, aktivitet, join/leave/invite
 */

import React, {useState, useMemo} from 'react';
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
import {useNavigation, useRoute} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import {useAppStore} from '@/store/appStore';
import {useGroup, useGroupActivity} from '@/hooks/data';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type Group = {
  id: string;
  name: string;
  description?: string;
  biography?: string;
  image?: string;
  isPrivate?: boolean;
  adminId?: string;
  members: Array<{id: string; name: string; avatar?: string; isOnline?: boolean}>;
  totalWorkouts?: number;
  totalTimeTogether?: number;
  totalCheckIns?: number;
  location?: string;
  focus?: string;
  createdAt?: Date | string;
};

const GroupDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const {group: initialGroup} = (route.params as any) || {};
  const {user} = useAppStore();

  const {group: groupFromMock} = useGroup(initialGroup?.id, user?.id || 'current_user');
  const groupActivityRaw = useGroupActivity(initialGroup?.id, user?.id || 'current_user');

  const [isMember, setIsMember] = useState(() => {
    if (!user || !initialGroup?.members) return false;
    return initialGroup.members.some(
      m => m.id === user.id || m.id === 'current'
    );
  });

  const totalCheckIns =
    initialGroup?.totalCheckIns ??
    groupFromMock?.totalCheckIns ??
    (initialGroup?.totalWorkouts ?? 0) * 2;

  const groupActivity = useMemo(
    () =>
      [...groupActivityRaw]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5),
    [groupActivityRaw]
  );

  const isAdmin =
    user && initialGroup?.adminId && (initialGroup.adminId === user.id || initialGroup.adminId === 'current');

  const handleJoin = () => {
    setIsMember(true);
    Alert.alert('Velkommen!', `Du er nu medlem af ${initialGroup.name}`);
  };

  const handleLeave = () => {
    Alert.alert(
      'Forlad gruppe',
      `Er du sikker på at du vil forlade ${initialGroup.name}?`,
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Forlad',
          style: 'destructive',
          onPress: () => {
            setIsMember(false);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleInvite = () => {
    Alert.alert('Inviter venner', 'Vælg venner at invitere til gruppen', [
      {text: 'OK'},
    ]);
  };

  if (!initialGroup) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Gruppe" onBack={() => navigation.goBack()} />
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>Gruppe ikke fundet</Text>
        </View>
      </View>
    );
  }

  const createdAtDate =
    typeof initialGroup.createdAt === 'string'
      ? new Date(initialGroup.createdAt)
      : initialGroup.createdAt ?? new Date();

  const formatTime = (minutes: number): string => {
    if (!minutes || minutes === 0) return '0 min';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}t` : `${h}t ${m}m`;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={initialGroup.name}
        onBack={() => navigation.goBack()}
        rightElement={
          isAdmin ? (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('EditGroup', {
                  group: {
                    ...initialGroup,
                    createdAt:
                      typeof initialGroup.createdAt === 'string'
                        ? initialGroup.createdAt
                        : initialGroup.createdAt?.toISOString?.(),
                  },
                })
              }>
              <Icon name="create-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.groupIcon}>
            {initialGroup.image ? (
              <Image
                source={{uri: initialGroup.image}}
                style={styles.groupImage}
                resizeMode="cover"
              />
            ) : (
              <Icon name="people" size={48} color={colors.primary} />
            )}
            {initialGroup.isPrivate && (
              <View style={styles.privateBadge}>
                <Icon name="lock-closed" size={14} color={colors.white} />
              </View>
            )}
          </View>
          <Text style={styles.groupName}>{initialGroup.name}</Text>
          {(initialGroup.location || initialGroup.focus) && (
            <Text style={styles.groupMeta}>
              {[initialGroup.location, initialGroup.focus]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.description}>
            {initialGroup.biography || initialGroup.description || 'Ingen beskrivelse'}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Icon name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{totalCheckIns}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="people" size={24} color={colors.primary} />
            <Text style={styles.statValue}>
              {initialGroup.members?.length ?? 0}
            </Text>
            <Text style={styles.statLabel}>Medlemmer</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="time" size={24} color={colors.primary} />
            <Text style={styles.statValue}>
              {formatTime(initialGroup.totalTimeTogether ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Træningstid</Text>
          </View>
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          {isMember ? (
            <>
              <TouchableOpacity
                style={styles.ctaPrimary}
                onPress={handleInvite}
                activeOpacity={0.8}>
                <Icon name="person-add" size={20} color={colors.white} />
                <Text style={styles.ctaPrimaryText}>Inviter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={handleLeave}
                activeOpacity={0.8}>
                <Text style={styles.ctaSecondaryText}>Forlad gruppe</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.ctaJoin}
              onPress={handleJoin}
              activeOpacity={0.8}>
              <Icon name="add-circle" size={24} color={colors.white} />
              <Text style={styles.ctaJoinText}>Join gruppe</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Activity feed preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seneste aktivitet</Text>
          {groupActivity.length > 0 ? (
            <Card variant="outlined" padding="md">
              {groupActivity.map(activity => (
                <View key={activity.id} style={styles.activityRow}>
                  <View style={styles.activityAvatar}>
                    <Text style={styles.activityAvatarText}>
                      {activity.userName.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>{activity.message}</Text>
                    <Text style={styles.activityTime}>
                      {formatRelativeTime(activity.timestamp)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <View style={styles.emptyActivity}>
              <Icon name="pulse-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyActivityText}>
                Ingen aktivitet endnu
              </Text>
              <Text style={styles.emptyActivitySubtext}>
                Tjek ind for at vise aktivitet her
              </Text>
            </View>
          )}
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Medlemmer ({initialGroup.members?.length ?? 0})
          </Text>
          <View style={styles.membersCard}>
            {initialGroup.members?.map((member, idx) => {
              const isCurrentUser =
                user && (member.id === user.id || member.id === 'current');
              const isGroupAdmin = member.id === initialGroup.adminId;
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.memberRow,
                    idx < (initialGroup.members?.length ?? 0) - 1 &&
                      styles.memberRowBorder,
                  ]}
                  onPress={() => {
                    if (!isCurrentUser) {
                      navigation.navigate('FriendProfile', {
                        friendId: member.id,
                        friendName: member.name,
                        mutualFriends: 0,
                        gyms: [],
                      });
                    }
                  }}
                  activeOpacity={0.8}>
                  <View style={styles.memberAvatar}>
                    {member.avatar ? (
                      <Image
                        source={{uri: member.avatar}}
                        style={styles.memberAvatarImage}
                      />
                    ) : (
                      <Text style={styles.memberAvatarText}>
                        {member.name.charAt(0)}
                      </Text>
                    )}
                    {member.isOnline && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {isCurrentUser ? 'Dig' : member.name}
                      {isGroupAdmin && (
                        <Text style={styles.adminLabel}> • Admin</Text>
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.memberStatus,
                        member.isOnline && styles.memberStatusOnline,
                      ]}>
                      {member.isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                  {!isCurrentUser && (
                    <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Created */}
        <View style={styles.metadata}>
          <Icon name="calendar-outline" size={16} color={colors.textMuted} />
          <Text style={styles.metadataText}>
            Oprettet{' '}
            {createdAtDate.toLocaleDateString('da-DK', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {flex: 1},
  scrollContent: {paddingBottom: spacing.xxxl},
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  groupIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  groupImage: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  privateBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    padding: 4,
  },
  groupName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  groupMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  description: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  ctaPrimaryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  ctaSecondary: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    ...typography.bodyBold,
    color: colors.error,
  },
  ctaJoin: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  ctaJoinText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  activityAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  activityContent: {flex: 1},
  activityText: {
    ...typography.body,
    color: colors.text,
  },
  activityTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyActivity: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyActivityText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyActivitySubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  membersCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  memberRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  memberAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  memberInfo: {flex: 1},
  memberName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  adminLabel: {
    ...typography.small,
    color: colors.warning,
    fontWeight: '400',
  },
  memberStatus: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  memberStatusOnline: {
    color: colors.success,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  metadataText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

export default GroupDetailScreen;
