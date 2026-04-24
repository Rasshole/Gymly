/**
 * UserProfileModal – Mini profile when tapping a user in active session
 * Invite to workout, send reactions (🔥 💪)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import type {ActiveUser} from './ActiveUsersList';

export interface UserProfileModalProps {
  user: ActiveUser | null;
  visible: boolean;
  onClose: () => void;
}

const REACTIONS = [
  {emoji: '💪', label: 'Bicep'},
  {emoji: '🔥', label: 'Hype'},
  {emoji: '👀', label: 'Watching'},
];

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  visible,
  onClose,
}) => {
  if (!user) return null;

  const handleInvite = () => {
    // TODO: Navigate to InviteToWorkout with friendId
    onClose();
  };

  const handleReaction = (emoji: string) => {
    // TODO: Send reaction via Firestore/API
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={() => {}}>
              <View style={styles.avatarSection}>
                <UserAvatar
                  name={user.name}
                  imageUrl={user.avatar}
                  size="lg"
                  showOnlineIndicator
                  isOnline
                />
                <Text style={styles.userName}>{user.name}</Text>
                {user.isFriend && (
                  <View style={styles.friendLabel}>
                    <Icon name="people" size={12} color={colors.secondary} />
                    <Text style={styles.friendText}>Ven</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.inviteButton}
                onPress={handleInvite}
                activeOpacity={0.8}>
                <Icon name="person-add" size={20} color={colors.white} />
                <Text style={styles.inviteButtonText}>Inviter til træning</Text>
              </TouchableOpacity>

              <View style={styles.reactionsSection}>
                <Text style={styles.reactionsLabel}>Send reaktion</Text>
                <View style={styles.reactionsRow}>
                  {REACTIONS.map(({emoji, label}) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.reactionButton}
                      onPress={() => handleReaction(emoji)}
                      activeOpacity={0.8}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.8}>
                <Text style={styles.closeButtonText}>Luk</Text>
              </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  userName: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
  },
  friendLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  friendText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.secondary,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  inviteButtonText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  reactionsSection: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  reactionsLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  reactionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 24,
  },
  closeButton: {
    paddingVertical: spacing.sm,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

export default UserProfileModal;
