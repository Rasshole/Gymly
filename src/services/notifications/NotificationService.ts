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
];

class NotificationService {
  private static simulationInterval: NodeJS.Timeout | null = null;

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
      message: `${friendName} er nu på ${gym.name}`,
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
    import('@/data/danishGyms').then((module) => {
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
}

export default NotificationService;

