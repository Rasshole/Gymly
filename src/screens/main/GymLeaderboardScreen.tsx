/**
 * Gym Leaderboard Screen
 * Shows leaderboard for a specific gym - who has the most check-ins
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {DanishGym} from '@/data/danishGyms';
import {useLeaderboardStore} from '@/store/leaderboardStore';
import {useAppStore} from '@/store/appStore';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {colors} from '@/theme/colors';
import {LeaderboardEntry, LeaderboardPeriod} from '@/types/leaderboard.types';

const PERIODS: LeaderboardPeriod[] = ['week', 'month', 'all'];

const getRankStyle = (rank: number) => {
  if (rank === 1) return {backgroundColor: '#FFD700'}; // Gold
  if (rank === 2) return {backgroundColor: '#C0C0C0'}; // Silver
  if (rank === 3) return {backgroundColor: '#CD7F32'}; // Bronze
  return {backgroundColor: colors.surface};
};

const LeaderboardItem = ({
  item,
  gym,
}: {
  item: LeaderboardEntry;
  gym: DanishGym;
}) => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const rankStyle = getRankStyle(item.rank);

  const handlePress = () => {
    if (item.userId !== 'current_user') {
      navigation.navigate('FriendProfile', {
        friendId: item.userId,
        friendName: item.displayName,
        mutualFriends: 0,
        gyms: [gym.name],
      });
    }
  };

  return (
    <TouchableOpacity
      style={[styles.item, item.isCurrentUser && styles.itemHighlight]}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={item.isCurrentUser}>
      <View style={[styles.rankBadge, rankStyle]}>
        <Text
          style={[
            styles.rankText,
            item.rank <= 3 && styles.rankTextMedal,
          ]}>
          {item.rank}
        </Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.displayName.charAt(0)}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {item.isCurrentUser ? 'Dig' : item.displayName}
          </Text>
          {item.isWeeklyChampion && (
            <View style={styles.championBadge}>
              <Text style={styles.championBadgeText}>🏆 Ugens mester</Text>
            </View>
          )}
          {item.isFriend && !item.isCurrentUser && (
            <View style={styles.friendBadge}>
              <Icon name="person" size={10} color="#fff" />
              <Text style={styles.friendBadgeText}>Ven</Text>
            </View>
          )}
        </View>
        <Text style={styles.value}>{item.valueLabel}</Text>
      </View>
      {item.rank <= 3 && (
        <Icon
          name="trophy"
          size={20}
          color={item.rank === 1 ? '#FFD700' : item.rank === 2 ? '#C0C0C0' : '#CD7F32'}
        />
      )}
    </TouchableOpacity>
  );
};

const GymLeaderboardScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {gymId, gym} = (route.params as any) || {};
  const {user} = useAppStore();
  const {getGymLeaderboard, getPeriodLabel, getWeeklyChampion} = useLeaderboardStore();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');

  if (!gym) {
    return (
      <View style={styles.container}>
        <Text>Gym ikke fundet</Text>
      </View>
    );
  }

  const leaderboard = getGymLeaderboard(
    gymId,
    gym.name,
    period,
    user?.id || 'current_user'
  );
  const weeklyChampion = getWeeklyChampion(gymId);

  const logoUrl = getGymLogo(gym.brand);
  const hasLogo = hasGymLogo(gym.brand);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rangliste</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.gymHeader}>
        {hasLogo && logoUrl ? (
          <Image
            source={{uri: logoUrl}}
            style={styles.gymLogo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.gymIcon}>
            <Icon name="fitness" size={32} color={colors.primary} />
          </View>
        )}
        <Text style={styles.gymName}>{gym.name}</Text>
        <Text style={styles.gymSubtitle}>Flest besøg</Text>
        {weeklyChampion && (
          <View style={styles.weeklyChampionBanner}>
            <Text style={styles.weeklyChampionEmoji}>🏆</Text>
            <Text style={styles.weeklyChampionText}>
              Ugens mester: {weeklyChampion.displayName}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.periodTabs}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}>
            <Text
              style={[
                styles.periodTabText,
                period === p && styles.periodTabTextActive,
              ]}>
              {getPeriodLabel(p)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={leaderboard}
        keyExtractor={item => `${item.userId}-${item.rank}`}
        renderItem={({item}) => <LeaderboardItem item={item} gym={gym} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
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
    borderBottomColor: '#EFEFF4',
    paddingTop: 50,
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
  gymHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  gymLogo: {
    width: 56,
    height: 56,
    marginBottom: 12,
  },
  gymIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gymName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  gymSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  periodTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  periodTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  periodTabActive: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  itemHighlight: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  rankTextMedal: {
    color: '#fff',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  value: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  weeklyChampionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD70025',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 12,
    gap: 6,
  },
  weeklyChampionEmoji: {
    fontSize: 18,
  },
  weeklyChampionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8860B',
  },
  championBadge: {
    backgroundColor: '#FFD70030',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  championBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B8860B',
  },
});

export default GymLeaderboardScreen;
