/**
 * GymPresenceCard – active gym card with user count and avatars
 * Used on HomeScreen and GymPresenceScreen
 */

import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from './UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, shadows} from '@/theme/designTokens';
import {typography} from '@/theme/designTokens';
import type {GymPresence} from '@/types/gymPresence.types';
import {useTranslation} from '@/i18n';

export type GymPresenceCardProps = {
  gym: GymPresence;
  onPress: () => void;
  /** Max avatars to show in preview (default 4) */
  maxAvatars?: number;
};

export const GymPresenceCard: React.FC<GymPresenceCardProps> = ({
  gym,
  onPress,
  maxAvatars = 4,
}) => {
  const {t} = useTranslation();
  const avatarsToShow = gym.userList.slice(0, maxAvatars);

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name="flame" size={22} color={colors.primary} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.gymName} numberOfLines={1}>
            {gym.gymName}
          </Text>
          <Text style={styles.userCount}>
            {t('gymPresence.trainingNow', {count: gym.activeUsers})}
          </Text>
        </View>
      </View>
      <View style={styles.avatarsRow}>
        {avatarsToShow.map((user, idx) => (
          <View key={user.id} style={[styles.avatarWrap, {marginLeft: idx > 0 ? -8 : 0}]}>
            <UserAvatar
              name={user.name}
              imageUrl={user.avatar}
              size="sm"
              showOnlineIndicator
              isOnline
            />
          </View>
        ))}
      </View>
      <Text style={styles.cta}>Se hvem</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    ...shadows.card,
  },
  cardPressed: {
    backgroundColor: colors.primary + '08',
    opacity: 0.98,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  gymName: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  userCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: colors.backgroundCard,
    borderRadius: 20,
  },
  cta: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
});
