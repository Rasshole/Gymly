/**
 * 1:1 Direct Messages (Supabase) – persistens + rækkefølge som Messenger/DM
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import type {Chat, ChatMessage, PlannedWorkoutDmEmbed} from '@/store/chatStore';
import {withAvatarCacheBust} from '../../utils/avatar';
import {safeDisplayName} from '@/utils/displayName';
import {getMessagePreview} from '@/utils/dmMessagePreview';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDmThreadId(s: string | undefined): boolean {
  return !!s && UUID_RE.test(s);
}

export type DmMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  read_at?: string | null;
};

const GYM_PLAN_INVITE_PREFIX = '[GYM_PLAN_INVITE]';
const GYM_PLAN_STATUS_PREFIX = '[GYM_PLAN_STATUS]';

/** Kolonner inkl. read receipts (kræver migration på dm_messages). */
const DM_MESSAGE_SELECT_WITH_READ = 'id, thread_id, sender_id, body, image_url, created_at, read_at';
const DM_MESSAGE_SELECT_LEGACY = 'id, thread_id, sender_id, body, image_url, created_at';

function postgresErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return String(err ?? '');
  }
  const e = err as {message?: string; details?: string; hint?: string; code?: string};
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' ');
}

function isReadReceiptColumnError(err: unknown): boolean {
  const t = postgresErrorText(err).toLowerCase();
  return (
    t.includes('read_at') &&
    /does not exist|schema cache|unknown column|42703|pgrst204/i.test(t)
  );
}

/** Brugervenlig fejl — aldrig rå Postgres/PostgREST-tekst. */
export function userFacingDmError(
  err: unknown,
  fallback = 'Beskeden kunne ikke sendes. Prøv igen.',
): string {
  const raw = postgresErrorText(err);
  if (/not_friends|not friends|P0001/i.test(raw)) {
    return 'I kan kun sende beskeder til venner.';
  }
  if (/not authenticated/i.test(raw)) {
    return 'Log ind igen for at sende beskeder.';
  }
  if (/network|fetch failed|failed to fetch|timeout/i.test(raw)) {
    return 'Ingen forbindelse. Tjek internettet og prøv igen.';
  }
  if (isReadReceiptColumnError(err) || /column |does not exist|42703|postgres|pgrst/i.test(raw)) {
    return fallback;
  }
  if (raw.length > 0 && raw.length < 100 && !/column |does not exist/i.test(raw)) {
    return raw;
  }
  return fallback;
}

function logDmService(context: string, err: unknown) {
  console.warn(`[dm] ${context}:`, postgresErrorText(err));
}

async function fetchDmMessageRowById(
  messageId: string,
  threadId: string,
): Promise<DmMessageRow> {
  for (const cols of [DM_MESSAGE_SELECT_WITH_READ, DM_MESSAGE_SELECT_LEGACY]) {
    const {data, error} = await supabase
      .from('dm_messages')
      .select(cols)
      .eq('id', messageId)
      .eq('thread_id', threadId)
      .maybeSingle();
    if (!error && data) {
      return data as DmMessageRow;
    }
    if (error && !isReadReceiptColumnError(error)) {
      throw new Error(userFacingDmError(error));
    }
  }
  throw new Error(
    'Beskeden blev sendt, men kunne ikke hentes. Træk ned for at opdatere.',
  );
}

function parsePlannedWorkoutDmBody(body: string | null): {
  text: string;
  plannedWorkoutEmbed?: PlannedWorkoutDmEmbed;
} {
  const raw = body ?? '';
  if (raw.startsWith(GYM_PLAN_INVITE_PREFIX)) {
    try {
      const data = JSON.parse(
        raw.slice(GYM_PLAN_INVITE_PREFIX.length),
      ) as {
        plannedWorkoutId?: string;
        centerName?: string;
        scheduledAt?: string;
        trainingTypes?: unknown;
        status?: string;
      };
      const id = data.plannedWorkoutId;
      if (!id) {
        return {text: raw};
      }
      const types = Array.isArray(data.trainingTypes)
        ? (data.trainingTypes as string[])
        : [];
      return {
        text: '',
        plannedWorkoutEmbed: {
          kind: 'invite',
          plannedWorkoutId: id,
          centerName: data.centerName ?? '',
          scheduledAt: data.scheduledAt ?? '',
          trainingTypes: types,
          status: 'pending',
        },
      };
    } catch {
      return {text: raw};
    }
  }
  if (raw.startsWith(GYM_PLAN_STATUS_PREFIX)) {
    try {
      const data = JSON.parse(raw.slice(GYM_PLAN_STATUS_PREFIX.length)) as {
        plannedWorkoutId?: string;
        status?: string;
      };
      const id = data.plannedWorkoutId;
      if (!id || (data.status !== 'accepted' && data.status !== 'declined')) {
        return {text: raw};
      }
      return {
        text: '',
        plannedWorkoutEmbed: {
          kind: 'status',
          plannedWorkoutId: id,
          status: data.status,
        },
      };
    } catch {
      return {text: raw};
    }
  }
  return {text: raw.trim()};
}

export function messageFromDmRow(row: DmMessageRow): ChatMessage {
  const parsed = parsePlannedWorkoutDmBody(row.body);
  return {
    id: row.id,
    text: parsed.text,
    senderId: row.sender_id,
    timestamp: new Date(row.created_at),
    isRead: true,
    imageUri: row.image_url?.trim() || undefined,
    plannedWorkoutEmbed: parsed.plannedWorkoutEmbed,
    readAt: row.read_at ? new Date(row.read_at) : undefined,
  };
}

type DmThreadRow = {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_id: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  updated_at?: string | null;
};

function mapRowToMessage(row: DmMessageRow): ChatMessage {
  return messageFromDmRow(row);
}

function rpcErrorToMessage(m: string): string {
  if (/not_friends|not friends|P0001/i.test(m)) {
    return 'I kan kun skrive, når I er venner. Send en venneanmodning først.';
  }
  if (/invalid peer|self/i.test(m)) {
    return 'Ugyldig modtager';
  }
  if (/not authenticated/i.test(m)) {
    return 'Log ind igen for at bruge chat';
  }
  return m || 'Kunne ikke hente chat';
}

/** Opret eller find 1:1-tråd (kræver venskab). */
export async function getOrCreateDmThread(otherUserId: string): Promise<string> {
  const {data, error} = await supabase.rpc('get_or_create_dm_thread', {
    p_other_user_id: otherUserId,
  });
  if (error) {
    throw new Error(rpcErrorToMessage(error.message));
  }
  if (typeof data !== 'string' || !isDmThreadId(data)) {
    throw new Error('Kunne ikke oprette tråd');
  }
  return data;
}

export type SendDmResult = {message: ChatMessage; row: DmMessageRow};

export async function sendDmMessage(
  threadId: string,
  input: {body: string; imageUrl?: string | null},
): Promise<SendDmResult> {
  const body = (input.body || '').trim();
  const imageUrl = (input.imageUrl || '').trim() || null;
  if (!body && !imageUrl) {
    throw new Error('Tom besked');
  }
  const {data: userData} = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    throw new Error('Ikke logget ind');
  }

  const {data: inserted, error: insertErr} = await supabase
    .from('dm_messages')
    .insert({
      thread_id: threadId,
      sender_id: uid,
      body: body || null,
      image_url: imageUrl,
    })
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(userFacingDmError(insertErr));
  }
  const row = await fetchDmMessageRowById(inserted.id, threadId);
  // Trigger on dm_messages should create a `notifications` row for recipient.
  // Fallback: if row exists, call send-push directly to avoid missing webhook dispatch.
  setTimeout(async () => {
    try {
      const {data: notification, error: notificationError} = await supabase
        .from('notifications')
        .select('id, user_id, actor_user_id, type, title, body, data')
        .eq('type', 'dm_message')
        .filter('data->>messageId', 'eq', row.id)
        .order('created_at', {ascending: false})
        .limit(1)
        .maybeSingle();

      if (notificationError) {
        if (__DEV__) {
          console.log('[notify] dm_message notification lookup failed:', notificationError.message);
        }
        return;
      }

      if (!notification?.id) {
        if (__DEV__) {
          console.log('[notify] dm_message notification created:', false, {messageId: row.id});
        }
        return;
      }

      if (__DEV__) {
        console.log('[notify] dm_message notification created:', true, {
          notification_id: notification.id,
          recipient_id: notification.user_id,
        });
      }

      const {data: pushResult, error: pushError} = await supabase.functions.invoke('send-push', {
        body: {
          notification_id: notification.id,
        },
      });

      if (__DEV__) {
        if (pushError) {
          console.log('[notify] send-push called:', false, {
            notification_id: notification.id,
            recipient_id: notification.user_id,
            error: pushError.message,
          });
        } else {
          console.log('[notify] send-push called:', true, {
            notification_id: notification.id,
            recipient_id: notification.user_id,
            response: pushResult,
          });
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.log('[notify] dm send-push fallback failed:', error);
      }
    }
  }, 450);
  void checkAndUnlockBadges(uid);
  return {message: mapRowToMessage(row), row};
}

export async function fetchDmMessages(
  threadId: string,
  options: {limit?: number} = {},
): Promise<ChatMessage[]> {
  const limit = Math.min(options.limit ?? 100, 200);
  let {data, error} = await supabase
    .from('dm_messages')
    .select(DM_MESSAGE_SELECT_WITH_READ)
    .eq('thread_id', threadId)
    .order('created_at', {ascending: true})
    .limit(limit);
  if (error && isReadReceiptColumnError(error)) {
    logDmService('fetchDmMessages: retry without read_at', error);
    ({data, error} = await supabase
      .from('dm_messages')
      .select(DM_MESSAGE_SELECT_LEGACY)
      .eq('thread_id', threadId)
      .order('created_at', {ascending: true})
      .limit(limit));
  }
  if (error) {
    throw new Error(userFacingDmError(error, 'Kunne ikke hente beskeder.'));
  }
  return (data as DmMessageRow[]).map(mapRowToMessage);
}

/**
 * Ulæste beskeder pr. tråd: modpartens beskeder hvor read_at er null.
 * Returnerer null hvis read_at-kolonnen mangler (brug legacy inbox-heuristik).
 */
export async function fetchDmUnreadCountsByThread(
  myUserId: string,
  threadIds: string[],
): Promise<Record<string, number> | null> {
  if (!threadIds.length) {
    return {};
  }
  const {data, error} = await supabase
    .from('dm_messages')
    .select('thread_id')
    .in('thread_id', threadIds)
    .neq('sender_id', myUserId)
    .is('read_at', null);
  if (error) {
    if (isReadReceiptColumnError(error)) {
      logDmService('fetchDmUnreadCountsByThread: read_at missing', error);
      return null;
    }
    logDmService('fetchDmUnreadCountsByThread', error);
    return null;
  }
  const counts: Record<string, number> = {};
  for (const row of (data as {thread_id: string}[] | null) ?? []) {
    counts[row.thread_id] = (counts[row.thread_id] ?? 0) + 1;
  }
  return counts;
}

/** Marker alle modpartens beskeder som læst (sætter read_at). */
export async function markDmThreadMessagesRead(threadId: string): Promise<void> {
  const {error} = await supabase.rpc('mark_dm_thread_messages_read', {
    p_thread_id: threadId,
  });
  if (error) {
    logDmService('markDmThreadMessagesRead', error);
  }
}

export type DmInboxItem = {
  thread: DmThreadRow;
  otherUserId: string;
  otherDisplayName: string;
  otherUsername: string;
  otherAvatar: string | null;
};

/**
 * Inbox: alle 1:1-tråde med modpartens profil (sorteret efter seneste besked)
 */
export async function fetchDmInbox(
  myUserId: string,
  myDisplayName: string,
): Promise<DmInboxItem[]> {
  const {data: threads, error: tErr} = await supabase
    .from('dm_threads')
    .select('id, user_a, user_b, last_message_at, last_message_preview, last_sender_id')
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`)
    .order('last_message_at', {ascending: false, nullsFirst: false});

  if (tErr) {
    throw new Error(tErr.message);
  }
  if (!threads?.length) {
    return [];
  }

  const otherIds: string[] = (threads as DmThreadRow[]).map(t => {
    return t.user_a === myUserId ? t.user_b : t.user_a;
  });
  const unique = Array.from(new Set(otherIds));
  if (unique.length === 0) {
    return [];
  }

  const {data: profiles, error: pErr} = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, updated_at')
    .in('id', unique);
  if (pErr) {
    throw new Error(pErr.message);
  }
  const byId: Record<string, ProfileRow> = {};
  (profiles as ProfileRow[] | null)?.forEach(p => {
    byId[p.id] = p;
  });

  return (threads as DmThreadRow[]).map(t => {
    const otherId = t.user_a === myUserId ? t.user_b : t.user_a;
    const p = byId[otherId];
    return {
      thread: t,
      otherUserId: otherId,
      otherDisplayName: safeDisplayName(p?.display_name, p?.username),
      otherUsername: p?.username || 'bruger',
      otherAvatar: withAvatarCacheBust(p?.avatar_url ?? null, p?.updated_at) ?? null,
    };
  });
}

/**
 * Én tråd (fx når Realtime kommer før indbakken er synket ind i Zustand)
 */
export async function fetchDmInboxItemForThread(
  myUserId: string,
  threadId: string,
): Promise<DmInboxItem | null> {
  const {data: t, error: tErr} = await supabase
    .from('dm_threads')
    .select('id, user_a, user_b, last_message_at, last_message_preview, last_sender_id')
    .eq('id', threadId)
    .maybeSingle();

  if (tErr || !t) {
    return null;
  }
  const row = t as DmThreadRow;
  if (row.user_a !== myUserId && row.user_b !== myUserId) {
    return null;
  }
  const otherId = row.user_a === myUserId ? row.user_b : row.user_a;
  const {data: profile, error: pErr} = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, updated_at')
    .eq('id', otherId)
    .maybeSingle();
  if (pErr) {
    return null;
  }
  const p = profile as ProfileRow | null;
  return {
    thread: row,
    otherUserId: otherId,
    otherDisplayName: safeDisplayName(p?.display_name, p?.username),
    otherUsername: p?.username || 'bruger',
    otherAvatar: withAvatarCacheBust(p?.avatar_url ?? null, p?.updated_at) ?? null,
  };
}

/**
 * Ingen unreadCount: den sættes i sync/upsert (0 fra server betyder ikke
 * “læst” hvis lokal tæller var 1).
 */
export function inboxItemToChat(
  item: DmInboxItem,
  myUserId: string,
  myDisplayName: string,
): Omit<Chat, 'unreadCount'> {
  const {thread, otherUserId, otherDisplayName, otherUsername, otherAvatar} = item;
  const ids = [myUserId, otherUserId].sort();
  const myLabel = (myDisplayName || 'Dig').trim();
  const nameById: Record<string, string> = {
    [myUserId]: myLabel,
    [otherUserId]: otherDisplayName,
  };
  const names = ids.map(id => nameById[id] || 'Ven');

  let lastMessage: ChatMessage | undefined;
  if (thread.last_message_at && thread.last_message_preview) {
    const ts = new Date(thread.last_message_at);
    lastMessage = {
      id: 'last_meta',
      text: getMessagePreview({text: thread.last_message_preview ?? ''}),
      senderId: thread.last_sender_id || '',
      timestamp: ts,
      isRead: true,
    };
  }

  return {
    id: thread.id,
    participantIds: ids,
    participantNames: names,
    lastMessage,
    lastActivity: thread.last_message_at ? new Date(thread.last_message_at) : new Date(0),
    avatar: otherAvatar ?? undefined,
    avatarInitials: otherDisplayName?.charAt(0) ?? otherUsername?.charAt(0) ?? undefined,
  };
}

export function dmMessageFromPayload(newRow: unknown): DmMessageRow | null {
  if (!newRow || typeof newRow !== 'object') {
    return null;
  }
  const r = newRow as Record<string, unknown>;
  if (
    typeof r.id === 'string' &&
    typeof r.thread_id === 'string' &&
    typeof r.sender_id === 'string' &&
    typeof r.created_at === 'string'
  ) {
    return {
      id: r.id,
      thread_id: r.thread_id,
      sender_id: r.sender_id,
      body: typeof r.body === 'string' ? r.body : null,
      image_url: typeof r.image_url === 'string' ? r.image_url : null,
      created_at: r.created_at,
      read_at: typeof r.read_at === 'string' ? r.read_at : null,
    };
  }
  return null;
}
