/**
 * Notification Service
 * Handles sending notifications when friends check in
 * In a real app, this would connect to a backend/WebSocket
 */

import {useNotificationStore} from '@/store/notificationStore';
import {DanishGym} from '@/data/danishGyms';

// Mock friends list - in a real app, this would come from the backend
const mockFriends = [
  {id: '1', name: 'Jeff'},
  {id: '2', name: 'Marie'},
  {id: '3', name: 'Lars'},
  {id: '4', name: 'Sofia'},
  {id: '5', name: 'Patti'},
];

class NotificationService {
  private static simulationInterval: NodeJS.Timeout | null = null;

  /**
   * Send a workout invite notification to vores (mock) venner
   */
  static sendWorkoutInvite(
    inviterName: string,
    gym: DanishGym,
    musclesDescription: string,
    friendIds?: string[],
    planId?: string,
    scheduledAt?: Date,
    muscles?: string[],
  ) {
    if (!gym) {
      console.warn('sendWorkoutInvite called without gym');
      return;
    }
    const {addNotification} = useNotificationStore.getState();
    const workoutText = musclesDescription || 'en træning';
    const recipients =
      friendIds && friendIds.length > 0
        ? mockFriends.filter(friend => friendIds.includes(friend.id))
        : mockFriends;

    recipients.forEach(friend => {
      addNotification({
        type: 'workout_invite',
        title: `${inviterName} inviterer dig`,
        message: `${inviterName} træner ${workoutText} på ${gym.name}`,
        friendName: inviterName,
        gymName: gym.name,
        isActive: false,
        planId,
        gymId: gym.id,
        muscles: muscles || [],
        scheduledAt: scheduledAt || new Date(),
      });
    });
  }

  /**
   * Notify inviter that a friend has joined their workout
   */
  static notifyInviteAccepted(inviterName: string, joinerName: string, gymName: string) {
    const {addNotification} = useNotificationStore.getState();
    addNotification({
      type: 'invite_response',
      title: `${joinerName} joiner din træning`,
      message: `${joinerName} deltager på ${gymName}`,
      friendName: joinerName,
      gymName,
      isActive: false,
    });
  }

  /**
   * Simulate a friend checking in
   * In a real app, this would be triggered by a WebSocket message or push notification
   */
  static simulateFriendCheckIn(friendName: string, gym: DanishGym) {
    const {addNotification, checkOutFriend} = useNotificationStore.getState();
    const checkInTime = new Date();

    addNotification({
      type: 'friend_checkin',
      title: `${friendName} har tjekket ind`,
      message: `${friendName} er nu i`,
      friendName,
      gymName: gym.name,
      checkInTime,
      isActive: true,
    });

    // Simulate check-out after a random time (5-30 minutes)
    const checkOutDelay = Math.random() * 25 * 60 * 1000 + 5 * 60 * 1000; // 5-30 minutes
    setTimeout(() => {
      checkOutFriend(friendName);
    }, checkOutDelay);
  }

  /**
   * Simulate random friend check-ins for testing
   * This would normally be handled by the backend
   */
  static simulateRandomCheckIn() {
    const randomFriend = mockFriends[Math.floor(Math.random() * mockFriends.length)];
    // Import dynamically to avoid circular dependencies
    import('@/data/danishGyms').then(module => {
      const danishGyms = module.default;
      const randomGym = danishGyms[Math.floor(Math.random() * danishGyms.length)];
      this.simulateFriendCheckIn(randomFriend.name, randomGym);
    });
  }

  /**
   * Start simulating friend check-ins (for testing)
   * In production, this would be replaced by WebSocket connection
   */
  static startSimulatingCheckIns(intervalMs: number = 10000) {
    // Stop any existing simulation
    this.stopSimulatingCheckIns();

    // Simulate first check-in after 3 seconds
    setTimeout(() => {
      this.simulateRandomCheckIn();
    }, 3000);

    // Then simulate every intervalMs
    this.simulationInterval = setInterval(() => {
      this.simulateRandomCheckIn();
    }, intervalMs);
  }

  /**
   * Stop simulating check-ins
   */
  static stopSimulatingCheckIns() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Send a friend request notification
   */
  static sendFriendRequestNotification(friendId: string, requesterName: string) {
    const {addNotification} = useNotificationStore.getState();
    addNotification({
      type: 'friend_request',
      title: 'Ny venneanmodning',
      message: `${requesterName} vil gerne være venner med dig`,
      friendName: requesterName,
      isActive: false,
    });
  }

  /**
   * Send a mention notification when someone tags a user in a workout post
   */
  static sendMentionNotification(mentionerName: string, mentionedName: string, workoutText: string) {
    const {addNotification} = useNotificationStore.getState();
    addNotification({
      type: 'friend_request', // Using existing type, could add 'mention' type later
      title: `${mentionerName} har tagget dig`,
      message: `${mentionerName} har tagget dig i ${workoutText}`,
      friendName: mentionerName,
      isActive: false,
    });
  }
}

export default NotificationService;

