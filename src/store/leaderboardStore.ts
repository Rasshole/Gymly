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
import danishGyms, {DanishGym} from '@/data/danishGyms';

// Venner af den aktuelle bruger
const FRIEND_IDS = new Set(['1', '2', '3', '4', '5']);

// Mock brugerdata
const MOCK_USERS: {id: string; displayName: string; profileImageUrl?: string}[] = [
  {id: 'current_user', displayName: 'Dig'},
  {id: '1', displayName: 'Jeff'},
  {id: '2', displayName: 'Marie'},
  {id: '3', displayName: 'Lars'},
  {id: '4', displayName: 'Sofia'},
  {id: '5', displayName: 'Anders'},
  {id: '6', displayName: 'Emma'},
  {id: '7', displayName: 'Mikkel'},
  {id: '8', displayName: 'Line'},
  {id: '9', displayName: 'Thomas'},
  {id: '10', displayName: 'Anna'},
  {id: '11', displayName: 'Jonas'},
  {id: '12', displayName: 'Camilla'},
  {id: '13', displayName: 'Henrik'},
  {id: '14', displayName: 'Nina'},
  {id: '15', displayName: 'Peter'},
  {id: '16', displayName: 'Sarah'},
];

// Mock leaderboard stats for alle brugere – deterministisk
const getMockLeaderboardStats = (): LeaderboardStats[] => {
  return MOCK_USERS.map((user, idx) => {
    const seed = idx * 17 + 7;
    const checkInsAllTime = seed % 80 + 15;
    const checkInsMonthly = Math.floor(checkInsAllTime * (0.15 + (seed % 20) / 100));
    const checkInsWeekly = Math.floor(checkInsMonthly * (0.2 + (seed % 15) / 100));
    const prsAllTime = seed % 25 + 3;
    const prsMonthly = Math.floor(prsAllTime * 0.2);
    const prsWeekly = Math.floor(prsMonthly * 0.3);
    const trainingMinutesAllTime = (seed % 6000) + 800;
    const trainingMinutesMonthly = Math.floor(trainingMinutesAllTime * 0.12);
    const trainingMinutesWeekly = Math.floor(trainingMinutesMonthly * 0.3);
    const socialAllTime = Math.floor((seed % 40) + 5);
    const socialMonthly = Math.floor(socialAllTime * 0.25);
    const socialWeekly = Math.floor(socialMonthly * 0.3);
    const currentStreak = (seed % 25) + 1;
    const muscleGroupsTrained = Math.min(7, (seed % 8) + 1);
    const benchPR = (seed % 80) + 60;
    const squatPR = (seed % 100) + 80;
    const deadliftPR = (seed % 120) + 100;
    const activityScore =
      checkInsAllTime * 2 +
      prsAllTime * 5 +
      Math.floor(trainingMinutesAllTime / 30) +
      socialAllTime * 3;

    return {
      userId: user.id,
      checkInsWeekly,
      checkInsMonthly,
      checkInsAllTime,
      prsWeekly,
      prsMonthly,
      prsAllTime,
      trainingMinutesWeekly,
      trainingMinutesMonthly,
      trainingMinutesAllTime,
      socialWorkoutsWeekly: socialWeekly,
      socialWorkoutsMonthly: socialMonthly,
      socialWorkoutsAllTime: socialAllTime,
      currentStreak,
      muscleGroupsTrained,
      benchPR,
      squatPR,
      deadliftPR,
      activityScore,
    };
  });
};


// Mock gym check-ins per user per gym
const getMockGymCheckIns = (): Array<{userId: string; gymId: number; count: number}> => {
  const result: Array<{userId: string; gymId: number; count: number}> = [];
  const gymIds = [1, 2, 3, 497381657, 898936694, 1112453804];

  MOCK_USERS.forEach((user, userIdx) => {
    gymIds.forEach((gymId, gymIdx) => {
      const baseCount = ((userIdx * 7 + gymIdx * 11) % 25) + 5;
      const gymBonus = (userIdx + gymIdx) % 3 === 0 ? 15 : 0;
      result.push({userId: user.id, gymId, count: Math.max(1, baseCount + gymBonus)});
    });
  });
  return result;
};

// Weekly Champion per gym – bruger med højeste ugentlige aktivitetsscore
const getMockWeeklyChampions = (): WeeklyChampion[] => {
  const gymCheckIns = getMockGymCheckIns();
  const gymIds = [1, 2, 3, 497381657, 898936694, 1112453804];

  return gymIds.map(gymId => {
    const gymEntries = gymCheckIns.filter(e => e.gymId === gymId);
    const byUser = gymEntries.reduce<Record<string, number>>((acc, {userId, count}) => {
      acc[userId] = (acc[userId] || 0) + count * 2; // Simpel gym activity score
      return acc;
    }, {});
    const top = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
    const gym = danishGyms.find(g => g.id === gymId);
    const user = MOCK_USERS.find(u => u.id === top?.[0]);
    return {
      gymId,
      gymName: gym?.name || `Center ${gymId}`,
      userId: top?.[0] || 'current_user',
      displayName: user?.displayName || 'Ukendt',
      profileImageUrl: user?.profileImageUrl,
      activityScore: top?.[1] || 0,
    };
  });
};

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
    gymId: number,
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
    gymId?: number
  ) => LeaderboardEntry[];
  /** Hent Weekly Champion for et gym */
  getWeeklyChampion: (gymId: number) => WeeklyChampion | undefined;
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
          const user = MOCK_USERS.find(u => u.id === stats.userId);
          return {
            userId: stats.userId,
            displayName: user?.displayName || 'Ukendt',
            profileImageUrl: user?.profileImageUrl,
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
          const user = MOCK_USERS.find(u => u.id === stats.userId);
          return {
            userId: stats.userId,
            displayName: user?.displayName || 'Dig',
            profileImageUrl: user?.profileImageUrl,
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
        .map(([userId, count]) => {
          const user = MOCK_USERS.find(u => u.id === userId);
          return {
            userId,
            displayName: user?.displayName || 'Ukendt',
            profileImageUrl: user?.profileImageUrl,
            value: count,
            isCurrentUser: userId === currentUserId,
            isFriend: FRIEND_IDS.has(userId),
            isWeeklyChampion: champion?.userId === userId,
          };
        })
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
      const gymIds = [1, 2, 3, 497381657, 898936694, 1112453804];
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
          .map(([userId, count]) => {
            const user = MOCK_USERS.find(u => u.id === userId);
            return {
              userId,
              displayName: user?.displayName || 'Ukendt',
              profileImageUrl: user?.profileImageUrl,
              value: count,
              isCurrentUser: userId === currentUserId,
              isFriend: FRIEND_IDS.has(userId),
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
          .map(([userId, mins]) => {
            const user = MOCK_USERS.find(u => u.id === userId);
            return {
              userId,
              displayName: user?.displayName || 'Ukendt',
              profileImageUrl: user?.profileImageUrl,
              value: mins,
              isCurrentUser: userId === currentUserId,
              isFriend: FRIEND_IDS.has(userId),
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
          valueLabel: formatMinutes(item.value),
          isCurrentUser: item.isCurrentUser,
          isFriend: item.isFriend,
        }));
      }
      return [];
    },


    getGymLeaderboards: (currentUserId) => {
      const gymIds = [1, 2, 3, 497381657, 898936694, 1112453804];
      return gymIds.map(gymId => {
        const gym = danishGyms.find(g => g.id === gymId);
        const leaderboard = get().getGymLeaderboard(
          gymId,
          gym?.name || `Center ${gymId}`,
          'all',
          currentUserId
        );
        const topUser = leaderboard[0];
        return {gym: gym!, topUser: topUser!};
      }).filter(x => x.gym && x.topUser);
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
