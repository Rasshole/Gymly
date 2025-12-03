/**
 * Friend Profile Screen
 * Shows another user's profile
 */

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';

// Mock user data - in real app, this would come from API/store
const getMockUserById = (userId: string) => {
  const mockUsers: Record<string, any> = {
    '1': {
      id: '1',
      displayName: 'Jeff',
      username: 'jeff_fitness',
      profileImageUrl: undefined,
      favoriteGyms: [497381657],
    },
    '2': {
      id: '2',
      displayName: 'Marie',
      username: 'marie_training',
      profileImageUrl: undefined,
      favoriteGyms: [1112453804],
    },
    '3': {
      id: '3',
      displayName: 'Lars',
      username: 'lars_strength',
      profileImageUrl: undefined,
      favoriteGyms: [898936694],
    },
    '4': {
      id: '4',
      displayName: 'Sofia',
      username: 'sofia_fit',
      profileImageUrl: undefined,
      favoriteGyms: [497381657],
    },
    '5': {
      id: '5',
      displayName: 'Jens',
      username: 'jens_workout',
      profileImageUrl: undefined,
      favoriteGyms: [1112453804],
    },
  };
  return mockUsers[userId] || null;
};

const FriendProfileScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {userId} = (route.params as any) || {};
  const {user: currentUser} = useAppStore();

  const friendUser = useMemo(() => {
    if (!userId) return null;
    return getMockUserById(userId);
  }, [userId]);

  if (!friendUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Bruger ikke fundet</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCurrentUser = currentUser?.id === friendUser.id;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {friendUser.profileImageUrl ? (
              <Image
                source={{uri: friendUser.profileImageUrl}}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {friendUser.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{friendUser.displayName}</Text>
          <Text style={styles.username}>@{friendUser.username}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.messageButton}
            onPress={() => {
              navigation.navigate('Chat', {
                friendId: friendUser.id,
                friendName: friendUser.displayName,
              });
            }}
            activeOpacity={0.8}>
            <Icon name="chatbubble-outline" size={20} color="#007AFF" />
            <Text style={styles.messageButtonText}>Beskeder</Text>
          </TouchableOpacity>
        </View>

        {/* Placeholder for stats and content */}
        <View style={styles.statsPlaceholder}>
          <Icon name="fitness-outline" size={48} color="#C7C7CC" />
          <Text style={styles.placeholderText}>
            Profilindhold kommer snart
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#8E8E93',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  messageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  statsPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  placeholderText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
});

export default FriendProfileScreen;


