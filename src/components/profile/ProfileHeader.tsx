/**
 * ProfileHeader – centreret avatar, navn, @brugernavn, Venner
 */

import React, {useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Animated} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '@/components/ui/Avatar';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

type ProfileHeaderProps = {
  displayName: string;
  username: string;
  profileImageUrl?: string | null;
  /** Primært lokale center (valgfri linje under @username) */
  primaryCenterLabel?: string;
  bio?: string;
  showBio?: boolean;
  onEditPress?: () => void;
  activeStatus?: string;
  friendsCount?: number;
  onFriendsPress?: () => void;
};

const StatCol = ({value, label}: {value: number; label: string}) => (
  <View style={styles.statCol} accessibilityLabel={`${label}: ${value}`}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const StatColButton = ({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[styles.statCol, {transform: [{scale}]}]}>
      <TouchableOpacity
        style={styles.statInner}
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.97,
            friction: 7,
            tension: 300,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            friction: 7,
            tension: 260,
            useNativeDriver: true,
          }).start()
        }
        activeOpacity={0.8}
        accessibilityLabel={`${label}: ${value}`}
        accessibilityRole="button">
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayName,
  username,
  profileImageUrl,
  primaryCenterLabel,
  bio,
  showBio = false,
  onEditPress,
  activeStatus,
  friendsCount = 0,
  onFriendsPress,
}) => {
  const {t} = useTranslation();
  const friendsLabel = t('profile.friends');

  return (
    <View style={styles.container}>
      <View style={styles.centered}>
        <View style={styles.avatarRingOuter}>
          <View style={styles.avatarRingInner}>
            <Avatar name={displayName} imageUrl={profileImageUrl} size="xl" />
          </View>
        </View>
      <View style={styles.nameRow}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        {onEditPress ? (
          <TouchableOpacity
            onPress={onEditPress}
            style={styles.editIconBtn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editProfile')}>
            <Icon name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.username}>@{username}</Text>
      {activeStatus ? (
        <Text style={styles.activeStatus} numberOfLines={1}>
          {activeStatus}
        </Text>
      ) : null}
      {primaryCenterLabel ? (
        <View style={styles.locationRow}>
          <Icon name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.location} numberOfLines={2}>
            {primaryCenterLabel}
          </Text>
        </View>
      ) : null}
    </View>

    <View style={styles.statsSection}>
      {onFriendsPress ? (
        <StatColButton
          value={friendsCount}
          label={friendsLabel}
          onPress={onFriendsPress}
        />
      ) : (
        <StatCol value={friendsCount} label={friendsLabel} />
      )}
    </View>

    {showBio && bio && bio.trim().length > 0 ? (
      <Text style={styles.bio}>{bio}</Text>
    ) : null}
    {showBio && (!bio || bio.trim().length === 0) && onEditPress ? (
      <TouchableOpacity
        style={styles.bioPlaceholder}
        onPress={onEditPress}
        activeOpacity={0.8}>
        <Icon name="add-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.bioPlaceholderText}>Tilføj en bio</Text>
      </TouchableOpacity>
    ) : null}
  </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  centered: {
    alignItems: 'center',
  },
  avatarRingOuter: {
    width: 108,
    height: 108,
    borderRadius: 54,
    padding: 3,
    backgroundColor: colors.primary + '40',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarRingInner: {
    flex: 1,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary + '2A',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: '100%',
  },
  displayName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
    fontWeight: '800',
  },
  editIconBtn: {
    marginTop: 2,
  },
  username: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  activeStatus: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.xs,
    backgroundColor: colors.primary + '14',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  location: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    flex: 1,
  },
  statsSection: {
    marginTop: spacing.lg + 2,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCol: {
    alignItems: 'center',
    minWidth: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  statInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  bio: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  bioPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.primary + '08',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderStyle: 'dashed',
  },
  bioPlaceholderText: {
    ...typography.small,
    color: colors.primary,
  },
});
