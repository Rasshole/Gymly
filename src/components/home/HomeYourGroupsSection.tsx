import React, {useCallback} from 'react';
import {View, Text, StyleSheet, Pressable, Image, Platform} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';
import {DashboardSection} from '@/components/dashboard';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

const HomeYourGroupsSection = () => {
  const navigation = useNavigation<any>();
  const {t} = useTranslation();
  const userId = useAppStore(s => s.user?.id);
  const groups = useGymlyGroupsStore(s => s.groups);
  const refresh = useGymlyGroupsStore(s => s.refresh);

  useFocusEffect(
    useCallback(() => {
      if (SURFACE_GROUPS_IN_APP && userId) {
        void refresh(userId);
      }
    }, [userId, refresh]),
  );

  if (!SURFACE_GROUPS_IN_APP) {
    return null;
  }

  const preview = groups.slice(0, 3);

  return (
    <DashboardSection
      title={t('home.yourGroups')}
      subtitle={t('groups.listSubtitle')}
      seeAllLabel={t('home.yourGroupsSeeAll')}
      onSeeAll={() => navigation.navigate('Friends', {screen: 'Grupper'})}
      alignSeeAllToTitle>
      {preview.length === 0 ? (
        <Pressable
          style={({pressed}) => [styles.emptyCard, pressed && styles.pressed]}
          onPress={() => navigation.navigate('CreateGroup')}>
          <View style={styles.emptyIcon}>
            <Icon name="people-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.emptyBody}>
            <Text style={styles.emptyTitle}>{t('home.yourGroupsEmptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('home.yourGroupsEmptySub')}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={styles.list}>
          {preview.map(g => (
            <Pressable
              key={g.id}
              style={({pressed}) => [styles.row, pressed && styles.pressed]}
              onPress={() =>
                navigation.navigate('GroupDetail', {
                  groupId: g.id,
                  group: {
                    id: g.id,
                    name: g.name,
                    description: g.description ?? '',
                    image: g.image_url ?? undefined,
                    adminId: g.created_by,
                    members: g.members,
                  },
                })
              }>
              {g.image_url ? (
                <Image source={{uri: g.image_url}} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Icon name="people" size={18} color={colors.white} />
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {t('groups.trainingNow', {count: g.activeTrainingCount})}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </DashboardSection>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: {flex: 1, minWidth: 0},
  emptyTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  emptySub: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  row: {
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
  pressed: {
    opacity: 0.92,
    transform: [{scale: 0.98}],
  },
  thumb: {width: 40, height: 40, borderRadius: radius.md},
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.18,
        shadowRadius: 4,
      },
      default: {},
    }),
  },
  rowBody: {flex: 1, minWidth: 0},
  rowName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  rowMeta: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 1,
  },
});

export default HomeYourGroupsSection;
