/**
 * Terms and Conditions Screen
 * Displays the terms and conditions for Gymly
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

const TermsScreen = () => {
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
        <Text style={styles.headerTitle}>Vilkår og betingelser</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.documentIcon}>📄</Text>
          <Text style={styles.mainTitle}>Vilkår og betingelser for Gymly</Text>
          <Text style={styles.lastUpdated}>Sidst opdateret: 20. Dec. 2025</Text>

          <View style={styles.section}>
            <Text style={styles.sectionText}>
              Disse vilkår og betingelser ("Vilkår") regulerer din brug af Gymly-appen ("Appen"), som leveres af Gymly ("vi", "os", "vores").
            </Text>
            <Text style={styles.sectionText}>
              Ved at downloade, oprette en konto eller bruge Appen accepterer du disse Vilkår. Hvis du ikke accepterer Vilkårene, må du ikke bruge Appen.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Appens formål</Text>
            <Text style={styles.sectionText}>
              Gymly er en social fitness-app, der giver brugere mulighed for at:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Checke ind i fitnesscentre</Text>
              <Text style={styles.bulletPoint}>• Se og interagere med andre brugere</Text>
              <Text style={styles.bulletPoint}>• Registrere træningsaktivitet og progression</Text>
              <Text style={styles.bulletPoint}>• Deltage i et fitness-fællesskab</Text>
            </View>
            <Text style={styles.sectionText}>
              Gymly leverer ikke medicinsk rådgivning, personlig træningsvejledning eller sundhedsbehandling.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Berettigelse og alder</Text>
            <Text style={styles.sectionText}>
              For at bruge Appen skal du:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Være mindst 13 år</Text>
              <Text style={styles.bulletPoint}>• Give korrekte og sandfærdige oplysninger ved oprettelse</Text>
            </View>
            <Text style={styles.sectionText}>
              Hvis du er under 18 år, bekræfter du, at du har forældres eller værges samtykke.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Brugerkonto og ansvar</Text>
            <Text style={styles.sectionText}>
              Du er ansvarlig for:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Aktivitet, der sker via din konto</Text>
              <Text style={styles.bulletPoint}>• At holde dine loginoplysninger fortrolige</Text>
              <Text style={styles.bulletPoint}>• Alt indhold, du deler i Appen</Text>
            </View>
            <Text style={styles.sectionText}>
              Du må ikke dele din konto med andre.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Acceptabel brug</Text>
            <Text style={styles.sectionText}>
              Du må ikke:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Overtræde gældende lovgivning</Text>
              <Text style={styles.bulletPoint}>• Chikanere, true eller krænke andre brugere</Text>
              <Text style={styles.bulletPoint}>• Dele stødende, hadefuldt, voldeligt eller ulovligt indhold</Text>
              <Text style={styles.bulletPoint}>• Manipulere check-ins, lokationsdata eller anden funktionalitet</Text>
              <Text style={styles.bulletPoint}>• Forsøge at omgå sikkerhed eller tekniske begrænsninger</Text>
            </View>
            <Text style={styles.sectionText}>
              Vi forbeholder os retten til at suspendere eller slette konti ved brud på Vilkårene.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Brugerindhold</Text>
            <Text style={styles.sectionText}>
              Når du deler indhold i Appen (fx check-ins, tekst, billeder eller træningsdata):
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Bevarer du ejerskabet af dit indhold</Text>
              <Text style={styles.bulletPoint}>• Giver du Gymly en ikke-eksklusiv, verdensomspændende, royalty-fri licens til at vise og anvende indholdet i Appen</Text>
            </View>
            <Text style={styles.sectionText}>
              Vi forbeholder os retten til at fjerne indhold, der overtræder Vilkårene.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Sundhed, sikkerhed og ansvar</Text>
            <Text style={styles.sectionText}>
              Al brug af Appen og al træning sker på eget ansvar.
            </Text>
            <Text style={styles.sectionText}>
              Gymly er ikke ansvarlig for:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Skader, ulykker eller helbredsproblemer</Text>
              <Text style={styles.bulletPoint}>• Forkerte træningsvalg</Text>
              <Text style={styles.bulletPoint}>• Brugeres handlinger i eller uden for Appen</Text>
            </View>
            <Text style={styles.sectionText}>
              Kontakt en sundhedsprofessionel, hvis du er i tvivl om din fysiske formåen.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Betalinger og abonnementer (hvis relevant)</Text>
            <Text style={styles.sectionText}>
              Hvis Appen tilbyder betalte funktioner:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletPoint}>• Betaling sker via App Store</Text>
              <Text style={styles.bulletPoint}>• Abonnementer fornyes automatisk, medmindre de opsiges</Text>
              <Text style={styles.bulletPoint}>• Opsigelse og administration sker via din Apple-konto</Text>
            </View>
            <Text style={styles.sectionText}>
              Gymly håndterer ikke betalingsoplysninger direkte.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Tredjepartsplatforme</Text>
            <Text style={styles.sectionText}>
              Appen kan integrere eller linke til tredjepartstjenester (fx fitnesscentre eller sociale funktioner). Gymly er ikke ansvarlig for tredjepartsindhold eller -tjenester.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Immaterielle rettigheder</Text>
            <Text style={styles.sectionText}>
              Alle rettigheder til Appen, herunder design, logoer, kode og funktioner, tilhører Gymly eller vores licensgivere.
            </Text>
            <Text style={styles.sectionText}>
              Du må ikke kopiere, ændre eller distribuere Appen uden tilladelse.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Opsigelse</Text>
            <Text style={styles.sectionText}>
              Du kan til enhver tid slette din konto. Vi kan suspendere eller lukke konti ved overtrædelse af Vilkårene.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Ansvarsfraskrivelse</Text>
            <Text style={styles.sectionText}>
              Appen leveres "som den er" og "som tilgængelig". Vi garanterer ikke fejlfri drift eller konstant tilgængelighed.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Lovvalg</Text>
            <Text style={styles.sectionText}>
              Disse Vilkår er underlagt dansk ret, og tvister afgøres ved danske domstole.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>13. Kontakt</Text>
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

export default TermsScreen;




