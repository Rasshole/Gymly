import type {ChatMessage} from '@/store/chatStore';

let lastDmSendMs = 0;

/** Keeps rapid sends ordered even when Date.now() repeats. */
export function nextDmSendTimestamp(): Date {
  const now = Date.now();
  lastDmSendMs = Math.max(now, lastDmSendMs + 1);
  return new Date(lastDmSendMs);
}

export function createClientSendId(): string {
  const bytes = Array.from({length: 16}, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function time(message: ChatMessage): number {
  const value = message.timestamp instanceof Date
    ? message.timestamp.getTime()
    : new Date(message.timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function dmEditMillis(message: {editedAt?: Date | null}): number {
  if (!message.editedAt) {
    return 0;
  }
  const value = message.editedAt instanceof Date
    ? message.editedAt.getTime()
    : new Date(message.editedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** Keeps a confirmed edit when a later snapshot or realtime payload is older. */
export function preserveConfirmedEdit<T extends {text: string; editedAt?: Date}>(
  current: T,
  incoming: T,
): T {
  if (dmEditMillis(current) > dmEditMillis(incoming)) {
    return {...incoming, text: current.text, editedAt: current.editedAt};
  }
  return incoming;
}

/** One row per server id and per client send id. Order stays chronological. */
export function mergeDmMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const previous = list.find(
    m =>
      m.id === incoming.id ||
      (!!incoming.clientSendId && m.clientSendId === incoming.clientSendId),
  );
  const rest = list.filter(
    m =>
      m.id !== incoming.id &&
      !(incoming.clientSendId && m.clientSendId === incoming.clientSendId) &&
      m !== previous,
  );
  const merged: ChatMessage = {
    ...previous,
    ...incoming,
    clientSendId: incoming.clientSendId ?? previous?.clientSendId,
    sendState: incoming.sendState,
  };
  return [...rest, merged].sort((a, b) => time(a) - time(b));
}

export function mergeServerPage(
  local: ChatMessage[],
  server: ChatMessage[],
): ChatMessage[] {
  const serverClientIds = new Set(
    server.map(m => m.clientSendId).filter((id): id is string => !!id),
  );
  const serverIds = new Set(server.map(m => m.id));
  const localById = new Map(local.map(m => [m.id, m]));
  const mergedServer = server.map(row => {
    const current = localById.get(row.id);
    return current ? preserveConfirmedEdit(current, row) : row;
  });
  const pending = local.filter(
    m =>
      (m.sendState === 'sending' || m.sendState === 'failed') &&
      !serverIds.has(m.id) &&
      !(m.clientSendId && serverClientIds.has(m.clientSendId)),
  );
  return [...mergedServer, ...pending].sort((a, b) => time(a) - time(b));
}

/** Fold a fresh page into the open chat without dropping older history. */
export function mergeLatestServerPage(
  local: ChatMessage[],
  server: ChatMessage[],
): ChatMessage[] {
  return server.reduce((list, row) => {
    const previous = list.find(
      message =>
        message.id === row.id ||
        (!!row.clientSendId && message.clientSendId === row.clientSendId),
    );
    const kept = previous ? preserveConfirmedEdit(previous, row) : row;
    return mergeDmMessage(list, {
      ...row,
      text: kept.text,
      editedAt: kept.editedAt,
      clientSendId: row.clientSendId ?? previous?.clientSendId,
    });
  }, local);
}

export function editUiStillOnOrigin(
  openChatId: string | null | undefined,
  editingId: string | null | undefined,
  originChatId: string,
  targetId: string,
): boolean {
  return openChatId === originChatId && editingId === targetId;
}
