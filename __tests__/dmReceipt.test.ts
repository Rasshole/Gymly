import {dmReceiptState, placeDmContextMenu} from '@/utils/dmReceipt';

describe('dm receipt state', () => {
  it('shows sent only after the server row exists', () => {
    expect(
      dmReceiptState({id: 'pending-1', sendState: 'sending'}),
    ).toBe('sending');
    expect(dmReceiptState({id: 'server-1'})).toBe('sent');
  });

  it('shows delivered and read only when those timestamps exist', () => {
    expect(
      dmReceiptState({id: 'server-1', deliveredAt: new Date('2026-10-01T12:00:00Z')}),
    ).toBe('delivered');
    expect(
      dmReceiptState({
        id: 'server-1',
        deliveredAt: new Date('2026-10-01T12:00:00Z'),
        readAt: new Date('2026-10-01T12:01:00Z'),
      }),
    ).toBe('read');
  });

  it('keeps a failed send on retry instead of calling it delivered', () => {
    expect(dmReceiptState({id: 'pending-1', sendState: 'failed'})).toBe('failed');
  });
});

describe('context menu placement', () => {
  const menu = {menuWidth: 220, menuHeight: 150};

  it('sits below the bubble when there is room', () => {
    const place = placeDmContextMenu({
      ...menu,
      anchor: {x: 40, y: 200, width: 180, height: 48},
      windowWidth: 390,
      windowHeight: 844,
      keyboardHeight: 0,
      alignEnd: false,
    });
    expect(place.top).toBeGreaterThan(248);
    expect(place.left).toBe(40);
  });

  it('moves above the bubble when the keyboard covers the space below', () => {
    const place = placeDmContextMenu({
      ...menu,
      anchor: {x: 160, y: 520, width: 180, height: 48},
      windowWidth: 390,
      windowHeight: 844,
      keyboardHeight: 320,
      alignEnd: true,
    });
    expect(place.top + menu.menuHeight).toBeLessThanOrEqual(520);
    expect(place.left + menu.menuWidth).toBeLessThanOrEqual(390 - 12);
  });

  it('stays on screen when the bubble is against the right edge', () => {
    const place = placeDmContextMenu({
      ...menu,
      anchor: {x: 300, y: 180, width: 80, height: 40},
      windowWidth: 390,
      windowHeight: 844,
      keyboardHeight: 0,
      alignEnd: true,
    });
    expect(place.left).toBeGreaterThanOrEqual(12);
    expect(place.left + menu.menuWidth).toBeLessThanOrEqual(378);
  });
});
