/**
 * Privacy Service
 * GDPR Compliance Management
 * Handles consent management, data export, and data deletion requests
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {ConsentRecord, ConsentType, GDPRConsent} from '@/types/user.types';

class PrivacyService {
  private readonly CONSENT_KEY = 'gdpr_consent';
  private readonly CONSENT_HISTORY_KEY = 'consent_history';
  
  // Current versions
  private readonly PRIVACY_POLICY_VERSION = '1.0.0';
  private readonly TERMS_OF_SERVICE_VERSION = '1.0.0';

  /**
   * Save GDPR consent
   */
  async saveConsent(consent: GDPRConsent): Promise<void> {
    try {
      await AsyncStorage.setItem(this.CONSENT_KEY, JSON.stringify(consent));
    } catch (error) {
      console.error('Error saving consent:', error);
      throw error;
    }
  }

  /**
   * Get GDPR consent
   */
  async getConsent(): Promise<GDPRConsent | null> {
    try {
      const consentData = await AsyncStorage.getItem(this.CONSENT_KEY);
      return consentData ? JSON.parse(consentData) : null;
    } catch (error) {
      console.error('Error getting consent:', error);
      return null;
    }
  }

  /**
   * Check if user has accepted required consents
   */
  async hasRequiredConsents(): Promise<boolean> {
    const consent = await this.getConsent();
    if (!consent) return false;
    
    return (
      consent.privacyPolicyAccepted &&
      consent.termsOfServiceAccepted &&
      consent.dataRetentionConsent
    );
  }

  /**
   * Record consent change (for audit trail)
   */
  async recordConsent(
    type: ConsentType,
    accepted: boolean,
    version: string = '1.0.0'
  ): Promise<void> {
    try {
      const record: ConsentRecord = {
        id: Date.now().toString(),
        type,
        accepted,
        version,
        timestamp: new Date(),
      };

      const historyData = await AsyncStorage.getItem(this.CONSENT_HISTORY_KEY);
      const history: ConsentRecord[] = historyData ? JSON.parse(historyData) : [];
      history.push(record);

      await AsyncStorage.setItem(
        this.CONSENT_HISTORY_KEY,
        JSON.stringify(history)
      );
    } catch (error) {
      console.error('Error recording consent:', error);
      throw error;
    }
  }

  /**
   * Get consent history
   */
  async getConsentHistory(): Promise<ConsentRecord[]> {
    try {
      const historyData = await AsyncStorage.getItem(this.CONSENT_HISTORY_KEY);
      return historyData ? JSON.parse(historyData) : [];
    } catch (error) {
      console.error('Error getting consent history:', error);
      return [];
    }
  }

  /**
   * Update specific consent
   */
  async updateConsent(
    type: ConsentType,
    accepted: boolean
  ): Promise<void> {
    try {
      const consent = await this.getConsent();
      if (!consent) {
        throw new Error('No consent record found');
      }

      // Update the specific consent
      switch (type) {
        case 'privacy_policy':
          consent.privacyPolicyAccepted = accepted;
          break;
        case 'terms_of_service':
          consent.termsOfServiceAccepted = accepted;
          break;
        case 'marketing':
          consent.marketingConsent = accepted;
          break;
        case 'analytics':
          consent.analyticsConsent = accepted;
          break;
        case 'location_tracking':
          consent.locationTrackingConsent = accepted;
          break;
        case 'data_retention':
          consent.dataRetentionConsent = accepted;
          break;
      }

      await this.saveConsent(consent);
      await this.recordConsent(type, accepted);
    } catch (error) {
      console.error('Error updating consent:', error);
      throw error;
    }
  }

  /**
   * Create initial consent record
   */
  async createInitialConsent(
    privacyAccepted: boolean,
    termsAccepted: boolean,
    marketingAccepted: boolean = false,
    analyticsAccepted: boolean = false
  ): Promise<GDPRConsent> {
    const consent: GDPRConsent = {
      privacyPolicyAccepted: privacyAccepted,
      termsOfServiceAccepted: termsAccepted,
      dataRetentionConsent: true, // Required for app to function
      marketingConsent: marketingAccepted,
      analyticsConsent: analyticsAccepted,
      locationTrackingConsent: false, // User can enable later
      consentDate: new Date(),
      privacyPolicyVersion: this.PRIVACY_POLICY_VERSION,
      termsOfServiceVersion: this.TERMS_OF_SERVICE_VERSION,
      consentHistory: [],
    };

    await this.saveConsent(consent);
    
    // Record each consent
    if (privacyAccepted) {
      await this.recordConsent('privacy_policy', true, this.PRIVACY_POLICY_VERSION);
    }
    if (termsAccepted) {
      await this.recordConsent('terms_of_service', true, this.TERMS_OF_SERVICE_VERSION);
    }
    if (marketingAccepted) {
      await this.recordConsent('marketing', true);
    }
    if (analyticsAccepted) {
      await this.recordConsent('analytics', true);
    }

    return consent;
  }

  /**
   * GDPR Right to Access - Export user data
   * (Article 15)
   */
  async exportUserData(): Promise<any> {
    try {
      // TODO: Implement complete data export
      // This should collect all user data from all sources
      const consent = await this.getConsent();
      const history = await this.getConsentHistory();
      
      return {
        consent,
        consentHistory: history,
        exportDate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error exporting user data:', error);
      throw error;
    }
  }

  /**
   * GDPR Right to Erasure - Delete user data
   * (Article 17)
   */
  async requestDataDeletion(): Promise<boolean> {
    try {
      // TODO: Implement backend API call for data deletion
      // This should mark the account for deletion
      await AsyncStorage.removeItem(this.CONSENT_KEY);
      await AsyncStorage.removeItem(this.CONSENT_HISTORY_KEY);
      return true;
    } catch (error) {
      console.error('Error requesting data deletion:', error);
      return false;
    }
  }

  /**
   * Clear all privacy data
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.CONSENT_KEY);
      await AsyncStorage.removeItem(this.CONSENT_HISTORY_KEY);
    } catch (error) {
      console.error('Error clearing privacy data:', error);
      throw error;
    }
  }
}

export default new PrivacyService();

