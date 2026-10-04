/** Stable client error — never encode who blocked whom. */
export const FRIEND_ACTION_UNAVAILABLE = 'FRIEND_ACTION_UNAVAILABLE';

export class FriendActionUnavailableError extends Error {
  constructor() {
    super(FRIEND_ACTION_UNAVAILABLE);
    this.name = 'FriendActionUnavailableError';
  }
}

export function isFriendActionUnavailableError(error: unknown): boolean {
  if (error instanceof FriendActionUnavailableError) {
    return true;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as {message?: string}).message ?? '');
    return (
      msg.includes(FRIEND_ACTION_UNAVAILABLE) ||
      msg.includes('USERS_BLOCKED') ||
      msg.toLowerCase().includes('users_are_blocked')
    );
  }
  return false;
}

/** Backend not migrated yet (missing RPC/table) — do not treat as a successful block. */
export function isBlockBackendMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = String((error as {code?: string}).code ?? '');
  const msg = String((error as {message?: string}).message ?? '').toLowerCase();
  if (code === 'PGRST202' || code === '42883' || code === '42P01') {
    return (
      msg.includes('block_user') ||
      msg.includes('unblock_user') ||
      msg.includes('users_are_blocked') ||
      msg.includes('user_blocks')
    );
  }
  return (
    (msg.includes('block_user') ||
      msg.includes('unblock_user') ||
      msg.includes('user_blocks')) &&
    (msg.includes('could not find') ||
      msg.includes('does not exist') ||
      msg.includes('schema cache') ||
      msg.includes('not find the function'))
  );
}
