import {supabase} from '@/services/supabase/supabaseClient';

export type CompletedCheckInStatsRow = {
  id: string;
  gym_name: string;
  started_at: string;
  ended_at: string;
  workout_type: string | null;
  is_active: boolean | null;
};

/** Hent egne afsluttede check_ins til stats (RPC først, derefter direkte query). */
export async function fetchCompletedCheckInsForStats(
  userId: string,
): Promise<CompletedCheckInStatsRow[]> {
  const {data: rpcRows, error: rpcErr} = await supabase.rpc(
    'get_my_completed_check_ins_for_stats',
    {p_limit: 5000},
  );
  if (!rpcErr && Array.isArray(rpcRows)) {
    return rpcRows as CompletedCheckInStatsRow[];
  }

  const {data, error} = await supabase
    .from('check_ins')
    .select('id, gym_name, started_at, ended_at, workout_type, is_active')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .not('started_at', 'is', null)
    .order('ended_at', {ascending: false})
    .limit(5000);

  if (error) {
    throw error;
  }
  return (data ?? []) as CompletedCheckInStatsRow[];
}
