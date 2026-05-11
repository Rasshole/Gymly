import {supabase} from '@/services/supabase/supabaseClient';

export type SendWorkoutVibeResult = {
  ok: boolean;
  duplicate: boolean;
  notificationId?: string;
  error?: string;
};

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

/** Normaliser Postgres text[] / JSON fra RPC til rene emoji-strenge. */
export function normalizeVibeEmojiList(data: unknown): string[] {
  if (data == null) {
    return [];
  }
  if (Array.isArray(data)) {
    return (data as unknown[])
      .map(x => (typeof x === 'string' ? x.trim() : String(x)))
      .filter(Boolean);
  }
  if (typeof data === 'string') {
    const s = data.trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      if (!inner) {
        return [];
      }
      return inner
        .split(',')
        .map(part => part.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeVibeEmojiList(parsed);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

export async function fetchSentWorkoutVibeEmojis(
  recipientId: string,
  recipientCheckInId: string | null,
): Promise<string[]> {
  const {data, error} = await supabase.rpc('get_workout_vibes_sent', {
    p_recipient_id: recipientId,
    p_recipient_check_in_id: recipientCheckInId,
  });
  if (error) {
    throw error;
  }
  const raw = normalizeVibeEmojiList(data);
  console.log('[fetchSentWorkoutVibeEmojis]', {
    recipientId,
    recipientCheckInId,
    raw_len: raw.length,
    raw,
  });
  return raw;
}

export async function sendWorkoutVibeRpc(params: {
  recipientId: string;
  emoji: string;
  recipientCheckInId: string | null;
  centerName: string;
  workoutType: string;
  threadId: string | null;
  routeChat: boolean;
}): Promise<SendWorkoutVibeResult> {
  const payload = {
    p_recipient_id: params.recipientId,
    p_emoji: params.emoji,
    p_recipient_check_in_id: params.recipientCheckInId,
    p_center_name: params.centerName,
    p_workout_type: params.workoutType,
    p_thread_id: params.threadId,
    p_route_chat: params.routeChat,
  };

  console.log('[sendWorkoutVibeRpc] called', {
    sender_id: '(session)',
    recipient_id: params.recipientId,
    emoji: params.emoji,
    session_id: params.recipientCheckInId,
    thread_id: params.threadId,
    route_chat: params.routeChat,
  });

  const {data, error} = await supabase.rpc('send_workout_vibe', payload);

  if (error) {
    console.log('[sendWorkoutVibeRpc] rpc error', {
      message: error.message,
      details: (error as {details?: string}).details,
      hint: (error as {hint?: string}).hint,
      code: error.code,
    });
    return {ok: false, duplicate: false, error: error.message};
  }

  console.log('[sendWorkoutVibeRpc] raw data', typeof data, data);

  const row = parseRpcRow(data);
  if (!row) {
    console.log('[sendWorkoutVibeRpc] insert result: empty/unparseable response');
    return {ok: false, duplicate: false, error: 'empty_response'};
  }

  const err = row.error;
  if (err != null && String(err).length > 0) {
    console.log('[sendWorkoutVibeRpc] server error field', err);
    return {ok: false, duplicate: false, error: String(err)};
  }

  const duplicate =
    row.duplicate === true ||
    row.duplicate === 'true' ||
    row.duplicate === 1;
  const ok =
    row.ok === true || row.ok === 'true' || row.ok === 1;

  const notificationIdRaw =
    row.notification_id ?? row.notificationId ?? undefined;
  const notificationId =
    notificationIdRaw != null ? String(notificationIdRaw) : undefined;

  console.log('[sendWorkoutVibeRpc] parsed', {
    ok,
    duplicate,
    notification_id: notificationId,
  });

  return {
    ok,
    duplicate,
    notificationId,
  };
}
