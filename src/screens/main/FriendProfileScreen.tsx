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
import {colors} from '@/theme/colors';

const FriendProfileTabs = ({friendUser}: {friendUser: any}) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'prs'>('feed');
  return (
    <View style={styles.tabsSection}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'feed' && styles.tabActive]}
          onPress={() => setActiveTab('feed')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>
            Opslag
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'prs' && styles.tabActive]}
          onPress={() => setActiveTab('prs')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'prs' && styles.tabTextActive]}>
            PR's
          </Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'feed' && (
        <View style={styles.emptyFeed}>
          <Icon name="images-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyFeedText}>Ingen indlæg endnu</Text>
          <Text style={styles.emptyFeedSubtext}>
            {friendUser.displayName} har ikke delt noget endnu
          </Text>
        </View>
      )}
      {activeTab === 'prs' && (
        <View style={styles.emptyFeed}>
          <Icon name="trophy-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyFeedText}>Ingen PR's endnu</Text>
          <Text style={styles.emptyFeedSubtext}>
            {friendUser.displayName} har ikke registreret nogen personlige rekorder
          </Text>
        </View>
      )}
    </View>
  );
};

const FriendProfileScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {userId} = (route.params as any) || {};
  const {user: currentUser} = useAppStore();

  const friendUser = useMemo(() => {
    if (!userId) return null;
    return null; // Brugerdata hentes fra API/store
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

        {/* Følgere/Følger/Venner Stats */}
        <View style={styles.profileStatsRow}>
          <TouchableOpacity style={styles.profileStatItem}>
            <Text style={styles.profileStatNumber}>0</Text>
            <Text style={styles.profileStatLabel}>Følgere</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileStatItem}>
            <Text style={styles.profileStatNumber}>0</Text>
            <Text style={styles.profileStatLabel}>Følger</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileStatItem}>
            <Text style={styles.profileStatNumber}>0</Text>
            <Text style={styles.profileStatLabel}>Venner</Text>
          </TouchableOpacity>
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
            <Icon name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.messageButtonText}>Beskeder</Text>
          </TouchableOpacity>
        </View>

        {/* Feed/PRs Tabs */}
        <FriendProfileTabs friendUser={friendUser} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
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
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
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
    color: colors.text,
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  messageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  profileStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  profileStatItem: {
    alignItems: 'center',
  },
  profileStatNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  profileStatLabel: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  tabsSection: {
    marginTop: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyFeed: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyFeedText: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 16,
  },
  emptyFeedSubtext: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 8,
  },
});

export default FriendProfileScreen;
