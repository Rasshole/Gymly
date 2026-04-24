/**
 * User Types
 * GDPR-compliant user data models
 */

export interface User {
  id: string;
  email: string;
  username: string;
  /** E.164, fx +4512345678 */
  phoneNumber?: string;
  displayName: string;
  profileImageUrl?: string;
  bicepsEmoji?: string; // User's chosen biceps emoji for likes
  bio?: string;
  birthYear?: number;
  trainingGoal?: string;

  // Profile information
  weight?: number; // Weight in kg
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: Date;
  city?: string;
  
  // Privacy settings
  privacySettings: PrivacySettings;
  
  // GDPR consent tracking
  gdprConsent: GDPRConsent;
  
  // Favorite gyms (top 3 local training centers)
  favoriteGyms?: string[]; // Stabile center-ids (max 3)
  
  // Account timestamps
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface PrivacySettings {
  profileVisibility: 'everyone' | 'friends' | 'friends_and_gyms' | 'private';
  locationSharingEnabled: boolean;
  showWorkoutHistory: boolean;
  allowFriendRequests: boolean;
  showOnlineStatus: boolean;
}

export interface GDPRConsent {
  // Required consents
  privacyPolicyAccepted: boolean;
  termsOfServiceAccepted: boolean;
  dataRetentionConsent: boolean;
  
  // Optional consents
  marketingConsent: boolean;
  analyticsConsent: boolean;
  locationTrackingConsent: boolean;
  
  // Consent metadata
  consentDate: Date;
  privacyPolicyVersion: string;
  termsOfServiceVersion: string;
  
  // Consent history for audit trail
  consentHistory: ConsentRecord[];
}

export interface ConsentRecord {
  id: string;
  type: ConsentType;
  accepted: boolean;
  version: string;
  timestamp: Date;
  ipAddress?: string; // For audit purposes
}

export type ConsentType = 
  | 'privacy_policy'
  | 'terms_of_service'
  | 'marketing'
  | 'analytics'
  | 'location_tracking'
  | 'data_retention';

export interface UserRegistration {
  email: string;
  username: string;
  /** Normaliseret dansk mobil, fx +4512345678 */
  phoneNumber: string;
  displayName: string;
  password: string;
  bicepsEmoji?: string; // User's chosen biceps emoji for likes
  profileImageUrl?: string;
  bio?: string;
  birthYear?: number;
  /** YYYY-MM-DD (lokal kalenderdag) */
  dateOfBirth?: string;
  trainingGoal?: string;
  gdprConsent: {
    privacyPolicyAccepted: boolean;
    termsOfServiceAccepted: boolean;
    marketingConsent: boolean;
    analyticsConsent: boolean;
    locationTrackingConsent?: boolean;
  };
  favoriteGyms?: string[]; // Stabile center-ids (max 3)
}

export interface UserLogin {
  email: string;
  password: string;
}

