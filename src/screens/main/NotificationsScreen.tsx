/**
 * Notifications Screen
 * Shows notifications when friends check in
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useNotificationStore, Notification} from '@/store/notificationStore';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import NotificationService from '@/services/notifications/NotificationService';
import {formatDistanceToNow} from 'date-fns';
import {da} from 'date-fns/locale';
import {colors} from '@/theme/colors';

const NotificationsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user} = useAppStore();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    markInviteJoined,
  } = useNotificationStore();
  const {getPendingInvitations, acceptInvitation} = useWorkoutInvitationStore();
  const {acceptPlanInvite} = useWorkoutPlanStore();
  const [currentTime, setCurrentTime] = useState(new Date());

  const pendingInvitations = user ? getPendingInvitations(user.id) : [];

  // Update time every second to refresh the timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    try {
      return formatDistanceToNow(date, {addSuffix: true, locale: da});
    } catch {
      return 'Lige nu';
    }
  };

  const formatDuration = (checkInTime: Date, isActive: boolean) => {
    if (!isActive) return null;
    
    const diff = currentTime.getTime() - checkInTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      if (remainingMinutes > 0) {
        return `${hours}t ${remainingMinutes}m`;
      }
      return `${hours}t`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      if (remainingSeconds > 0) {
        return `${minutes}m ${remainingSeconds}s`;
      }
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="notifications-outline" size={80} color="#C7C7CC" />
      <Text style={styles.emptyTitle}>Ingen notifikationer</Text>
      <Text style={styles.emptyText}>
        Når dine venner tjekker ind på gym, vil du få notifikationer her.
      </Text>
    </View>
  );

  const handleJoinWorkout = (notification: Notification) => {
    if (notification.type !== 'workout_invite' && notification.type !== 'friend_checkin') {
      return;
    }

    const {user} = useAppStore.getState();
    const joinerName = user?.displayName || 'En ven';

    if (notification.joined) {
      // Remove join request - toggle back
      markInviteJoined(notification.id);
    } else {
      // Add join request
      markInviteJoined(notification.id);

      if (notification.type === 'workout_invite') {
    if (notification.planId && user) {
      acceptPlanInvite(notification.planId, user.id);
    }

    if (notification.friendName) {
      NotificationService.notifyInviteAccepted(
        notification.friendName,
        joinerName,
        notification.gymName || 'dit center',
      );
    }

    if (notification.planId) {
      navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
        }
      } else if (notification.type === 'friend_checkin') {
        // Handle joining friend's active workout
        // In a real app, this would send a request to join the friend's session
      }
    }
  };

  const renderNotificationItem = ({item}: {item: Notification}) => {
    const getIcon = () => {
      switch (item.type) {
        case 'friend_checkin':
          return 'location';
        case 'friend_request':
          return 'person-add';
        case 'workout_invite':
          return 'fitness';
        case 'invite_response':
          return 'checkmark-done-outline';
        case 'message':
          return 'chatbubble';
        default:
          return 'notifications';
      }
    };

    const getIconColor = () => {
      if (item.read) return '#8E8E93';
      return item.type === 'friend_checkin' ? '#34C759' : '#007AFF';
    };

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unreadItem]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.7}>
        <View style={[styles.iconContainer, {backgroundColor: getIconColor() + '20'}]}>
          <Icon name={getIcon()} size={24} color={getIconColor()} />
        </View>
        <View style={styles.notificationContent}>
          {item.type === 'friend_checkin' ? (
            <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
              {item.friendName} er nu i{' '}
              {item.gymName && <Text style={styles.gymNameText}>{item.gymName}</Text>}
            </Text>
          ) : (
            <>
          <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
            {item.title}
          </Text>
          <Text style={styles.notificationMessage}>
            {item.message}
              </Text>
            </>
            )}
          {item.type === 'friend_checkin' && item.checkInTime && item.isActive && (
            <View style={styles.durationContainer}>
              <Icon name="time-outline" size={12} color="#34C759" />
              <Text style={styles.durationText}>
                Aktiv i {formatDuration(item.checkInTime, item.isActive)}
              </Text>
            </View>
          )}
          {item.type === 'friend_checkin' && item.checkInTime && !item.isActive && (
            <Text style={styles.checkOutText}>
              Forlod {item.gymName || 'gymmet'} {formatTime(item.checkOutTime || item.timestamp)}
            </Text>
          )}
          {item.type !== 'friend_checkin' && (
            <Text style={styles.notificationTime}>{formatTime(item.timestamp)}</Text>
          )}
          {item.type === 'workout_invite' && item.scheduledAt && (
            <Text style={styles.scheduledTime}>
              {new Date(item.scheduledAt).toLocaleString('da-DK', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>
        {!item.read && !item.joined && <View style={styles.unreadDot} />}
        {(item.type === 'workout_invite' || item.type === 'friend_checkin') ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              onPress={() => handleJoinWorkout(item)}
              style={[
                styles.joinButton,
                item.joined && styles.joinButtonJoined,
              ]}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.joinButtonText,
                  item.joined && styles.joinButtonTextJoined,
                ]}>
                {item.joined ? 'Anmodet' : 'Deltag'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => removeNotification(item.id)}
              style={styles.deleteButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => removeNotification(item.id)}
            style={styles.deleteButton}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="close" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {pendingInvitations.length > 0 && (
        <View style={styles.invitationsBanner}>
          <View style={styles.invitationsBannerContent}>
            <Icon name="fitness" size={20} color="#007AFF" />
            <Text style={styles.invitationsBannerText}>
              {pendingInvitations.length} træningsinvitation{pendingInvitations.length > 1 ? 'er' : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('WorkoutInvitations')}
            style={styles.invitationsBannerButton}>
            <Text style={styles.invitationsBannerButtonText}>Se</Text>
            <Icon name="chevron-forward" size={16} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}
      {notifications.length > 0 && unreadCount > 0 && (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllReadButton}>
            <Text style={styles.markAllReadText}>Marker alle som læst</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotificationItem}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={
          notifications.length === 0 && styles.centerEmptyState
        }
        extraData={currentTime} // Re-render when time updates
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // In a real app, this would fetch new notifications
            }}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  invitationsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  invitationsBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  invitationsBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
    marginLeft: 8,
  },
  invitationsBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  invitationsBannerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
    marginRight: 4,
  },
  centerEmptyState: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  markAllReadButton: {
    alignSelf: 'flex-end',
  },
  markAllReadText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  unreadItem: {
    backgroundColor: '#F0F9FF',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  gymNameText: {
    fontSize: 16,
    color: colors.secondary,
    fontWeight: '600',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  durationText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
    marginLeft: 4,
  },
  checkOutText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    marginRight: 8,
  },
  deleteButton: {
    padding: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  joinButtonJoined: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: '#CBD5F5',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  joinButtonTextJoined: {
    color: colors.text,
  },
  scheduledTime: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
    fontWeight: '600',
  },
});

export default NotificationsScreen;

