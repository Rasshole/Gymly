import type {SupabaseCheckInRow} from '@/types/checkIn.types';
import type {CheckInSubmitResult, SubmitCheckInParams} from '@/types/checkIn.types';

export type SmartCheckInSession = {
  id: string;
  gymId: string;
  gymName: string;
  city: string | null;
  startedAt: Date;
  workoutType: string;
};

export type SmartCheckInStartResult =
  | {ok: true; created: boolean; session: SmartCheckInSession}
  | {ok: false};

type StartDeps = {
  getActive: (userId: string) => Promise<SupabaseCheckInRow | null>;
  submit: (params: SubmitCheckInParams) => Promise<CheckInSubmitResult>;
};

function defaultDeps(): StartDeps {
  return {
    getActive: userId => {
      const {getActiveCheckInForUser} =
        require('@/services/supabase/checkInService') as typeof import('@/services/supabase/checkInService');
      return getActiveCheckInForUser(userId);
    },
    submit: params => {
      const {submitCheckIn} =
        require('@/services/firestore/CheckinService') as typeof import('@/services/firestore/CheckinService');
      return submitCheckIn(params);
    },
  };
}

let inFlight: Promise<SmartCheckInStartResult> | null = null;

function sessionFromRow(row: SupabaseCheckInRow): SmartCheckInSession {
  return {
    id: row.id,
    gymId: String(row.gym_id),
    gymName: row.gym_name,
    city: row.city ?? null,
    startedAt: new Date(row.started_at ?? Date.now()),
    workoutType: row.workout_type ?? '',
  };
}

async function performStart(
  input: {
    userId: string;
    gymId: string;
    gymName: string;
    city?: string;
    displayName: string;
  },
  deps: StartDeps,
): Promise<SmartCheckInStartResult> {
  const existing = await deps.getActive(input.userId);
  if (existing?.id) {
    return {ok: true, created: false, session: sessionFromRow(existing)};
  }

  try {
    const created = await deps.submit({
      userId: input.userId,
      gymId: input.gymId,
      gymName: input.gymName,
      city: input.city,
      displayName: input.displayName,
    });
    return {
      ok: true,
      created: true,
      session: {
        id: created.id,
        gymId: input.gymId,
        gymName: input.gymName,
        city: input.city ?? null,
        startedAt: created.startedAt,
        workoutType: '',
      },
    };
  } catch {
    const recovered = await deps.getActive(input.userId).catch(() => null);
    if (recovered?.id) {
      return {ok: true, created: false, session: sessionFromRow(recovered)};
    }
    return {ok: false};
  }
}

/**
 * Starts through the existing check-in insert.
 * A second tap shares the same attempt. Before every attempt, and after an
 * unclear failure, an existing active row is reused instead of inserted again.
 * workout_type is left empty. The column is nullable.
 */
export function startSmartCheckIn(
  input: {
    userId: string;
    gymId: string;
    gymName: string;
    city?: string;
    displayName: string;
  },
  deps: StartDeps = defaultDeps(),
): Promise<SmartCheckInStartResult> {
  if (inFlight) {
    return inFlight;
  }
  const run = performStart(input, deps).finally(() => {
    if (inFlight === run) {
      inFlight = null;
    }
  });
  inFlight = run;
  return run;
}
