/**
 * Say-hi (gym stranger greeting) — client API.
 * Graceful when backend RPCs / columns are missing (no unsafe fallback).
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {
  normalizeContactStatus,
  validateSayHiMessage,
  type ContactStatus,
} from '@/utils/contactStatus';
import {safeDisplayName} from '@/utils/displayName';

export type SayHiBackendUnavailableError = {
  code: 'backend_unavailable';
  message: string;
};

export function isSayHiBackendUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as {code?: string; message?: string};
  if (e.code === 'backend_unavailable') {
    return true;
  }
  const t = String(e.message ?? '').toLowerCase();
  return (
    /could not find the function|schema cache|pgrst202|42883|does not exist/i.test(
      t,
    ) || /contact_status/i.test(t)
  );
}

function parseRpcRow(data: unknown): Record<string, unknown> | null {
  if (data == null) {
    return null;
  }
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export type SayHiRelation = {
  ok: boolean;
  relation?: 'self' | 'blocked';
  isFriend: boolean;
  threadId: string | null;
  outgoingRequestId: string | null;
  incomingRequestId: string | null;
  otherContactStatus: ContactStatus | null;
  otherLive: {
    checkInId: string;
    gymId: string;
    gymName: string | null;
    workoutType: string | null;
    startedAt: string | null;
    contactStatus: ContactStatus | null;
  } | null;
  error?: string;
  backendUnavailable?: boolean;
};

export async function getSayHiRelation(
  otherUserId: string,
): Promise<SayHiRelation> {
  const {data, error} = await supabase.rpc('get_say_hi_relation', {
    p_other: otherUserId,
  });
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {
        ok: false,
        isFriend: false,
        threadId: null,
        outgoingRequestId: null,
        incomingRequestId: null,
        otherContactStatus: null,
        otherLive: null,
        backendUnavailable: true,
        error: 'backend_unavailable',
      };
    }
    return {
      ok: false,
      isFriend: false,
      threadId: null,
      outgoingRequestId: null,
      incomingRequestId: null,
      otherContactStatus: null,
      otherLive: null,
      error: error.message,
    };
  }
  const row = parseRpcRow(data) ?? {};
  if (row.relation === 'self' || row.relation === 'blocked') {
    return {
      ok: true,
      relation: row.relation,
      isFriend: false,
      threadId: null,
      outgoingRequestId: null,
      incomingRequestId: null,
      otherContactStatus: null,
      otherLive: null,
    };
  }
  const liveRaw = row.other_live as Record<string, unknown> | null | undefined;
  return {
    ok: row.ok !== false,
    isFriend: Boolean(row.is_friend),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    outgoingRequestId:
      row.outgoing_request_id != null ? String(row.outgoing_request_id) : null,
    incomingRequestId:
      row.incoming_request_id != null ? String(row.incoming_request_id) : null,
    otherContactStatus: normalizeContactStatus(
      row.other_contact_status != null
        ? String(row.other_contact_status)
        : null,
    ),
    otherLive: liveRaw
      ? {
          checkInId: String(liveRaw.check_in_id ?? ''),
          gymId: String(liveRaw.gym_id ?? ''),
          gymName:
            liveRaw.gym_name != null ? String(liveRaw.gym_name) : null,
          workoutType:
            liveRaw.workout_type != null
              ? String(liveRaw.workout_type)
              : null,
          startedAt:
            liveRaw.started_at != null ? String(liveRaw.started_at) : null,
          contactStatus: normalizeContactStatus(
            liveRaw.contact_status != null
              ? String(liveRaw.contact_status)
              : null,
          ),
        }
      : null,
  };
}

export type SendSayHiResult = {
  ok: boolean;
  requestId?: string;
  error?: string;
  backendUnavailable?: boolean;
};

export async function sendSayHiRequest(
  recipientId: string,
  rawMessage: string,
): Promise<SendSayHiResult> {
  const validated = validateSayHiMessage(rawMessage);
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.error === 'too_long' ? 'message_too_long' : 'empty_message',
    };
  }
  const {data, error} = await supabase.rpc('send_say_hi_request', {
    p_recipient_id: recipientId,
    p_message: validated.message,
  });
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {ok: false, backendUnavailable: true, error: 'backend_unavailable'};
    }
    return {ok: false, error: error.message};
  }
  const row = parseRpcRow(data) ?? {};
  if (row.ok === true || row.ok === 'true') {
    return {
      ok: true,
      requestId: row.request_id != null ? String(row.request_id) : undefined,
    };
  }
  return {
    ok: false,
    error: row.error != null ? String(row.error) : 'unknown',
    requestId:
      row.request_id != null ? String(row.request_id) : undefined,
  };
}

export type RespondSayHiResult = {
  ok: boolean;
  status?: string;
  threadId?: string;
  duplicate?: boolean;
  error?: string;
  backendUnavailable?: boolean;
};

export async function respondSayHiRequest(
  requestId: string,
  action: 'accept' | 'decline',
): Promise<RespondSayHiResult> {
  const {data, error} = await supabase.rpc('respond_say_hi_request', {
    p_request_id: requestId,
    p_action: action,
  });
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {ok: false, backendUnavailable: true, error: 'backend_unavailable'};
    }
    return {ok: false, error: error.message};
  }
  const row = parseRpcRow(data) ?? {};
  if (row.ok === true || row.ok === 'true') {
    return {
      ok: true,
      status: row.status != null ? String(row.status) : undefined,
      threadId: row.thread_id != null ? String(row.thread_id) : undefined,
      duplicate: Boolean(row.duplicate),
    };
  }
  return {
    ok: false,
    error: row.error != null ? String(row.error) : 'unknown',
    status: row.status != null ? String(row.status) : undefined,
  };
}

export type IncomingSayHiRequest = {
  id: string;
  senderId: string;
  message: string;
  gymId: string;
  gymName: string | null;
  createdAt: string;
  expiresAt: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  liveWorkoutType: string | null;
  liveGymName: string | null;
  liveContactStatus: ContactStatus | null;
};

export async function listIncomingSayHiRequests(): Promise<{
  requests: IncomingSayHiRequest[];
  backendUnavailable: boolean;
}> {
  const {data, error} = await supabase.rpc('list_incoming_say_hi_requests');
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {requests: [], backendUnavailable: true};
    }
    throw error;
  }
  const arr = Array.isArray(data)
    ? data
    : typeof data === 'string'
      ? (JSON.parse(data) as unknown[])
      : [];
  const requests: IncomingSayHiRequest[] = (arr as Record<string, unknown>[]).map(
    row => ({
      id: String(row.id),
      senderId: String(row.sender_id),
      message: String(row.message ?? ''),
      gymId: String(row.gym_id ?? ''),
      gymName: row.gym_name != null ? String(row.gym_name) : null,
      createdAt: String(row.created_at ?? ''),
      expiresAt: String(row.expires_at ?? ''),
      senderDisplayName: safeDisplayName(
        String(row.sender_display_name ?? ''),
      ),
      senderAvatarUrl:
        row.sender_avatar_url != null ? String(row.sender_avatar_url) : null,
      liveWorkoutType:
        row.live_workout_type != null ? String(row.live_workout_type) : null,
      liveGymName:
        row.live_gym_name != null ? String(row.live_gym_name) : null,
      liveContactStatus: normalizeContactStatus(
        row.live_contact_status != null
          ? String(row.live_contact_status)
          : null,
      ),
    }),
  );
  return {requests, backendUnavailable: false};
}

export async function updateMyContactStatus(
  status: ContactStatus | null,
): Promise<{ok: boolean; error?: string; backendUnavailable?: boolean}> {
  const {data, error} = await supabase.rpc('update_my_contact_status', {
    p_status: status,
  });
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {ok: false, backendUnavailable: true, error: 'backend_unavailable'};
    }
    return {ok: false, error: error.message};
  }
  const row = parseRpcRow(data) ?? {};
  if (row.ok === true || row.ok === 'true') {
    return {ok: true};
  }
  return {
    ok: false,
    error: row.error != null ? String(row.error) : 'unknown',
  };
}

export async function reportUser(params: {
  otherUserId: string;
  reason?: string;
  details?: string;
  context?: Record<string, unknown>;
}): Promise<{ok: boolean; error?: string; backendUnavailable?: boolean}> {
  const {error} = await supabase.rpc('report_user', {
    p_other: params.otherUserId,
    p_reason: params.reason ?? 'other',
    p_details: params.details ?? null,
    p_context: params.context ?? {},
  });
  if (error) {
    if (isSayHiBackendUnavailable(error)) {
      return {ok: false, backendUnavailable: true, error: 'backend_unavailable'};
    }
    return {ok: false, error: error.message};
  }
  return {ok: true};
}

export function sayHiErrorMessage(
  code: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case 'backend_unavailable':
      return t('sayHi.backendUnavailable');
    case 'recipient_focused':
      return t('sayHi.errRecipientFocused');
    case 'recipient_not_checked_in':
    case 'sender_not_checked_in':
    case 'different_gym':
      return t('sayHi.errNotSameGym');
    case 'blocked':
      return t('sayHi.errBlocked');
    case 'already_pending':
      return t('sayHi.errAlreadyPending');
    case 'incoming_pending':
      return t('sayHi.errIncomingPending');
    case 'already_friends':
    case 'already_chatting':
      return t('sayHi.errAlreadyChatting');
    case 'cooldown':
    case 'same_session_repeat':
      return t('sayHi.errCooldown');
    case 'rate_hour':
    case 'rate_day':
      return t('sayHi.errRateLimit');
    case 'empty_message':
      return t('sayHi.errEmpty');
    case 'message_too_long':
      return t('sayHi.errTooLong');
    case 'expired':
      return t('sayHi.errExpired');
    default:
      return t('sayHi.errGeneric');
  }
}
