/**
 * @jest-environment node
 */
import {
  chronologicalFromNewestQuery,
  isNearLatestEdge,
  showChatDateSeparator,
  toNewestFirst,
} from '@/utils/chatThreadList';

const day = (iso: string) => new Date(iso);
const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

describe('chatThreadList', () => {
  it('puts the newest message at index 0 for an inverted list', () => {
    const chronological = [
      {id: 'old', timestamp: day('2026-09-11T10:00:00Z')},
      {id: 'mid', timestamp: day('2026-09-12T10:00:00Z')},
      {id: 'new', timestamp: day('2026-09-14T10:00:00Z')},
    ];
    expect(toNewestFirst(chronological).map(m => m.id)).toEqual(['new', 'mid', 'old']);
  });

  it('turns a newest-first query page back into chronological store order', () => {
    const page = [{id: 'new'}, {id: 'mid'}, {id: 'old'}];
    expect(chronologicalFromNewestQuery(page).map(m => m.id)).toEqual(['old', 'mid', 'new']);
  });

  it('keeps a date separator on the first message of each day in visual order', () => {
    const chronological = [
      {timestamp: day('2026-09-11T10:00:00Z')},
      {timestamp: day('2026-09-12T10:00:00Z')},
      {timestamp: day('2026-09-12T18:00:00Z')},
    ];
    const list = toNewestFirst(chronological);
    const flags = list.map((_, index) => showChatDateSeparator(list, index, sameDay));
    expect(flags).toEqual([false, true, true]);
  });

  it('treats a small offset as the latest edge and a history offset as not', () => {
    expect(isNearLatestEdge(0)).toBe(true);
    expect(isNearLatestEdge(40)).toBe(true);
    expect(isNearLatestEdge(400)).toBe(false);
  });
});
