/**
 * Leaderboard Store
 * Skalerbar rangliste-system med 10 kategorier
 * Modulært – nem at tilføje nye kategorier
 * Struktureret til senere Firestore-integration
 */

import {create} from 'zustand';
import {
  LeaderboardPeriod,
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardStats,
  WeeklyChampion,
} from '@/types/leaderboard.types';
import danishGyms, {DanishGym, getActiveDanishGyms} from '@/data/danishGyms';

// Venner af den aktuelle bruger – tom indtil rigtige data hentes
const FRIEND_IDS = new Set<string>();

// Ingen mock data – tomme arrays indtil rigtige data hentes fra backend
const getMockLeaderboardStats = (): LeaderboardStats[] => [];
const getMockGymCheckIns = (): Array<{userId: string; gymId: string; count: number}> => [];
const MOCK_LB_GYM_IDS = () => getActiveDanishGyms().slice(0, 12).map(g => g.id);
const getMockWeeklyChampions = (): WeeklyChampion[] => [];

// Formateringsfunktioner
const formatCheckIns = (n: number) => (n === 1 ? '1 check-in' : `${n} check-ins`);
const formatPRs = (n: number) => (n === 1 ? '1 PR' : `${n} PR'er`);
const formatMinutes = (n: number) => `${n} min`;
const formatSocialWorkouts = (n: number) =>
  n === 1 ? '1 træning med venner' : `${n} træninger med venner`;
const formatVisits = (n: number) => (n === 1 ? '1 besøg' : `${n} besøg`);
const formatStreak = (n: number) => (n === 1 ? '1 dags stribe' : `${n} dages stribe`);
const formatMuscleGroups = (n: number) =>
  n === 1 ? '1 muskelgruppe' : `${n} muskelgrupper`;
const formatWeight = (kg: number) => `${kg} kg`;

interface LeaderboardState {
  /** Hent global rangliste for en kategori */
  getGlobalLeaderboard: (
    category: LeaderboardCategory,
    period: LeaderboardPeriod,
    currentUserId: string
  ) => LeaderboardEntry[];
  /** Hent venner-rangliste (kun venner) */
  getFriendsLeaderboard: (
    category: LeaderboardCategory,
    period: LeaderboardPeriod,
    currentUserId: string
  ) => LeaderboardEntry[];
  /** Hent gym-specifik rangliste */
  getGymLeaderboard: (
    gymId: string,
    gymName: string,
    period: LeaderboardPeriod,
    currentUserId: string
  ) => LeaderboardEntry[];
  /** Hent alle gym-ranglister (kort oversigt) */
  getGymLeaderboards: (currentUserId: string) => Array<{gym: DanishGym; topUser: LeaderboardEntry}>;
  /** Hent center-rangliste (check-ins eller tid på center) – evt. for ét valgt center */
  getCenterLeaderboard: (
    subFilter: 'checkIns' | 'time',
    period: LeaderboardPeriod,
    currentUserId: string,
    gymId?: string
  ) => LeaderboardEntry[];
  /** Hent Weekly Champion for et gym */
  getWeeklyChampion: (gymId: string) => WeeklyChampion | undefined;
  /** Hent alle Weekly Champions */
  getWeeklyChampions: () => WeeklyChampion[];
  getPeriodLabel: (period: LeaderboardPeriod) => string;
  getCategoryLabel: (category: LeaderboardCategory) => string;
  getCategoryConfig: (category: LeaderboardCategory) => {label: string; icon: string};
}

const getValueForCategory = (
  stats: LeaderboardStats,
  category: LeaderboardCategory,
  period: LeaderboardPeriod
): number => {
  switch (category) {
    case 'checkIns':
      return period === 'week' ? stats.checkInsWeekly : period === 'month' ? stats.checkInsMonthly : stats.checkInsAllTime;
    case 'prs':
      return period === 'week' ? stats.prsWeekly : period === 'month' ? stats.prsMonthly : stats.prsAllTime;
    case 'trainingTime':
      return period === 'week' ? stats.trainingMinutesWeekly : period === 'month' ? stats.trainingMinutesMonthly : stats.trainingMinutesAllTime;
    case 'socialTraining':
      return period === 'week' ? stats.socialWorkoutsWeekly : period === 'month' ? stats.socialWorkoutsMonthly : stats.socialWorkoutsAllTime;
    case 'streak':
      return stats.currentStreak;
    case 'discipline':
      return stats.muscleGroupsTrained;
    case 'benchPress':
      return stats.benchPR;
    case 'squat':
      return stats.squatPR;
    case 'deadlift':
      return stats.deadliftPR;
    case 'globalActivity':
    case 'friendsActivity': {
      if (period === 'week') {
        return stats.checkInsWeekly * 2 + stats.prsWeekly * 5
          + Math.floor(stats.trainingMinutesWeekly / 30) + stats.socialWorkoutsWeekly * 3;
      }
      if (period === 'month') {
        return stats.checkInsMonthly * 2 + stats.prsMonthly * 5
          + Math.floor(stats.trainingMinutesMonthly / 30) + stats.socialWorkoutsMonthly * 3;
      }
      return stats.activityScore;
    }
    default:
      return 0;
  }
};

const formatValueForCategory = (
  category: LeaderboardCategory,
  value: number
): string => {
  switch (category) {
    case 'checkIns':
      return formatCheckIns(value);
    case 'prs':
      return formatPRs(value);
    case 'trainingTime':
      return formatMinutes(value);
    case 'socialTraining':
      return formatSocialWorkouts(value);
    case 'gym':
      return formatVisits(value);
    case 'streak':
      return formatStreak(value);
    case 'discipline':
      return formatMuscleGroups(value);
    case 'benchPress':
      return `Bænkpres: ${formatWeight(value)}`;
    case 'squat':
      return `Squat: ${formatWeight(value)}`;
    case 'deadlift':
      return `Dødløft: ${formatWeight(value)}`;
    case 'globalActivity':
      return `${value} point`;
    case 'friendsActivity':
      return `${value} point`;
    default:
      return `${value}`;
  }
};

export const useLeaderboardStore = create<LeaderboardState>((set, get) => {
  const allStats = getMockLeaderboardStats();
  const gymCheckIns = getMockGymCheckIns();
  const weeklyChampions = getMockWeeklyChampions();

  return {
    getGlobalLeaderboard: (category, period, currentUserId) => {
      if (category === 'gym') return [];
      const entries = allStats
        .map(stats => {
          const value = getValueForCategory(stats, category, period);
          return {
            userId: stats.userId,
            displayName: 'Ukendt',
            profileImageUrl: undefined,
            value,
            isCurrentUser: stats.userId === currentUserId,
            isFriend: FRIEND_IDS.has(stats.userId),
          };
        })
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value);
      return entries.map((item, idx) => ({
        rank: idx + 1,
        userId: item.userId,
        displayName: item.displayName,
        profileImageUrl: item.profileImageUrl,
        value: item.value,
        valueLabel: formatValueForCategory(category, item.value),
        isCurrentUser: item.isCurrentUser,
        isFriend: item.isFriend,
      }));
    },

    getFriendsLeaderboard: (category, period, currentUserId) => {
      const friendStats = allStats.filter(s => FRIEND_IDS.has(s.userId) || s.userId === currentUserId);
      const entries = friendStats
        .map(stats => {
          const value = getValueForCategory(stats, category, period);
          return {
            userId: stats.userId,
            displayName: 'Dig',
            profileImageUrl: undefined,
            value,
            isCurrentUser: stats.userId === currentUserId,
            isFriend: stats.userId !== currentUserId,
          };
        })
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value);
      return entries.map((item, idx) => ({
        rank: idx + 1,
        userId: item.userId,
        displayName: item.isCurrentUser ? 'Dig' : item.displayName,
        profileImageUrl: item.profileImageUrl,
        value: item.value,
        valueLabel: formatValueForCategory(category, item.value),
        isCurrentUser: item.isCurrentUser,
        isFriend: item.isFriend,
      }));
    },

    getGymLeaderboard: (gymId, gymName, period, currentUserId) => {
      const gymEntries = gymCheckIns.filter(e => e.gymId === gymId);
      const byUser: Record<string, number> = {};
      gymEntries.forEach(({userId, count}) => {
        byUser[userId] = (byUser[userId] || 0) + count;
      });
      const champion = weeklyChampions.find(w => w.gymId === gymId);
      const entries = Object.entries(byUser)
        .map(([userId, count]) => ({
          userId,
          displayName: 'Ukendt',
          profileImageUrl: undefined,
          value: count,
          isCurrentUser: userId === currentUserId,
          isFriend: FRIEND_IDS.has(userId),
          isWeeklyChampion: champion?.userId === userId,
        }))
        .sort((a, b) => b.value - a.value);
      return entries.map((item, idx) => ({
        rank: idx + 1,
        userId: item.userId,
        displayName: item.isCurrentUser ? 'Dig' : item.displayName,
        profileImageUrl: item.profileImageUrl,
        value: item.value,
        valueLabel: formatVisits(item.value),
        isCurrentUser: item.isCurrentUser,
        isFriend: item.isFriend,
        isWeeklyChampion: item.isWeeklyChampion,
      }));
    },

    getCenterLeaderboard: (subFilter, period, currentUserId, gymId) => {
      const gymIds = MOCK_LB_GYM_IDS();
      const targetGymIds = gymId != null ? [gymId] : gymIds;

      if (subFilter === 'checkIns') {
        const byUser: Record<string, number> = {};
        const scale = period === 'week' ? 0.2 : period === 'month' ? 0.5 : 1;
        gymCheckIns
          .filter(e => targetGymIds.includes(e.gymId))
          .forEach(({userId, count}) => {
            byUser[userId] = (byUser[userId] || 0) + Math.round(count * scale);
          });
        const entries = Object.entries(byUser)
          .map(([userId, count]) => ({
            userId,
            displayName: 'Ukendt',
            profileImageUrl: undefined,
            value: count,
            isCurrentUser: userId === currentUserId,
            isFriend: FRIEND_IDS.has(userId),
          }))
          .filter(e => e.value > 0)
          .sort((a, b) => b.value - a.value);
        return entries.map((item, idx) => ({
          rank: idx + 1,
          userId: item.userId,
          displayName: item.isCurrentUser ? 'Dig' : item.displayName,
          profileImageUrl: item.profileImageUrl,
          value: item.value,
          valueLabel: formatCheckIns(item.value),
          isCurrentUser: item.isCurrentUser,
          isFriend: item.isFriend,
        }));
      }
      if (subFilter === 'time') {
        const byUser: Record<string, number> = {};
        const scale = period === 'week' ? 0.2 : period === 'month' ? 0.5 : 1;
        const AVG_MIN_PER_VISIT = 45;
        gymCheckIns
          .filter(e => targetGymIds.includes(e.gymId))
          .forEach(({userId, count}) => {
            const mins = Math.round(count * scale * AVG_MIN_PER_VISIT);
            byUser[userId] = (byUser[userId] || 0) + mins;
          });
        const entries = Object.entries(byUser)
          .map(([userId, mins]) => ({
            userId,
            displayName: 'Ukendt',
            profileImageUrl: undefined,
            value: mins,
            isCurrentUser: userId === currentUserId,
            isFriend: FRIEND_IDS.has(userId),
          }))
          .filter(e => e.value > 0)
          .sort((a, b) => b.value - a.value);
        return entries.map((item, idx) => ({
          rank: idx + 1,
          userId: item.userId,
          displayName: item.isCurrentUser ? 'Dig' : item.displayName,
          profileImageUrl: item.profileImageUrl,
          value: item.value,
          valueLabel: formatMinutes(item.value),
          isCurrentUser: item.isCurrentUser,
          isFriend: item.isFriend,
        }));
      }
      return [];
    },

    getGymLeaderboards: (currentUserId) => {
      const gymIds = MOCK_LB_GYM_IDS();
      const out: Array<{gym: DanishGym; topUser: LeaderboardEntry}> = [];
      for (const gymId of gymIds) {
        const gym = danishGyms.find(g => g.id === gymId);
        if (!gym) {
          continue;
        }
        const leaderboard = get().getGymLeaderboard(
          gymId,
          gym.name,
          'all',
          currentUserId
        );
        const topUser = leaderboard[0];
        if (topUser) {
          out.push({gym, topUser});
        }
      }
      return out;
    },

    getWeeklyChampion: (gymId) =>
      weeklyChampions.find(w => w.gymId === gymId),

    getWeeklyChampions: () => weeklyChampions,

    getPeriodLabel: (period: LeaderboardPeriod) => {
      switch (period) {
        case 'week': return 'Denne uge';
        case 'month': return 'Denne måned';
        case 'all': return 'Altid';
        default: return 'Altid';
      }
    },

    getCategoryLabel: (category: LeaderboardCategory) =>
      get().getCategoryConfig(category).label,

    getCategoryConfig: (category: LeaderboardCategory) => {
      const configs: Record<LeaderboardCategory, {label: string; icon: string}> = {
        checkIns: {label: 'Check-ins', icon: 'checkmark-circle'},
        prs: {label: 'PR\'er', icon: 'trophy'},
        trainingTime: {label: 'Træningstid', icon: 'time'},
        socialTraining: {label: 'Træning med venner', icon: 'people'},
        gym: {label: 'Center', icon: 'business'},
        streak: {label: 'Stribe', icon: 'flame'},
        discipline: {label: 'Disciplin', icon: 'barbell'},
        benchPress: {label: 'Bænkpres', icon: 'barbell'},
        squat: {label: 'Squat', icon: 'barbell'},
        deadlift: {label: 'Dødløft', icon: 'barbell'},
        globalActivity: {label: 'Global aktivitet', icon: 'globe'},
        friendsActivity: {label: 'Venner aktivitet', icon: 'people'},
      };
      return configs[category] || configs.checkIns;
    },
  };
});
