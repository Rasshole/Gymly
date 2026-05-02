/**
 * "Aktive centre lige nu" — aggregeret fra gym_active_checkin_rollup + synlige check_ins.
 */
import type {DanishGym} from '@/data/danishGyms';

export type ActiveCenterSession = {
  checkInId: string;
  userId: string;
  displayName: string;
  workoutType: string | null;
  startedAt: string;
  avatarUrl: string | null;
};

export type ActiveCenter = {
  centerId: string;
  displayName: string;
  brandLabel: string;
  address?: string;
  danishGym: DanishGym | null;
  distanceMeters: number | null;
  totalActiveCount: number;
  activeFriendsCount: number;
  activeFriends: ActiveCenterSession[];
  /** Synlige sessioner (dig + venner) på dette center — bruges fx ActiveSessionView */
  activeSessions: ActiveCenterSession[];
};
