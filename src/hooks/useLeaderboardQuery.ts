/**
 * useLeaderboardQuery
 * Hook til rangliste med loading, caching og pagination
 */

import {useState, useCallback, useRef, useEffect} from 'react';
import {
  fetchGlobalLeaderboard,
  fetchFriendsLeaderboard,
  fetchGymLeaderboard,
  fetchWeeklyChampion,
  fetchWeeklyChampions,
} from '@/services/leaderboard/leaderboardService';
import {LEADERBOARD_CACHE_TTL} from '@/config/leaderboardConfig';
import type {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardTab,
  WeeklyChampion,
} from '@/types/leaderboard.types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<LeaderboardEntry[]>>();
const championCache = new Map<string, CacheEntry<WeeklyChampion[]>>();

function cacheKey(
  scope: string,
  category: string,
  period: string,
  extra?: string
): string {
  return `${scope}:${category}:${period}${extra ? `:${extra}` : ''}`;
}

function getCached<T>(key: string, map: Map<string, CacheEntry<T>>): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LEADERBOARD_CACHE_TTL) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, map: Map<string, CacheEntry<T>>) {
  map.set(key, {data, timestamp: Date.now()});
}

export function useLeaderboardQuery(
  tab: LeaderboardTab,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  currentUserId: string,
  gymId?: number,
  gymName?: string
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef(false);

  const load = useCallback(async () => {
    abortRef.current = false;
    setIsLoading(true);
    setError(null);

    const key =
      tab === 'gyms'
        ? cacheKey('gym', 'gym', period, `${gymId}`)
        : cacheKey(
            tab,
            tab === 'friends' ? 'friendsActivity' : category,
            period
          );

    const cached =
      tab !== 'gyms' && gymId == null
        ? getCached(key, cache)
        : tab === 'gyms' && gymId
          ? getCached(key, cache)
          : null;

    if (cached) {
      setEntries(cached);
      setIsLoading(false);
      return;
    }

    try {
      let result;
      if (tab === 'global') {
        result = await fetchGlobalLeaderboard(
          category,
          period,
          currentUserId
        );
      } else if (tab === 'friends') {
        result = await fetchFriendsLeaderboard(
          'friendsActivity',
          period,
          currentUserId
        );
      } else if (gymId != null && gymName) {
        result = await fetchGymLeaderboard(
          gymId,
          gymName,
          period,
          currentUserId
        );
      } else {
        setEntries([]);
        setIsLoading(false);
        return;
      }

      if (abortRef.current) return;
      setEntries(result.entries);
      setCache(key, result.entries, cache);
    } catch (e) {
      if (!abortRef.current) setError(e instanceof Error ? e : new Error(String(e)));
      setEntries([]);
    } finally {
      if (!abortRef.current) setIsLoading(false);
    }
  }, [tab, category, period, currentUserId, gymId, gymName]);

  useEffect(() => {
    load();
    return () => {
      abortRef.current = true;
    };
  }, [load]);

  return {entries, isLoading, error, refetch: load};
}

export function useWeeklyChampionQuery(gymId?: number) {
  const [champion, setChampion] = useState<WeeklyChampion | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (gymId == null) return;
    let cancelled = false;
    (async () => {
      const result = await fetchWeeklyChampion(gymId);
      if (!cancelled) setChampion(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [gymId]);

  return {champion, isLoading};
}

export function useWeeklyChampionsQuery() {
  const [champions, setChampions] = useState<WeeklyChampion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = 'all_champions';
    const cached = getCached(key, championCache);
    if (cached) {
      setChampions(cached);
      return;
    }
    setIsLoading(true);
    fetchWeeklyChampions().then(result => {
      if (!cancelled) {
        setChampions(result);
        setCache(key, result, championCache);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {champions, isLoading};
}
