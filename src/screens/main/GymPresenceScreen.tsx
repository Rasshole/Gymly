/**
 * GymPresenceScreen – who is training at gyms right now
 * Shows active gyms list or user list for a specific gym
 */

import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {ActiveUserRow} from '@/components/ui/ActiveUserRow';
import {GymPresenceCard} from '@/components/ui/GymPresenceCard';
import {EmptyState} from '@/components/ui/EmptyState';
import {useGymPresence} from '@/hooks/useGymPresence';
import type {GymPresence} from '@/types/gymPresence.types';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

const GymPresenceScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const gym = route.params?.gym as GymPresence | undefined;
  const {gyms: activeGyms} = useGymPresence();

  // Show gym detail (user list) when a specific gym was passed
  if (gym) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Aktive gyms" onBack={() => navigation.goBack()} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.gymHeader}>
            <Text style={styles.gymName}>{gym.gymName}</Text>
            <Text style={styles.userCount}>{gym.activeUsers} aktive</Text>
          </View>
          {gym.userList.map(user => (
            <ActiveUserRow
              key={user.id}
              user={user}
              onSeeProfile={() =>
                navigation.navigate('FriendProfile', {
                  friendId: user.id,
                  friendName: user.name,
                  mutualFriends: 0,
                  gyms: [],
                })
              }
              onSendMessage={() => navigation.navigate('NewMessage')}
              onInviteToGroup={() =>
                navigation.navigate('Friends', {screen: 'Grupper'} as never)
              }
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // Show all active gyms list
  return (
    <View style={styles.container}>
      <ScreenHeader title="Aktive gyms" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeGyms.length > 0 ? (
          activeGyms.map(g => (
            <GymPresenceCard
              key={g.gymId}
              gym={g}
              onPress={() => navigation.navigate('GymPresence', {gym: g})}
            />
          ))
        ) : (
          <EmptyState
            icon="people-outline"
            title="Ingen Gymly users træner lige nu"
            message="Vær den første til at checke ind og inspirer andre"
            actionLabel="Vær den første til at checke ind"
            onAction={() => navigation.navigate('CheckIn')}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  gymHeader: {
    marginBottom: spacing.lg,
  },
  gymName: {
    ...typography.h3,
    color: colors.text,
  },
  userCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});

export default GymPresenceScreen;
