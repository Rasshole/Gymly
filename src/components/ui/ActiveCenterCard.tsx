/**
 * Kort: aktivt center med logo, mærke, afstand, total- og venne-tal + avatar-preview.
 */
import React from 'react';
import {View, Text, StyleSheet, Pressable, Image} from 'react-native';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {getLogoSource, getDefaultGymlyLogoAsset} from '@/services/gymLogoService';
import {formatDistance} from '@/utils/geoUtils';
import type {ActiveCenter} from '@/types/activeCenter.types';
import {useTranslation} from '@/i18n';

export type ActiveCenterCardProps = {
  center: ActiveCenter;
  onPress: () => void;
  maxAvatars?: number;
};

export const ActiveCenterCard: React.FC<ActiveCenterCardProps> = ({
  center,
  onPress,
  maxAvatars = 4,
}) => {
  const {t} = useTranslation();
  const logo = getLogoSource(center.danishGym?.brand, center.displayName);
  const avatars = center.activeFriends.slice(0, maxAvatars);
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <View style={styles.logoBox}>
          {logo.type === 'local' && logo.localAsset != null ? (
            <Image
              source={logo.localAsset}
              style={styles.logoImage}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={getDefaultGymlyLogoAsset()}
              style={styles.logoImage}
              resizeMode="contain"
            />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={2}>
            {center.displayName}
          </Text>
          {center.distanceMeters != null && (
            <Text style={styles.meta}>{formatDistance(center.distanceMeters)}</Text>
          )}
          <Text style={styles.counts}>
            {center.activeFriendsCount > 0
              ? t('activeCenter.activeAndFriends', {
                  count: center.totalActiveCount,
                  friends: center.activeFriendsCount,
                })
              : t('activeCenter.active', {count: center.totalActiveCount})}
          </Text>
        </View>
      </View>
      {avatars.length > 0 && (
        <View style={styles.avatarsRow}>
          {avatars.map((u, idx) => (
            <View
              key={u.userId}
              style={[styles.avatarWrap, {marginLeft: idx > 0 ? -8 : 0}]}>
              <UserAvatar
                name={u.displayName}
                imageUrl={u.avatarUrl ?? undefined}
                size="sm"
                showOnlineIndicator
                isOnline
              />
            </View>
          ))}
        </View>
      )}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {width: 40, height: 40},
  textCol: {flex: 1, minWidth: 0},
  name: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  counts: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: 6,
  },
  avatarsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: colors.backgroundCard,
    borderRadius: 20,
  },
});
