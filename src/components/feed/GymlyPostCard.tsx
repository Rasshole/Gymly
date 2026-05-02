/**
 * GymlyPostCard – Premium workout post card
 * Header: profile, username, gym, workout type, duration
 * Media, reactions (💪 🔥 👀), optional PR badge
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';

const MEDIA_HEIGHT = 280;

export interface GymlyPostReactions {
  bicep: number;
  fire: number;
  eyes: number;
}

export interface GymlyPostCardProps {
  userId: string;
  userName: string;
  /** Lille streak-ikon ved siden af navn (fx egen bruger) */
  streakEmoji?: string;
  userAvatar?: string | null;
  gymName: string;
  workoutType: string;
  duration: string;
  mediaUri?: string | null;
  caption?: string;
  reactions?: GymlyPostReactions;
  hasPR?: boolean;
  timestamp: string;
  onUserPress?: () => void;
  onReaction?: (type: 'bicep' | 'fire' | 'eyes') => void;
  commentCount?: number;
  onCommentPress?: () => void;
  onMenuPress?: () => void;
  bicepActive?: boolean;
  onBicepsCountPress?: () => void;
}

const WORKOUT_LABELS: Record<string, string> = {
  fri: 'Fri træning',
  styrke: 'Styrke',
  kondi: 'Kondition',
  ben: 'Ben',
  overkrop: 'Overkrop',
};

const GymlyPostCard: React.FC<GymlyPostCardProps> = ({
  userName,
  streakEmoji,
  userAvatar,
  gymName,
  workoutType,
  duration,
  mediaUri,
  caption,
  reactions = {bicep: 0, fire: 0, eyes: 0},
  hasPR,
  timestamp,
  onUserPress,
  onReaction,
  commentCount = 0,
  onCommentPress,
  onMenuPress,
  bicepActive = false,
  onBicepsCountPress,
}) => {
  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={onUserPress}
        activeOpacity={0.8}
        disabled={!onUserPress}>
        <UserAvatar name={userName} imageUrl={userAvatar} size="md" />
        <View style={styles.headerInfo}>
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{userName}</Text>
            {streakEmoji ? (
              <Text style={styles.streakEmoji}>{streakEmoji}</Text>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{gymName}</Text>
            <Text style={styles.metaDot}> • </Text>
            <Text style={styles.metaText}>
              {workoutType.includes(',')
                ? formatWorkoutTypeDisplay(workoutType)
                : WORKOUT_LABELS[workoutType] ?? formatWorkoutTypeDisplay(workoutType)}
            </Text>
            <Text style={styles.metaDot}> • </Text>
            <Text style={styles.metaText}>{duration}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {hasPR ? (
            <View style={styles.prBadge}>
              <Text style={styles.prText}>PR</Text>
            </View>
          ) : null}
          {onMenuPress ? (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={onMenuPress}
              activeOpacity={0.7}>
              <Icon name="ellipsis-horizontal" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Media */}
      {mediaUri && (
        <View style={styles.mediaContainer}>
          <Image
            source={{uri: mediaUri}}
            style={styles.media}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Caption */}
      {caption ? (
        <Text style={styles.caption} numberOfLines={3}>
          {caption}
        </Text>
      ) : null}

      {/* Reactions */}
      <View style={styles.reactionsRow}>
        <TouchableOpacity
          style={[styles.reactionButton, bicepActive && styles.reactionButtonActive]}
          onPress={() => onReaction?.('bicep')}
          activeOpacity={0.7}>
          <Text style={styles.reactionEmoji}>💪</Text>
          <TouchableOpacity
            onPress={onBicepsCountPress}
            disabled={!onBicepsCountPress}
            activeOpacity={0.7}>
            <Text style={styles.reactionCount}>{reactions.bicep}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reactionButton}
          onPress={onCommentPress}
          activeOpacity={0.7}>
          <Icon name="chatbubble-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.reactionCount}>{commentCount}</Text>
        </TouchableOpacity>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  userName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  streakEmoji: {
    fontSize: 15,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaDot: {
    ...typography.caption,
    color: colors.textMuted,
  },
  prBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.rankGold + '30',
    borderRadius: radius.sm,
  },
  headerRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  menuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prText: {
    ...typography.badge,
    color: colors.rankBronze,
    fontWeight: '800',
  },
  mediaContainer: {
    width: '100%',
    height: MEDIA_HEIGHT,
    backgroundColor: colors.surface,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  caption: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  reactionButtonActive: {
    backgroundColor: colors.primary + '12',
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionCount: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
});

export default GymlyPostCard;
