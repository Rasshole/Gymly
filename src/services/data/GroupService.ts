/**
 * Group Service — grupper fra backend (Firestore) når integration er klar
 */

import type {Group, GroupActivity} from '@/types/group.types';

export async function getGroups(_userId: string): Promise<Group[]> {
  return [];
}

export async function getJoinedGroups(userId: string): Promise<Group[]> {
  const groups = await getGroups(userId);
  return groups.filter(g => g.isJoined);
}

export async function getGroupById(
  _groupId: string,
  _userId: string,
): Promise<Group | null> {
  return null;
}

export async function getGroupActivity(
  _groupId: string,
  _userId: string,
): Promise<GroupActivity[]> {
  return [];
}
