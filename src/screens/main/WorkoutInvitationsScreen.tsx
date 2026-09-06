/**
 * Workout Invitations Screen
 * Shows pending workout invitations and allows accepting/declining
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import EmptyState from '@/components/ui/EmptyState';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {format} from 'date-fns';
import colors from '@/theme/colors';
import {useTranslation, useMuscleLabel} from '@/i18n';

const WorkoutInvitationsScreen = () => {
  const {user} = useAppStore();
  const {
    getPendingInvitations,
    acceptInvitation,
    declineInvitation,
  } = useWorkoutInvitationStore();
  const {t, dateFnsLocale} = useTranslation();
  const muscleLabel = useMuscleLabel();

  const pendingInvitations = user
    ? getPendingInvitations(user.id)
    : [];

  const handleAccept = (invitationId: string) => {
    Alert.alert(
      t('workoutInvitations.acceptTitle'),
      t('workoutInvitations.acceptBody'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('workoutInvitations.acceptConfirm'),
          onPress: () => {
            acceptInvitation(invitationId);
            Alert.alert(
              t('workoutInvitations.acceptedTitle'),
              t('workoutInvitations.acceptedBody'),
            );
          },
        },
      ]
    );
  };

  const handleDecline = (invitationId: string) => {
    Alert.alert(
      t('workoutInvitations.declineTitle'),
      t('workoutInvitations.declineBody'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('workoutInvitations.declineConfirm'),
          style: 'destructive',
          onPress: () => {
            declineInvitation(invitationId);
          },
        },
      ]
    );
  };

  const formatDateTime = (date: Date) => {
    const dayPart = format(date, 'EEEE d. MMMM', {locale: dateFnsLocale});
    const timePart = format(date, 'HH:mm', {locale: dateFnsLocale});
    return `${dayPart} ${t('workoutInvitations.atTime', {time: timePart})}`;
  };

  const renderEmptyState = () => (
    <EmptyState
      icon="mail-outline"
      title={t('workoutInvitations.emptyTitle')}
      message={t('workoutInvitations.emptyBody')}
    />
  );

  const renderInvitation = ({item}: {item: any}) => (
    <View style={styles.invitationCard}>
      <View style={styles.invitationHeader}>
        <View style={styles.inviterInfo}>
          <View style={styles.inviterAvatar}>
            <Text style={styles.inviterAvatarText}>
              {item.fromUserName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.inviterName}>{item.fromUserName}</Text>
            <Text style={styles.invitationLabel}>
              {t('workoutInvitations.invitedYou')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.invitationDetails}>
        <View style={styles.detailRow}>
          <Icon name="time-outline" size={20} color="#007AFF" />
          <Text style={styles.detailText}>
            {formatDateTime(item.scheduledTime)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Icon name="fitness-outline" size={20} color="#007AFF" />
          <View style={styles.muscleGroupsContainer}>
            {item.muscleGroups.map((group: string, index: number) => (
              <View key={index} style={styles.muscleGroupTag}>
                <Text style={styles.muscleGroupTagText}>
                  {muscleLabel(group)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.invitationActions}>
        <TouchableOpacity
          style={styles.declineButton}
          onPress={() => handleDecline(item.id)}
          activeOpacity={0.7}>
          <Text style={styles.declineButtonText}>
            {t('workoutInvitations.declineConfirm')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAccept(item.id)}
          activeOpacity={0.7}>
          <Text style={styles.acceptButtonText}>
            {t('workoutInvitations.acceptConfirm')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingInvitations}
        renderItem={renderInvitation}
        keyExtractor={item => item.id}
        contentContainerStyle={
          pendingInvitations.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  invitationCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  invitationHeader: {
    marginBottom: 16,
  },
  inviterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  inviterAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  inviterName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  invitationLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  invitationDetails: {
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  muscleGroupsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft: 12,
    gap: 8,
  },
  muscleGroupTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  muscleGroupTagText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default WorkoutInvitationsScreen;
