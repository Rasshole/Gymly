/**
 * 1:1 Direct Messages (Supabase) – persistens + rækkefølge som Messenger/DM
 */

import {supabase} from '@/services/supabase/supabaseClient';
import type {Chat, ChatMessage, PlannedWorkoutDmEmbed} from '@/store/chatStore';
import {withAvatarCacheBust} from '../../utils/avatar';
import {safeDisplayName} from '@/utils/displayName';

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
};

const GYM_PLAN_INVITE_PREFIX = '[GYM_PLAN_INVITE]';
const GYM_PLAN_STATUS_PREFIX = '[GYM_PLAN_STATUS]';

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

  const {data, error} = await supabase
    .from('dm_messages')
    .insert({
      thread_id: threadId,
      sender_id: uid,
      body: body || null,
      image_url: imageUrl,
    })
    .select('id, thread_id, sender_id, body, image_url, created_at')
    .single();

  if (error) {
    throw new Error(error.message || 'Kunne ikke sende besked');
  }
  const row = data as DmMessageRow;
  return {message: mapRowToMessage(row), row};
}

export async function fetchDmMessages(
  threadId: string,
  options: {limit?: number} = {},
): Promise<ChatMessage[]> {
  const limit = Math.min(options.limit ?? 100, 200);
  const {data, error} = await supabase
    .from('dm_messages')
    .select('id, thread_id, sender_id, body, image_url, created_at')
    .eq('thread_id', threadId)
    .order('created_at', {ascending: true})
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return (data as DmMessageRow[]).map(mapRowToMessage);
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
      text: thread.last_message_preview,
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
    };
  }
  return null;
}
