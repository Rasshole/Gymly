/**
 * Home Screen
 * Main feed and workout check-ins
 */

import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import NotificationService from '@/services/notifications/NotificationService';
import PRRepsScreen from './PRRepsScreen';

type HomeScreenNavigationProp = StackNavigationProp<any>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const {user} = useAppStore();
  const [activeTab, setActiveTab] = useState<'feed' | 'pr'>('feed');

  const renderFeedContent = () => (
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

        {/* Test Notification Button (for development) */}
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => {
            // Simulate a friend check-in for testing
            NotificationService.simulateRandomCheckIn();
          }}
          activeOpacity={0.8}>
          <Icon name="notifications" size={20} color="#007AFF" />
          <Text style={styles.testButtonText}>Test notifikation</Text>
        </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'feed' && styles.tabActive]}
          onPress={() => setActiveTab('feed')}
          activeOpacity={0.7}>
          <Icon
            name="home"
            size={20}
            color={activeTab === 'feed' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'feed' && styles.tabTextActive,
            ]}>
            Feed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pr' && styles.tabActive]}
          onPress={() => setActiveTab('pr')}
          activeOpacity={0.7}>
          <Icon
            name="trophy"
            size={20}
            color={activeTab === 'pr' ? '#007AFF' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'pr' && styles.tabTextActive,
            ]}>
            PR & Reps
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'feed' ? renderFeedContent() : <PRRepsScreen />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabActive: {
    backgroundColor: '#E3F2FD',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginLeft: 8,
  },
  tabTextActive: {
    color: '#007AFF',
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
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  testButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default HomeScreen;

