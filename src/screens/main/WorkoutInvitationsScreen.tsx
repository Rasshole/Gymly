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
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {format} from 'date-fns';
import {da} from 'date-fns/locale';
import {colors} from '@/theme/colors';

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  hele_kroppen: 'Hele kroppen',
};

const WorkoutInvitationsScreen = () => {
  const {user} = useAppStore();
  const {
    invitations,
    getPendingInvitations,
    acceptInvitation,
    declineInvitation,
  } = useWorkoutInvitationStore();

  const pendingInvitations = user
    ? getPendingInvitations(user.id)
    : [];

  const handleAccept = (invitationId: string) => {
    Alert.alert(
      'Accepter invitation',
      'Vil du acceptere denne træningsinvitation?',
      [
        {
          text: 'Annuller',
          style: 'cancel',
        },
        {
          text: 'Accepter',
          onPress: () => {
            acceptInvitation(invitationId);
            Alert.alert(
              'Invitation accepteret',
              'I har nu oprettet en gruppe træning sammen!'
            );
          },
        },
      ]
    );
  };

  const handleDecline = (invitationId: string) => {
    Alert.alert(
      'Afvis invitation',
      'Er du sikker på, at du vil afvise denne invitation?',
      [
        {
          text: 'Annuller',
          style: 'cancel',
        },
        {
          text: 'Afvis',
          style: 'destructive',
          onPress: () => {
            declineInvitation(invitationId);
          },
        },
      ]
    );
  };

  const formatDateTime = (date: Date) => {
    return format(date, "EEEE d. MMMM 'kl.' HH:mm", {locale: da});
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="mail-outline" size={80} color="#C7C7CC" />
      <Text style={styles.emptyTitle}>Ingen invitationer</Text>
      <Text style={styles.emptyText}>
        Du har ingen ventende træningsinvitationer
      </Text>
    </View>
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
            <Text style={styles.invitationLabel}>har inviteret dig til træning</Text>
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
                  {MUSCLE_GROUP_LABELS[group] || group}
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
          <Text style={styles.declineButtonText}>Afvis</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAccept(item.id)}
          activeOpacity={0.7}>
          <Text style={styles.acceptButtonText}>Accepter</Text>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
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

