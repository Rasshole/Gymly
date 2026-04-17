/**
 * Chat types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isRead: boolean;
  imageUri?: string;
}

export interface Chat {
  id: string;
  participantIds: string[];
  participantNames: string[];
  lastMessage?: ChatMessage;
  lastActivity: Date;
  unreadCount: number;
  avatar?: string;
  avatarInitials?: string;
  isActive?: boolean;
}
