/**
 * Messages presentation helpers — avoid duplicate “Messages” headings.
 */
export type MessagesPresentation = 'stack' | 'tab';

/**
 * Inline large title is redundant when the navigator already shows “Messages”.
 * Both stack (header button) and fallback-tab presentations use the nav header.
 */
export function shouldShowMessagesInlineTitle(
  _presentation: MessagesPresentation,
): boolean {
  return false;
}
