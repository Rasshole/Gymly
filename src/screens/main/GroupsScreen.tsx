/**
 * Groups Screen — MVP list under Venner → Grupper
 * Visuelt aligned med Venner / Beskeder listecards + premium CTA.
 */

import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {UserAvatar} from '@/components/ui/UserAvatar';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {useAppStore} from '@/store/appStore';
import {
  useGymlyGroupsStore,
  type EnrichedGymlyGroup,
} from '@/store/gymlyGroupsStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {
  acceptGymlyGroupInvite,
  declineGymlyGroupInvite,
} from '@/services/supabase/gymlyGroupsService';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

const MAX_STACK_AVATARS = 3;

const listCardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: {elevation: 2},
});

const GroupCard = ({
  group,
  onPress,
  memberLabel,
  trainingLabel,
}: {
  group: EnrichedGymlyGroup;
  onPress: () => void;
  memberLabel: string;
  trainingLabel: string;
}) => {
  const avatars = group.members.slice(0, MAX_STACK_AVATARS);
  const hasActive = group.activeTrainingCount > 0;

  return (
    <Pressable
      style={({pressed}) => [
        styles.groupCard,
        hasActive && styles.groupCardActive,
        pressed && styles.groupCardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={group.name}>
      {group.image_url ? (
        <Image source={{uri: group.image_url}} style={styles.groupImage} />
      ) : (
        <View style={styles.groupImagePlaceholder}>
          <Icon name="people" size={22} color={colors.white} />
        </View>
      )}
      <View style={styles.groupCardBody}>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.groupMeta} numberOfLines={1}>
          {memberLabel} · {trainingLabel}
        </Text>
        {avatars.length > 0 ? (
          <View style={styles.avatarStack}>
            {avatars.map((m, i) => (
              <View
                key={m.id}
                style={[
                  styles.avatarStackItem,
                  {marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i},
                ]}>
                <UserAvatar name={m.name} imageUrl={m.avatar} size="xs" />
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
};

const GroupsScreen = () => {
  const navigation = useNavigation<any>();
  const {t} = useTranslation();
  const userId = useAppStore(s => s.user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const serverGroups = useGymlyGroupsStore(s => s.groups);
  const pendingInvites = useGymlyGroupsStore(s => s.pendingInvites);
  const loading = useGymlyGroupsStore(s => s.loading);
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);
  const refreshNotif = useInAppNotificationStore(s => s.refresh);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        void refreshGymly(userId);
      }
    }, [userId, refreshGymly]),
  );

  const filteredMyGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return serverGroups;
    }
    return serverGroups.filter(g => g.name.toLowerCase().includes(q));
  }, [serverGroups, searchQuery]);

  const handleGroupPress = (group: EnrichedGymlyGroup) => {
    navigation.navigate('GroupDetail', {
      groupId: group.id,
      group: {
        id: group.id,
        name: group.name,
        description: group.description ?? '',
        image: group.image_url ?? undefined,
        isPrivate: group.is_private,
        adminId: group.created_by,
        members: group.members.map(m => ({
          id: m.id,
          name: m.name,
          avatar: m.avatar,
        })),
        createdAt: group.created_at,
      },
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

  const openCreate = () => navigation.navigate('CreateGroup');

  const isEmpty =
    !loading && filteredMyGroups.length === 0 && pendingInvites.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('groups.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('groups.listSubtitle')}</Text>
      </View>

      <SocialSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('groups.searchPlaceholder')}
        style={styles.searchOuter}
      />

      {loading && serverGroups.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isEmpty && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <SocialPrimaryButton
            label={t('groups.createSubmit')}
            iconName="add-circle-outline"
            onPress={openCreate}
            variant="premium"
            style={styles.createBanner}
          />

          {isEmpty ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Icon name="people-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? t('groups.emptySearchTitle') : t('groups.emptyTitle')}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery ? t('groups.emptySearchSub') : t('groups.emptySub')}
              </Text>
            </View>
          ) : (
            <>
              {pendingInvites.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('groups.invites')}</Text>
                  {pendingInvites.map(inv => (
                    <View key={inv.id} style={styles.inviteCard}>
                      <Text style={styles.groupName}>{inv.group.name}</Text>
                      <Text style={styles.inviteHint}>{t('groups.inviteHint')}</Text>
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={styles.inviteAccept}
                          onPress={() => void onAcceptInvite(inv.id)}
                          activeOpacity={0.85}>
                          <Text style={styles.inviteAcceptText}>{t('groups.accept')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inviteDecline}
                          onPress={() => void onDeclineInvite(inv.id)}
                          activeOpacity={0.85}>
                          <Text style={styles.inviteDeclineText}>{t('groups.decline')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                {filteredMyGroups.length === 0 ? (
                  <Text style={styles.emptySectionText}>{t('groups.noMatch')}</Text>
                ) : (
                  filteredMyGroups.map(group => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      memberLabel={t('groups.memberCount', {
                        count: group.member_count || group.members.length,
                      })}
                      trainingLabel={t('groups.trainingNow', {
                        count: group.activeTrainingCount,
                      })}
                      onPress={() => handleGroupPress(group)}
                    />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 5,
    lineHeight: 20,
  },
  searchOuter: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  createBanner: {
    marginBottom: spacing.md,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xs,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  section: {marginTop: spacing.xs},
  sectionTitle: {
    ...typography.sectionCaps,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  groupCardActive: {
    backgroundColor: colors.primary + '06',
    borderColor: colors.primary + '28',
  },
  groupCardPressed: {
    opacity: 0.92,
    transform: [{scale: 0.985}],
  },
  groupImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: spacing.md,
  },
  groupImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: spacing.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  groupCardBody: {flex: 1, minWidth: 0, marginRight: spacing.xs},
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  groupMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  avatarStackItem: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  inviteCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    ...listCardShadow,
  },
  inviteHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  inviteActions: {flexDirection: 'row', gap: spacing.sm},
  inviteAccept: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inviteAcceptText: {
    color: colors.white,
    fontWeight: '700',
  },
  inviteDecline: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteDeclineText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    transform: [{translateY: -24}],
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  emptyTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  emptySectionText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

export default GroupsScreen;
