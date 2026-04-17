/**
 * useProfileData – hook for profile stats, badges, etc.
 * Uses ProfileService (mock or Firestore)
 */

import {useState, useEffect, useCallback} from 'react';
import {
  getProfileStats,
  getProfileBadges,
  getProfileDisplay,
  getWeeklyStats,
  getMilestones,
} from '@/services/data/ProfileService';
import type {
  ProfileStats,
  ProfileBadge,
  ProfileDisplay,
  WeeklyStats,
  Milestone,
} from '@/types/profile.types';

export function useProfileStats(userId: string | undefined) {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await getProfileStats(userId);
    setStats(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {stats, loading, refresh};
}

export function useProfileBadges(userId: string | undefined) {
  const [badges, setBadges] = useState<ProfileBadge[]>([]);

  useEffect(() => {
    if (!userId) return;
    getProfileBadges(userId).then(setBadges);
  }, [userId]);

  return badges;
}

export function useProfileDisplay(userId: string | undefined) {
  const [display, setDisplay] = useState<ProfileDisplay>({});

  useEffect(() => {
    if (!userId) return;
    getProfileDisplay(userId).then(setDisplay);
  }, [userId]);

  return display;
}

export function useWeeklyStats(userId: string | undefined) {
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const data = await getWeeklyStats(userId);
    setWeeklyStats(data);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {weeklyStats, refresh};
}

export function useMilestones(userId: string | undefined) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!userId) return;
    getMilestones(userId).then(setMilestones);
  }, [userId]);

  return milestones;
}
