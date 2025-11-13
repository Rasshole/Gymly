/**
 * Home Screen
 * Main feed and workout check-ins
 */

import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useAppStore} from '@/store/appStore';
import Icon from 'react-native-vector-icons/Ionicons';

const HomeScreen = () => {
  const {user} = useAppStore();

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Hej, {user?.displayName}! 👋</Text>
          <Text style={styles.subtitle}>Klar til at træne i dag?</Text>
        </View>

        {/* Check-in Button (Coming Soon) */}
        <TouchableOpacity style={styles.checkInButton} activeOpacity={0.8}>
          <View style={styles.checkInIcon}>
            <Icon name="location" size={32} color="#007AFF" />
          </View>
          <View style={styles.checkInInfo}>
            <Text style={styles.checkInTitle}>Tjek ind på gym</Text>
            <Text style={styles.checkInSubtitle}>Lad dine venner vide hvor du træner</Text>
          </View>
          <Icon name="chevron-forward" size={24} color="#C7C7CC" />
        </TouchableOpacity>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🚀</Text>
          <Text style={styles.infoTitle}>Velkommen til Gymly!</Text>
          <Text style={styles.infoText}>
            Vi er i gang med at bygge de bedste funktioner til dig.
            {'\n\n'}
            Snart kan du:
          </Text>
          <View style={styles.featureList}>
            <Text style={styles.featureItem}>✓ Tjekke ind på gym</Text>
            <Text style={styles.featureItem}>✓ Se hvor dine venner træner</Text>
            <Text style={styles.featureItem}>✓ Dele dine workouts</Text>
            <Text style={styles.featureItem}>✓ Chatte med træningspartnere</Text>
          </View>
        </View>

        {/* Privacy Notice */}
        <View style={styles.privacyNotice}>
          <Icon name="shield-checkmark" size={20} color="#34C759" />
          <Text style={styles.privacyText}>
            Dine data er sikre og GDPR-compliant
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  welcomeSection: {
    marginBottom: 24,
    paddingTop: 8,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  checkInButton: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  checkInIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  checkInInfo: {
    flex: 1,
  },
  checkInTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  checkInSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  featureList: {
    alignSelf: 'stretch',
  },
  featureItem: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
    paddingLeft: 8,
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  privacyText: {
    fontSize: 14,
    color: '#34C759',
    marginLeft: 8,
    fontWeight: '500',
  },
});

export default HomeScreen;

