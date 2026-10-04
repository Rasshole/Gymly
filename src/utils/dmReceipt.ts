import type {ChatMessage} from '@/store/chatStore';

export type DmReceiptState = 'sending' | 'failed' | 'read' | 'delivered' | 'sent';

/** Latest outgoing row only. Each label requires that state to be confirmed. */
export function dmReceiptState(
  message: Pick<ChatMessage, 'id' | 'sendState' | 'readAt' | 'deliveredAt'>,
): DmReceiptState {
  if (message.sendState === 'failed') {
    return 'failed';
  }
  if (message.sendState === 'sending' || message.id.startsWith('pending-')) {
    return 'sending';
  }
  if (message.readAt) {
    return 'read';
  }
  if (message.deliveredAt) {
    return 'delivered';
  }
  return 'sent';
}

export type MenuRect = {x: number; y: number; width: number; height: number};

/** Places the compact menu beside the bubble, inside the visible screen. */
export function placeDmContextMenu(input: {
  anchor: MenuRect;
  menuWidth: number;
  menuHeight: number;
  windowWidth: number;
  windowHeight: number;
  keyboardHeight: number;
  alignEnd: boolean;
  margin?: number;
  gap?: number;
}): {top: number; left: number} {
  const margin = input.margin ?? 12;
  const gap = input.gap ?? 8;
  const {anchor, menuWidth, menuHeight, windowWidth, windowHeight, keyboardHeight, alignEnd} =
    input;
  const visibleBottom = windowHeight - Math.max(0, keyboardHeight) - margin;
  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - menuHeight - gap;
  const fitsBelow = below + menuHeight <= visibleBottom;
  const fitsAbove = above >= margin;
  let top = fitsBelow || !fitsAbove ? below : above;
  const coversBubble = top < anchor.y + anchor.height + gap && top + menuHeight > anchor.y - gap;
  if (coversBubble && fitsAbove && !fitsBelow) {
    top = above;
  }
  const maxTop = Math.max(margin, visibleBottom - menuHeight);
  top = Math.max(margin, Math.min(top, maxTop));
  let left = alignEnd ? anchor.x + anchor.width - menuWidth : anchor.x;
  const maxLeft = Math.max(margin, windowWidth - menuWidth - margin);
  left = Math.max(margin, Math.min(left, maxLeft));
  return {top, left};
}
