/**
 * ProfileHeader – centreret avatar, navn, @brugernavn, Følgere / Følger / Venner
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '@/components/ui/Avatar';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type ProfileHeaderProps = {
  displayName: string;
  username: string;
  profileImageUrl?: string | null;
  /** Primært lokale center (valgfri linje under @username) */
  primaryCenterLabel?: string;
  bio?: string;
  showBio?: boolean;
  onEditPress?: () => void;
  followersCount?: number;
  followingCount?: number;
  friendsCount?: number;
};

const StatCol = ({value, label}: {value: number; label: string}) => (
  <View style={styles.statCol} accessibilityLabel={`${label}: ${value}`}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayName,
  username,
  profileImageUrl,
  primaryCenterLabel,
  bio,
  showBio = false,
  onEditPress,
  followersCount = 0,
  followingCount = 0,
  friendsCount = 0,
}) => (
  <View style={styles.container}>
    <View style={styles.centered}>
      <Avatar name={displayName} imageUrl={profileImageUrl} size="xl" />
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
            accessibilityLabel="Rediger profil">
            <Icon name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.username}>@{username}</Text>
      {primaryCenterLabel ? (
        <View style={styles.locationRow}>
          <Icon name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.location} numberOfLines={2}>
            {primaryCenterLabel}
          </Text>
        </View>
      ) : null}
    </View>

    <View style={styles.statsRow}>
      <StatCol value={followersCount} label="Følgere" />
      <StatCol value={followingCount} label="Følger" />
      <StatCol value={friendsCount} label="Venner" />
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
    ...typography.h4,
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  editIconBtn: {
    marginTop: 2,
  },
  username: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
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
