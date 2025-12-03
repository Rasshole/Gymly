/**
 * Friend Profile Screen
 * Shows a friend's profile with mutual friends and gyms
 */

import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';

type FriendProfileRouteParams = {
  friendId: string;
  friendName: string;
  mutualFriends: number;
  gyms: string[];
};

type FriendProfileRouteProp = RouteProp<{FriendProfile: FriendProfileRouteParams}, 'FriendProfile'>;
type FriendProfileNavigationProp = StackNavigationProp<any>;

const FriendProfileScreen = () => {
  const navigation = useNavigation<FriendProfileNavigationProp>();
  const route = useRoute<FriendProfileRouteProp>();
  const {friendId, friendName, mutualFriends, gyms} = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{friendName.charAt(0)}</Text>
          </View>
          <Text style={styles.name}>{friendName}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="people-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Fælles venner</Text>
          </View>
          <Text style={styles.sectionContent}>
            Du har {mutualFriends} {mutualFriends === 1 ? 'fælles ven' : 'fælles venner'} med {friendName}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="fitness-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Træner i</Text>
          </View>
          {gyms.length > 0 ? (
            <View style={styles.gymsList}>
              {gyms.map((gym, index) => (
                <View key={index} style={styles.gymItem}>
                  <Icon name="location-outline" size={16} color="#64748B" />
                  <Text style={styles.gymText}>{gym}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.sectionContent}>Ingen centre registreret</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 42,
    fontWeight: '700',
    color: '#4338CA',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  sectionContent: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  gymsList: {
    gap: 12,
  },
  gymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gymText: {
    fontSize: 14,
    color: '#0F172A',
  },
});

export default FriendProfileScreen;

