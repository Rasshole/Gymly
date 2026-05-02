import {useEffect, useRef} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {supabase} from '@/services/supabase/supabaseClient';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {loadWorkoutPlanEntriesForUser} from '@/services/supabase/plannedWorkoutService';

/**
 * Global Realtime: grupper, medlemmer, inviter, beskeder, læs-state.
 * Udløser refresh ved ændringer (RLS sørger for at brugeren kun får relevante rækker).
 */
export function GymlyGroupsRealtimeSync() {
  const userId = useAppStore(s => s.user?.id);
  const refresh = useGymlyGroupsStore(s => s.refresh);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) {
      useGymlyGroupsStore.getState().reset();
      return;
    }
    void refresh(userId);
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }
    const run = () => {
      void refresh(userId);
    };
    const runPlanned = () => {
      void (async () => {
        try {
          const entries = await loadWorkoutPlanEntriesForUser(userId, true);
          useWorkoutPlanStore.getState().mergePlannedFromServer(entries);
        } catch {
          /* tabel/RLS */
        }
      })();
    };
    const ch = supabase
      .channel(`gymly_groups_sync_${userId}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_groups'},
        run,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_members'},
        run,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_invites'},
        run,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_messages'},
        run,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'gymly_group_member_state'},
        run,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'planned_workouts'},
        runPlanned,
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'planned_workout_participants'},
        runPlanned,
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        void refresh(userId);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [userId, refresh]);

  return null;
}
