/**
 * Groups Screen — skjult fra Venner-navigation ved launch (`SURFACE_GROUPS_IN_APP`).
 * Bevares modulært til genaktivering; Supabase + stack-ruter uændret.
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {Card} from '@/components/ui/Card';
import type {Group} from '@/types/group.types';
import {useAppStore} from '@/store/appStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {
  acceptGymlyGroupInvite,
  declineGymlyGroupInvite,
} from '@/services/supabase/gymlyGroupsService';
import type {GymlyGroupRow} from '@/types/gymlyGroups.types';
import type {GroupMember} from '@/store/groupStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';

function formatGroupCreated(d: Date): string {
  return d.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const GroupCard = ({
  group,
  onPress,
  showJoinButton,
  lastPreview,
}: {
  group: Group;
  onPress: () => void;
  showJoinButton?: boolean;
  lastPreview?: string | null;
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={styles.groupCard}>
    <View style={styles.groupCardHeader}>
      <View style={styles.groupIcon}>
        <Icon name="people" size={26} color={colors.primary} />
      </View>
      <View style={styles.groupCardInfo}>
        <View style={styles.groupNameRow}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          {group.isPrivate && (
            <Icon name="lock-closed" size={14} color={colors.textMuted} />
          )}
        </View>
        <Text style={styles.groupMeta}>
          {group.memberCount} medlemmer
          {group.location && ` • ${group.location}`}
        </Text>
        {group.focus && (
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>{group.focus}</Text>
          </View>
        )}
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textMuted} />
    </View>
        <Text style={styles.groupDescription} numberOfLines={2}>
      {lastPreview?.trim() ? lastPreview : group.description}
    </Text>
    <View style={styles.groupStats}>
      <View style={styles.stat}>
        <Icon name="checkmark-circle" size={14} color={colors.secondary} />
        <Text style={styles.statText}>
          {group.totalCheckIns ?? group.activityCount ?? 0} check-ins
        </Text>
      </View>
      <View style={styles.stat}>
        <Icon name="pulse" size={14} color={colors.primary} />
        <Text style={styles.statText}>
          {group.activityCount ?? 0} aktiviteter
        </Text>
      </View>
    </View>
    {showJoinButton && (
      <TouchableOpacity
        style={styles.joinButton}
        onPress={e => {
          e.stopPropagation();
          onPress();
        }}
        activeOpacity={0.8}>
        <Text style={styles.joinButtonText}>Join gruppe</Text>
      </TouchableOpacity>
    )}
  </TouchableOpacity>
);

function mapRowToGroup(
  r: GymlyGroupRow & {members: GroupMember[]},
): Group {
  const loc = [r.city, r.center_id].filter(Boolean).join(' · ');
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    memberCount: r.member_count,
    isJoined: true,
    isPrivate: r.is_private,
    adminId: r.created_by,
    members: r.members.map(m => ({...m, isOnline: false})),
    activityCount: 0,
    totalCheckIns: 0,
    imageUrl: r.image_url ?? undefined,
    location: loc || undefined,
    focus: r.focus ?? undefined,
    createdAt: new Date(r.created_at),
  };
}

const GroupsScreen = () => {
  const navigation = useNavigation<any>();
  const userId = useAppStore(s => s.user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const serverGroups = useGymlyGroupsStore(s => s.groups);
  const pendingInvites = useGymlyGroupsStore(s => s.pendingInvites);
  const loading = useGymlyGroupsStore(s => s.loading);
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);
  const refreshNotif = useInAppNotificationStore(s => s.refresh);

  const rowsById = useMemo(() => {
    const m = new Map<string, GymlyGroupRow & {members: GroupMember[]}>();
    for (const g of serverGroups) {
      m.set(g.id, g);
    }
    return m;
  }, [serverGroups]);

  const myGroups = useMemo(
    () => serverGroups.map(mapRowToGroup),
    [serverGroups],
  );

  const filteredMyGroups = useMemo(
    () =>
      myGroups.filter(
        g =>
          !searchQuery.trim() ||
          g.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [myGroups, searchQuery],
  );

  const handleGroupPress = (group: Group) => {
    const row = rowsById.get(group.id);
    navigation.navigate('GroupDetail', {
      group: {
        ...group,
        members: (group.members ?? []).map(m => ({
          ...m,
          isOnline: m.isOnline ?? false,
        })),
        totalWorkouts: group.activityCount ?? 0,
        totalTimeTogether: (group.totalCheckIns ?? 0) * 45,
        biography: group.description,
        createdAt: group.createdAt ?? new Date(),
      },
      groupId: group.id,
      lastMessagePreview: row?.last_message_preview,
    });
  };

  const onAcceptInvite = async (inviteId: string) => {
    if (!userId) {
      return;
    }
    try {
      await acceptGymlyGroupInvite(inviteId);
      await refreshGymly(userId);
      await refreshNotif(userId);
    } catch (e) {
      console.warn('acceptGymlyGroupInvite', e);
    }
  };

  const onDeclineInvite = async (inviteId: string) => {
    if (!userId) {
      return;
    }
    try {
      await declineGymlyGroupInvite(inviteId);
      await refreshGymly(userId);
      await refreshNotif(userId);
    } catch (e) {
      console.warn('declineGymlyGroupInvite', e);
    }
  };

  const isEmpty =
    !loading &&
    filteredMyGroups.length === 0 &&
    pendingInvites.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grupper</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('CreateGroup')}
          activeOpacity={0.8}>
          <Icon name="add-circle" size={24} color={colors.primary} />
          <Text style={styles.createButtonText}>Opret</Text>
        </TouchableOpacity>
      </View>

      <SocialSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Søg efter grupper..."
        style={styles.searchOuter}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Icon name="people-outline" size={80} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'Ingen grupper fundet' : 'Du er ikke med i nogen grupper endnu'}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'Prøv et andet søgeord'
                : 'Opret din første gruppe eller find en gruppe i dit område'}
            </Text>
            {!searchQuery && (
              <>
                <SocialPrimaryButton
                  label="Opret din første gruppe"
                  iconName="add-circle"
                  onPress={() => navigation.navigate('CreateGroup')}
                  style={styles.emptyCta}
                />
                <TouchableOpacity
                  style={styles.emptyCtaSecondary}
                  onPress={() => setSearchQuery('')}
                  activeOpacity={0.8}>
                  <Text style={styles.emptyCtaSecondaryText}>
                    Find en gruppe i dit område
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <>
            {pendingInvites.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invitationer</Text>
                {pendingInvites.map(inv => (
                  <Card key={inv.id} padding="md" style={styles.inviteCard}>
                    <Text style={styles.groupName}>{inv.group.name}</Text>
                    <Text style={styles.groupMeta}>Gruppeinvitation</Text>
                    <View style={styles.inviteActions}>
                      <TouchableOpacity
                        style={styles.inviteAccept}
                        onPress={() => void onAcceptInvite(inv.id)}
                        activeOpacity={0.85}>
                        <Text style={styles.inviteAcceptText}>Acceptér</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inviteDecline}
                        onPress={() => void onDeclineInvite(inv.id)}
                        activeOpacity={0.85}>
                        <Text style={styles.inviteDeclineText}>Afvis</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))}
              </View>
            )}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mine grupper</Text>
              {filteredMyGroups.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={styles.emptySectionText}>
                    Du er ikke med i nogen grupper endnu
                  </Text>
                  <TouchableOpacity
                    style={styles.sectionCta}
                    onPress={() => navigation.navigate('CreateGroup')}
                    activeOpacity={0.8}>
                    <Text style={styles.sectionCtaText}>Opret gruppe</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filteredMyGroups.map(group => {
                  const row = rowsById.get(group.id);
                  return (
                    <GroupCard
                      key={group.id}
                      group={group}
                      lastPreview={row?.last_message_preview}
                      onPress={() => handleGroupPress(group)}
                    />
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  createButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  searchOuter: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  scroll: {flex: 1},
  scrollContent: {paddingBottom: spacing.xxxl},
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  groupCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  groupCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupName: {
    ...typography.bodyBold,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  groupMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  focusBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.primary + '15',
    borderRadius: radius.sm,
  },
  focusText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  groupDescription: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  groupStats: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  joinButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  joinButtonText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  emptyCta: {
    marginTop: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  emptyCtaSecondary: {
    marginTop: spacing.md,
  },
  emptyCtaSecondaryText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  emptySection: {
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptySectionText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sectionCta: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  sectionCtaText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  inviteCard: {
    marginBottom: spacing.md,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  inviteAccept: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  inviteAcceptText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  inviteDecline: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  inviteDeclineText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
});

export default GroupsScreen;
