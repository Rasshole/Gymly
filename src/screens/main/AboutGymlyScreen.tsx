/**
 * About Gymly Screen
 * Information about Gymly app, its purpose and features
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {TouchableOpacity} from 'react-native';

const AboutGymlyScreen = () => {
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
        <Text style={styles.headerTitle}>Om Gymly</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Icon name="fitness" size={64} color="#007AFF" />
        </View>

        <Text style={styles.title}>Velkommen til Gymly</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hvem er vi?</Text>
          <Text style={styles.text}>
            Gymly er en social fitness app designet til at forbinde træningsentusiaster
            og hjælpe dig med at nå dine fitness mål. Vi tror på, at træning er bedre,
            når man gør det sammen med andre.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hvad kan appen?</Text>
          <Text style={styles.text}>
            Med Gymly kan du:
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Tjekke ind på dit favorit gym og se hvem der træner der
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Tilføje venner og se deres træningsaktiviteter
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Registrere dine personlige rekorder (PR's) og reps
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Oprette og deltage i træningsgrupper
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Sætte mål og tracke din fremgang
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.featureText}>
                Se kort over gyms og aktive brugere
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Formålet med Gymly</Text>
          <Text style={styles.text}>
            Vores mission er at skabe et fællesskab, hvor træningsentusiaster kan
            motivere hinanden, dele erfaringer og vokse sammen. Vi vil gøre det
            nemmere at finde træningspartnere, holde dig motiveret og hjælpe dig med
            at nå dine fitness mål gennem social interaktion og fællesskab.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontakt</Text>
          <Text style={styles.text}>
            Har du spørgsmål eller feedback? Brug vores support funktion i appen,
            eller besøg vores Community Hub for at deltage i diskussioner med andre
            brugere.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    color: '#000',
  },
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  featureList: {
    marginTop: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginLeft: 12,
  },
});

export default AboutGymlyScreen;


