/**
 * Groups Screen
 * Community – mine grupper, foreslåede, opret, join
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {Card} from '@/components/ui/Card';
import {useGroups} from '@/hooks/data';
import type {Group} from '@/types/group.types';
import {useGroupStore} from '@/store/groupStore';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

const GroupCard = ({
  group,
  onPress,
  showJoinButton,
}: {
  group: Group;
  onPress: () => void;
  showJoinButton?: boolean;
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={styles.groupCard}>
    <View style={styles.groupCardHeader}>
      <View style={styles.groupIcon}>
        <Icon name="people" size={28} color={colors.primary} />
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
      {group.description}
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

const GroupsScreen = () => {
  const navigation = useNavigation<any>();
  const [searchQuery, setSearchQuery] = useState('');
  const storeGroups = useGroupStore(s => s.groups);
  const {groups: mockGroups} = useGroups('current_user');

  const myGroups = useMemo(() => {
    const fromMock = mockGroups.filter(g => g.isJoined);
    const fromStore = storeGroups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description || '',
      memberCount: g.members.length,
      isJoined: true,
      adminId: 'current',
      members: g.members.map(m => ({id: m.id, name: m.name, isOnline: false})),
      activityCount: 0,
      totalCheckIns: 0,
      createdAt: new Date(),
    }));
    return [...fromMock, ...fromStore];
  }, [storeGroups]);

  const suggestedGroups = useMemo(
    () =>
      mockGroups
        .filter(g => !g.isJoined)
        .filter(
          g =>
            !searchQuery.trim() ||
            g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (g.location?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (g.focus?.toLowerCase().includes(searchQuery.toLowerCase()))
        ),
    [searchQuery]
  );

  const filteredMyGroups = useMemo(
    () =>
      myGroups.filter(
        g =>
          !searchQuery.trim() ||
          g.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [myGroups, searchQuery]
  );

  const handleGroupPress = (group: Group) => {
    navigation.navigate('GroupDetail', {
      group: {
        ...group,
        members: (group.members ?? [{id: '1', name: 'Medlem', isOnline: false}]).map(m => ({
          ...m,
          isOnline: m.isOnline ?? false,
        })),
        totalWorkouts: group.activityCount ?? 0,
        totalTimeTogether: (group.totalCheckIns ?? 0) * 45,
        biography: group.description,
        createdAt: group.createdAt ?? new Date(),
      },
    });
  };

  const isEmpty = filteredMyGroups.length === 0 && suggestedGroups.length === 0;

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

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter grupper..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

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
                <TouchableOpacity
                  style={styles.emptyCta}
                  onPress={() => navigation.navigate('CreateGroup')}
                  activeOpacity={0.8}>
                  <Icon name="add-circle" size={24} color={colors.white} />
                  <Text style={styles.emptyCtaText}>Opret din første gruppe</Text>
                </TouchableOpacity>
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
                filteredMyGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onPress={() => handleGroupPress(group)}
                  />
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Foreslåede grupper</Text>
              {suggestedGroups.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={styles.emptySectionText}>
                    {searchQuery ? 'Ingen grupper matcher din søgning' : 'Ingen foreslåede grupper'}
                  </Text>
                </View>
              ) : (
                suggestedGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onPress={() => handleGroupPress(group)}
                    showJoinButton
                  />
                ))
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
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
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
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
    color: colors.text,
  },
  groupMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  emptyCtaText: {
    ...typography.bodyBold,
    color: colors.white,
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
});

export default GroupsScreen;
