/**
 * Privacy Consent Screen
 * GDPR-compliant consent collection
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import {usePrivacyStore} from '@/store/privacyStore';
import PrivacyService from '@/services/privacy/PrivacyService';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';

const PrivacyConsentScreen = () => {
  const {t} = useTranslation();
  const {saveConsent} = usePrivacyStore();
  
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = async () => {
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert(
        t('privacyConsent.requiredAlertTitle'),
        t('privacyConsent.requiredAlertBody'),
      );
      return;
    }

    setIsLoading(true);
    try {
      const consent = await PrivacyService.createInitialConsent(
        privacyAccepted,
        termsAccepted,
        marketingConsent,
        analyticsConsent
      );
      
      await saveConsent(consent);
    } catch (error) {
      Alert.alert(t('common.error'), t('privacyConsent.saveFailed'));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>🔒</Text>
          <Text style={styles.title}>{t('privacyConsent.welcomeTitle')}</Text>
          <Text style={styles.subtitle}>{t('privacyConsent.welcomeSubtitle')}</Text>
        </View>

        {/* Required Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacyConsent.requiredSection')}</Text>
          
          <TouchableOpacity
            style={styles.consentItem}
            onPress={() => setPrivacyAccepted(!privacyAccepted)}
            activeOpacity={0.7}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>{t('privacyConsent.privacyTitle')}</Text>
              <Text style={styles.consentDescription}>{t('privacyConsent.privacyDesc')}</Text>
            </View>
            <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
              {privacyAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.consentItem}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>{t('privacyConsent.termsTitle')}</Text>
              <Text style={styles.consentDescription}>{t('privacyConsent.termsDesc')}</Text>
            </View>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </View>

        {/* Optional Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacyConsent.optionalSection')}</Text>
          
          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>{t('privacyConsent.marketingTitle')}</Text>
              <Text style={styles.consentDescription}>{t('privacyConsent.marketingDesc')}</Text>
            </View>
            <Switch
              value={marketingConsent}
              onValueChange={setMarketingConsent}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>{t('privacyConsent.analyticsTitle')}</Text>
              <Text style={styles.consentDescription}>{t('privacyConsent.analyticsDesc')}</Text>
            </View>
            <Switch
              value={analyticsConsent}
              onValueChange={setAnalyticsConsent}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* GDPR Rights Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{t('privacyConsent.gdprTitle')}</Text>
          <Text style={styles.infoText}>{t('privacyConsent.gdprInsight')}</Text>
          <Text style={styles.infoText}>{t('privacyConsent.gdprDelete')}</Text>
          <Text style={styles.infoText}>{t('privacyConsent.gdprPortability')}</Text>
          <Text style={styles.infoText}>{t('privacyConsent.gdprWithdraw')}</Text>
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={[
            styles.acceptButton,
            (!privacyAccepted || !termsAccepted || isLoading) && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={!privacyAccepted || !termsAccepted || isLoading}
          activeOpacity={0.8}>
          <Text style={styles.acceptButtonText}>
            {isLoading ? t('privacyConsent.saving') : t('privacyConsent.acceptAndContinue')}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('privacyConsent.footer')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 40,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  consentInfo: {
    flex: 1,
    marginRight: 12,
  },
  consentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  consentDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.secondary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
    marginBottom: 4,
  },
  acceptButton: {
    backgroundColor: colors.secondary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  acceptButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});

export default PrivacyConsentScreen;

