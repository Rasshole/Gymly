/**
 * useGroupData – hook for groups data
 * Uses GroupService (mock or Firestore)
 */

import {useState, useEffect, useCallback} from 'react';
import {
  getGroups,
  getJoinedGroups,
  getGroupById,
  getGroupActivity,
} from '@/services/data/GroupService';
import type {Group, GroupActivity} from '@/types/group.types';

export function useGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await getGroups(userId);
    setGroups(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {groups, loading, refresh};
}

export function useJoinedGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getJoinedGroups(userId).then((data) => {
      setGroups(data);
      setLoading(false);
    });
  }, [userId]);

  return {groups, loading};
}

export function useGroup(groupId: string | undefined, userId: string | undefined) {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !userId) return;
    setLoading(true);
    getGroupById(groupId, userId).then((data) => {
      setGroup(data);
      setLoading(false);
    });
  }, [groupId, userId]);

  return {group, loading};
}

export function useGroupActivity(groupId: string | undefined, userId: string | undefined) {
  const [activity, setActivity] = useState<GroupActivity[]>([]);

  useEffect(() => {
    if (!groupId || !userId) return;
    getGroupActivity(groupId, userId).then(setActivity);
  }, [groupId, userId]);

  return activity;
}
