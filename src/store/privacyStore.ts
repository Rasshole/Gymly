/**
 * Privacy State Store
 * Manages GDPR consent and privacy settings
 */

import {create} from 'zustand';
import {GDPRConsent} from '@/types/user.types';
import PrivacyService from '@/services/privacy/PrivacyService';

interface PrivacyState {
  consent: GDPRConsent | null;
  hasAcceptedConsent: boolean;
  
  // Actions
  loadConsent: () => Promise<void>;
  saveConsent: (consent: GDPRConsent) => Promise<void>;
  updateMarketingConsent: (accepted: boolean) => Promise<void>;
  updateAnalyticsConsent: (accepted: boolean) => Promise<void>;
  clearConsent: () => Promise<void>;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  consent: null,
  hasAcceptedConsent: false,

  /**
   * Load consent from storage
   */
  loadConsent: async () => {
    try {
      const consent = await PrivacyService.getConsent();
      const hasRequired = await PrivacyService.hasRequiredConsents();
      
      set({
        consent,
        hasAcceptedConsent: hasRequired,
      });
    } catch (error) {
      console.error('Error loading consent:', error);
    }
  },

  /**
   * Save consent
   */
  saveConsent: async (consent: GDPRConsent) => {
    try {
      await PrivacyService.saveConsent(consent);
      set({
        consent,
        hasAcceptedConsent: true,
      });
    } catch (error) {
      console.error('Error saving consent:', error);
      throw error;
    }
  },

  /**
   * Update marketing consent
   */
  updateMarketingConsent: async (accepted: boolean) => {
    try {
      await PrivacyService.updateConsent('marketing', accepted);
      const consent = await PrivacyService.getConsent();
      set({consent});
    } catch (error) {
      console.error('Error updating marketing consent:', error);
      throw error;
    }
  },

  /**
   * Update analytics consent
   */
  updateAnalyticsConsent: async (accepted: boolean) => {
    try {
      await PrivacyService.updateConsent('analytics', accepted);
      const consent = await PrivacyService.getConsent();
      set({consent});
    } catch (error) {
      console.error('Error updating analytics consent:', error);
      throw error;
    }
  },

  /**
   * Clear all consent data
   */
  clearConsent: async () => {
    try {
      await PrivacyService.clearAll();
      set({
        consent: null,
        hasAcceptedConsent: false,
      });
    } catch (error) {
      console.error('Error clearing consent:', error);
      throw error;
    }
  },
}));

