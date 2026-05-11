/**
 * Detaljevisning for planlagt trænings-invitation — Deltag/Afvis i bunden.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Avatar from '@/components/ui/Avatar';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

export type PlannedInviteParticipantLine = {
  userId: string;
  name: string;
  role: 'creator' | 'invitee';
  responseStatus: 'pending' | 'accepted' | 'declined';
};

export type PlannedSessionInviteDetailModalProps = {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  inviterName: string;
  inviterAvatarUrl?: string;
  trainingLine: string;
  centerLine: string;
  addressLine?: string;
  dateLine: string;
  timeLine: string;
  noteLine?: string | null;
  participants: PlannedInviteParticipantLine[];
  /** Nuværende bruger er inviteret og afventer svar */
  showRespondActions: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

const PlannedSessionInviteDetailModal: React.FC<PlannedSessionInviteDetailModalProps> = ({
  visible,
  loading,
  onClose,
  inviterName,
  inviterAvatarUrl,
  trainingLine,
  centerLine,
  addressLine,
  dateLine,
  timeLine,
  noteLine,
  participants,
  showRespondActions,
  busy,
  onAccept,
  onDecline,
}) => {
  const insets = useSafeAreaInsets();

  const statusLabel = (p: PlannedInviteParticipantLine) => {
    if (p.role === 'creator') {
      return 'Vært';
    }
    if (p.responseStatus === 'accepted') {
      return 'Deltager';
    }
    if (p.responseStatus === 'declined') {
      return 'Har afvist';
    }
    return 'Afventer svar';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Luk" />
        <View
          style={[
            styles.card,
            {
              paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
            },
          ]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Invitation</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Luk">
              <Icon name="close" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Henter detaljer…</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.inviterRow}>
                <Avatar name={inviterName} imageUrl={inviterAvatarUrl} size="lg" />
                <View style={styles.inviterTextCol}>
                  <Text style={styles.inviterLabel}>Inviteret af</Text>
                  <Text style={styles.inviterName} numberOfLines={2}>
                    {inviterName}
                  </Text>
                </View>
              </View>

              <View style={styles.detailBlock}>
                <Text style={styles.detailEmoji}>💪</Text>
                <Text style={styles.detailValue}>{trainingLine}</Text>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailEmoji}>📍</Text>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailValue}>{centerLine}</Text>
                  {addressLine ? (
                    <Text style={styles.detailMuted} numberOfLines={2}>
                      {addressLine}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.detailBlock}>
                <Text style={styles.detailEmoji}>🗓</Text>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailValue}>{dateLine}</Text>
                  <Text style={styles.detailMuted}>{timeLine}</Text>
                </View>
              </View>

              {noteLine ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Note</Text>
                  <Text style={styles.noteText}>{noteLine}</Text>
                </View>
              ) : null}

              {participants.length > 0 ? (
                <View style={styles.participantsSection}>
                  <Text style={styles.sectionTitle}>Deltagere</Text>
                  {participants.map(p => (
                    <View key={p.userId} style={styles.participantRow}>
                      <Text style={styles.participantName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.participantStatus}>{statusLabel(p)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}

          {showRespondActions && !loading ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnMuted]}
                onPress={onDecline}
                disabled={busy}
                activeOpacity={0.85}>
                <Text style={styles.btnMutedText}>Afvis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={onAccept}
                disabled={busy}
                activeOpacity={0.85}>
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.btnPrimaryText}>Deltag</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : !loading && !showRespondActions ? (
            <Text style={styles.closedHint}>
              Invitationen er ikke længere aktiv — tjek Planlagte sessions.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '90%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  inviterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: spacing.lg,
  },
  inviterTextCol: {
    flex: 1,
    minWidth: 0,
  },
  inviterLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  inviterName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  detailBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  detailEmoji: {
    fontSize: 18,
    marginTop: 2,
  },
  detailTextCol: {
    flex: 1,
    minWidth: 0,
  },
  detailValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  detailMuted: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  noteLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  noteText: {
    ...typography.small,
    color: colors.text,
  },
  participantsSection: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  participantName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  participantStatus: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnMuted: {
    backgroundColor: colors.surface,
  },
  btnMutedText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  closedHint: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});

export default PlannedSessionInviteDetailModal;
