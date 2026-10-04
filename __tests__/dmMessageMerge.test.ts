import fs from 'fs';
import path from 'path';
import type {ChatMessage} from '@/store/chatStore';
import {
  editUiStillOnOrigin,
  mergeDmMessage,
  mergeLatestServerPage,
  mergeServerPage,
  nextDmSendTimestamp,
  preserveConfirmedEdit,
} from '@/utils/dmMessageMerge';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'text'>): ChatMessage {
  return {
    senderId: 'me',
    timestamp: new Date('2026-10-01T12:00:00.000Z'),
    isRead: false,
    ...partial,
  };
}

describe('dm message identity', () => {
  it('collapses the local row and the realtime row into one message', () => {
    const local = msg({
      id: 'pending-1',
      text: 'Hej',
      clientSendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sendState: 'sending',
    });
    const saved = msg({
      id: 'server-1',
      text: 'Hej',
      clientSendId: local.clientSendId,
      timestamp: new Date('2026-10-01T12:00:01.000Z'),
    });
    const once = mergeDmMessage([local], saved);
    const twice = mergeDmMessage(once, saved);
    expect(once.map(m => m.id)).toEqual(['server-1']);
    expect(twice).toHaveLength(1);
    expect(twice[0].sendState).toBeUndefined();
  });

  it('keeps two intentional messages with the same text', () => {
    const first = msg({
      id: 'a',
      text: 'Hej',
      clientSendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      timestamp: new Date('2026-10-01T12:00:00.000Z'),
    });
    const second = msg({
      id: 'b',
      text: 'Hej',
      clientSendId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      timestamp: new Date('2026-10-01T12:00:02.000Z'),
    });
    expect(mergeDmMessage([first], second).map(m => m.id)).toEqual(['a', 'b']);
  });

  it('keeps a failed send and replaces it on retry with the same identity', () => {
    const failed = msg({
      id: 'pending-1',
      text: 'Hej',
      clientSendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sendState: 'failed',
    });
    const page = mergeServerPage([failed], []);
    expect(page).toHaveLength(1);
    expect(page[0].sendState).toBe('failed');

    const saved = msg({
      id: 'server-1',
      text: 'Hej',
      clientSendId: failed.clientSendId,
    });
    expect(mergeDmMessage(page, saved)).toHaveLength(1);
    expect(mergeServerPage(page, [saved])).toHaveLength(1);
  });

  it('keeps send order when several messages are created in the same millisecond', async () => {
    const start = performance.now();
    let list: ChatMessage[] = [];
    for (let i = 0; i < 8; i += 1) {
      list = mergeDmMessage(
        list,
        msg({
          id: `pending-${i}`,
          text: `m${i}`,
          clientSendId: `00000000-0000-4000-8000-00000000000${i}`,
          timestamp: nextDmSendTimestamp(),
          sendState: 'sending',
        }),
      );
    }
    const elapsed = performance.now() - start;
    const legacyStart = performance.now();
    for (let i = 0; i < 3; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const legacyElapsed = performance.now() - legacyStart;
    // Jest timings on this machine. The legacy figure is a model of the old
    // path that waited for three network inserts before the next row appeared.
    // Neither number is iOS simulator or release-build performance.
    console.log(`[dm-measure] optimistic local commit for 8 messages: ${elapsed.toFixed(2)} ms`);
    console.log(`[dm-measure] model of previous await-before-paint, 3 x 40 ms: ${legacyElapsed.toFixed(2)} ms`);
    expect(list.map(m => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
    expect(elapsed).toBeLessThan(30);
  });

  it('keeps a confirmed edit when a later page or realtime payload is older', () => {
    const current = msg({
      id: 'server-1',
      text: 'Ny tekst',
      editedAt: new Date('2026-10-02T10:00:00.000Z'),
    });
    const stale = msg({
      id: 'server-1',
      text: 'Gammel tekst',
      readAt: new Date('2026-10-02T10:00:05.000Z'),
    });
    const kept = preserveConfirmedEdit(current, stale);
    expect(kept.text).toBe('Ny tekst');
    expect(kept.editedAt).toEqual(current.editedAt);
    expect(kept.readAt).toEqual(stale.readAt);

    const page = mergeServerPage([current], [stale]);
    expect(page).toHaveLength(1);
    expect(page[0].text).toBe('Ny tekst');
    expect(page[0].editedAt).toEqual(current.editedAt);
  });

  it('applies a newer edit without dropping older history or a confirmed local edit', () => {
    const older = msg({id: 'old', text: 'Historik', timestamp: new Date('2026-10-02T08:00:00.000Z')});
    const current = msg({
      id: 'server-1',
      text: 'Ny tekst',
      editedAt: new Date('2026-10-02T10:00:00.000Z'),
      timestamp: new Date('2026-10-02T09:00:00.000Z'),
    });
    const stalePage = [
      msg({
        id: 'server-1',
        text: 'Gammel tekst',
        timestamp: new Date('2026-10-02T09:00:00.000Z'),
      }),
    ];
    const kept = mergeLatestServerPage([older, current], stalePage);
    expect(kept.map(m => m.id)).toEqual(['old', 'server-1']);
    expect(kept[1].text).toBe('Ny tekst');

    const fresh = mergeLatestServerPage(kept, [
      msg({
        id: 'server-1',
        text: 'Fra server',
        editedAt: new Date('2026-10-02T10:05:00.000Z'),
        timestamp: new Date('2026-10-02T09:00:00.000Z'),
      }),
    ]);
    expect(fresh).toHaveLength(2);
    expect(fresh[1].text).toBe('Fra server');
    expect(fresh[1].timestamp).toEqual(current.timestamp);
  });

  it('only closes the editor when the save still belongs to the open chat', () => {
    expect(editUiStillOnOrigin('chat-a', 'm1', 'chat-a', 'm1')).toBe(true);
    expect(editUiStillOnOrigin('chat-b', null, 'chat-a', 'm1')).toBe(false);
  });

  it('locks edit and reaction access in the database migration', () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        '../supabase/migrations/20261001120000_dm_message_identity_edit_reactions.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/dm_messages_sender_client_send_uidx/);
    expect(sql).toMatch(/sender_id <> v_uid/);
    expect(sql).toMatch(/not a member/);
    expect(sql).toMatch(/reply outside thread/);
    expect(sql).toMatch(/p_emoji not in \('💪', '❤️', '😂', '🔥', '👍'\)/);
  });
});
