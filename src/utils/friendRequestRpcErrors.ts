/** Fejl fra `accept_friend_request` / Supabase RPC (tekst i message) */

export function getSupabaseRpcErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as {message: unknown}).message);
  }
  if (e instanceof Error) {
    return e.message;
  }
  return '';
}

/** Anmodning findes ikke længere som pending (allerede accepteret/afvist/slettet) */
export function isFriendRequestStaleError(message: string): boolean {
  return (
    message.includes('FRIEND_REQUEST_NOT_PENDING') ||
    message.includes('FRIEND_REQUEST_NOT_FOUND')
  );
}

export function isFriendRequestNotRecipientError(message: string): boolean {
  return message.includes('FRIEND_REQUEST_NOT_RECIPIENT');
}
