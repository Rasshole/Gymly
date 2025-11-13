/**
 * User Types
 * GDPR-compliant user data models
 */

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  
  // Privacy settings
  privacySettings: PrivacySettings;
  
  // GDPR consent tracking
  gdprConsent: GDPRConsent;
  
  // Account timestamps
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface PrivacySettings {
  profileVisibility: 'everyone' | 'friends' | 'private';
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
  displayName: string;
  password: string;
  gdprConsent: {
    privacyPolicyAccepted: boolean;
    termsOfServiceAccepted: boolean;
    marketingConsent: boolean;
    analyticsConsent: boolean;
  };
}

export interface UserLogin {
  email: string;
  password: string;
}

