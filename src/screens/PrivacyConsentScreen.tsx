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

const PrivacyConsentScreen = () => {
  const {saveConsent} = usePrivacyStore();
  
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = async () => {
    if (!privacyAccepted || !termsAccepted) {
      Alert.alert(
        'Påkrævet',
        'Du skal acceptere privatlivspolitikken og servicevilkårene for at fortsætte.'
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
      Alert.alert('Fejl', 'Kunne ikke gemme samtykke. Prøv igen.');
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
          <Text style={styles.title}>Velkommen til Gymly</Text>
          <Text style={styles.subtitle}>
            Vi respekterer dit privatliv og overholder GDPR
          </Text>
        </View>

        {/* Required Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Påkrævet (nødvendigt for app)</Text>
          
          <TouchableOpacity
            style={styles.consentItem}
            onPress={() => setPrivacyAccepted(!privacyAccepted)}
            activeOpacity={0.7}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>Privatlivspolitik</Text>
              <Text style={styles.consentDescription}>
                Vi gemmer kun nødvendige data og beskytter dine oplysninger
              </Text>
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
              <Text style={styles.consentTitle}>Servicevilkår</Text>
              <Text style={styles.consentDescription}>
                Vilkår for brug af Gymly
              </Text>
            </View>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </View>

        {/* Optional Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Valgfrit</Text>
          
          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <Text style={styles.consentTitle}>Marketing kommunikation</Text>
              <Text style={styles.consentDescription}>
                Modtag nyheder og tilbud (kan ændres senere)
              </Text>
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
              <Text style={styles.consentTitle}>Anonymiseret analyse</Text>
              <Text style={styles.consentDescription}>
                Hjælp os med at forbedre appen (kan ændres senere)
              </Text>
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
          <Text style={styles.infoTitle}>Dine rettigheder under GDPR:</Text>
          <Text style={styles.infoText}>• Ret til indsigt i dine data</Text>
          <Text style={styles.infoText}>• Ret til at få dine data slettet</Text>
          <Text style={styles.infoText}>• Ret til dataportabilitet</Text>
          <Text style={styles.infoText}>• Ret til at trække samtykke tilbage</Text>
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
            {isLoading ? 'Gemmer...' : 'Accepter og fortsæt'}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Ved at fortsætte accepterer du at overholde vores retningslinjer
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
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
    color: '#000',
    marginBottom: 4,
  },
  consentDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#007AFF',
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

