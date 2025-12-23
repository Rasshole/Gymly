/**
 * Privacy Policy Screen
 * Displays the privacy policy for Gymly
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';

const PrivacyPolicyScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privatlivspolitik</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.documentIcon}>🔐</Text>
          <Text style={styles.mainTitle}>Privatlivspolitik for Gymly</Text>
          <Text style={styles.lastUpdated}>Sidst opdateret: 20. dec. 2025</Text>

          <View style={styles.section}>
            <Text style={styles.sectionText}>
              Gymly respekterer dit privatliv. Denne privatlivspolitik forklarer, hvordan vi indsamler, bruger og beskytter dine personoplysninger i overensstemmelse med GDPR og App Store-krav.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Hvilke oplysninger indsamler vi?</Text>
            <Text style={styles.sectionText}>
              Vi kan indsamle følgende oplysninger:
            </Text>
            <Text style={styles.subsectionTitle}>Oplysninger du selv giver:</Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Navn eller brugernavn</Text>
              <Text style={styles.bulletPoint}>• E-mailadresse</Text>
              <Text style={styles.bulletPoint}>• Profiloplysninger</Text>
              <Text style={styles.bulletPoint}>• Træningsdata og check-ins</Text>
            </View>
            <Text style={styles.subsectionTitle}>Automatisk indsamlede oplysninger:</Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Enhedsoplysninger</Text>
              <Text style={styles.bulletPoint}>• App-brug og interaktion</Text>
              <Text style={styles.bulletPoint}>• Omtrentlig lokation (kun til check-in-funktion)</Text>
            </View>
            <Text style={styles.sectionText}>
              Vi indsamler ikke præcis GPS-sporing i baggrunden, medmindre det tydeligt er aktiveret af brugeren.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Hvordan bruger vi dine data?</Text>
            <Text style={styles.sectionText}>
              Vi bruger dine data til at:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Drive og forbedre Appen</Text>
              <Text style={styles.bulletPoint}>• Muliggøre sociale funktioner</Text>
              <Text style={styles.bulletPoint}>• Vise check-ins og aktivitet</Text>
              <Text style={styles.bulletPoint}>• Sikre appens stabilitet og sikkerhed</Text>
              <Text style={styles.bulletPoint}>• Overholde juridiske krav</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Deling af data</Text>
            <Text style={styles.sectionText}>
              Vi deler ikke dine personoplysninger med tredjeparter til markedsføring.
            </Text>
            <Text style={styles.sectionText}>
              Data kan deles med:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Tekniske serviceudbydere (hosting, analytics)</Text>
              <Text style={styles.bulletPoint}>• Myndigheder, hvis loven kræver det</Text>
            </View>
            <Text style={styles.sectionText}>
              Alle partnere er GDPR-compliant.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Opbevaring af data</Text>
            <Text style={styles.sectionText}>
              Vi opbevarer kun dine data, så længe:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Din konto er aktiv</Text>
              <Text style={styles.bulletPoint}>• Det er nødvendigt af juridiske eller tekniske årsager</Text>
            </View>
            <Text style={styles.sectionText}>
              Du kan til enhver tid anmode om sletning.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Dine rettigheder</Text>
            <Text style={styles.sectionText}>
              Du har ret til:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Indsigt i dine data</Text>
              <Text style={styles.bulletPoint}>• Rettelse af forkerte oplysninger</Text>
              <Text style={styles.bulletPoint}>• Sletning af dine data</Text>
              <Text style={styles.bulletPoint}>• Dataportabilitet</Text>
              <Text style={styles.bulletPoint}>• At trække samtykke tilbage</Text>
            </View>
            <Text style={styles.sectionText}>
              Kontakt os for at udøve dine rettigheder.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Datasikkerhed</Text>
            <Text style={styles.sectionText}>
              Vi anvender tekniske og organisatoriske sikkerhedsforanstaltninger for at beskytte dine data mod misbrug, tab og uautoriseret adgang.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Børn</Text>
            <Text style={styles.sectionText}>
              Gymly er ikke rettet mod børn under 13 år.
            </Text>
            <Text style={styles.sectionText}>
              Vi indsamler ikke bevidst data fra børn under denne alder.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Ændringer i privatlivspolitikken</Text>
            <Text style={styles.sectionText}>
              Vi kan opdatere denne privatlivspolitik.
            </Text>
            <Text style={styles.sectionText}>
              Væsentlige ændringer vil blive kommunikeret i Appen.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Kontakt</Text>
            <Text style={styles.sectionText}>
              📧 gymly@support.com
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    padding: 16,
  },
  documentIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
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
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 4,
  },
});

export default PrivacyPolicyScreen;




