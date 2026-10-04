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
import {getRuntimeLanguage, useTranslation} from '@/i18n';
import {displayFeedCaption} from '@/utils/workoutPostLocalization';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import {WorkoutSnapshotCard} from '@/components/personalRecords/WorkoutSnapshotCard';

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
  workoutSnapshot?: SharedWorkoutSnapshot | null;
  onWorkoutSnapshotPress?: () => void;
  onUserPress?: () => void;
  onReaction?: (type: 'bicep' | 'fire' | 'eyes') => void;
  commentCount?: number;
  onCommentPress?: () => void;
  onMenuPress?: () => void;
  bicepActive?: boolean;
  onBicepsCountPress?: () => void;
  onSharePress?: () => void;
  /** Open 1:1 DM with post author — omit for own/system posts */
  onMessagePress?: () => void;
  messageLabel?: string;
  messageA11yLabel?: string;
}

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
  workoutSnapshot,
  onWorkoutSnapshotPress,
  onUserPress,
  onReaction,
  commentCount = 0,
  onCommentPress,
  onMenuPress,
  bicepActive = false,
  onBicepsCountPress,
  onSharePress,
  onMessagePress,
  messageLabel,
  messageA11yLabel,
}) => {
  const {language} = useTranslation();
  const visibleCaption = displayFeedCaption(caption, language);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
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
                {formatWorkoutTypeDisplay(workoutType, getRuntimeLanguage())}
              </Text>
              <Text style={styles.metaDot}> • </Text>
              <Text style={styles.metaText}>{duration}</Text>
            </View>
          </View>
        </TouchableOpacity>
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
              activeOpacity={0.7}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="ellipsis-horizontal" size={17} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

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

      {workoutSnapshot ? (
        <View style={styles.snapshotWrap}>
          <WorkoutSnapshotCard
            snapshot={workoutSnapshot}
            onPress={onWorkoutSnapshotPress}
          />
        </View>
      ) : null}

      {/* Caption */}
      {visibleCaption ? (
        <Text style={styles.caption}>
          {visibleCaption}
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
          <Icon name="chatbubble-outline" size={18} color={colors.primary} />
          <Text style={styles.commentCount}>{commentCount}</Text>
        </TouchableOpacity>
        {onMessagePress ? (
          <TouchableOpacity
            style={styles.reactionButton}
            onPress={onMessagePress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={messageA11yLabel}>
            <Icon name="chatbubbles-outline" size={18} color={colors.primary} />
            {messageLabel ? (
              <Text style={styles.commentCount}>{messageLabel}</Text>
            ) : null}
          </TouchableOpacity>
        ) : null}
        {onSharePress ? (
          <TouchableOpacity
            style={styles.reactionButton}
            onPress={onSharePress}
            activeOpacity={0.7}>
            <Icon name="share-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
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
  snapshotWrap: {
    paddingHorizontal: spacing.md,
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
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: '#F1F5F9',
  },
  reactionButtonActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionCount: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  commentCount: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
});

export default GymlyPostCard;
