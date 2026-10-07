import fs from 'fs';
import path from 'path';
import {excludeBlockedIds} from '@/utils/userBlockFilter';

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('find people actions', () => {
  it('hides a blocked profile from a result list', () => {
    const rows = [
      {id: 'visible', name: 'Center QA Visible'},
      {id: 'blocked', name: 'Center QA Blocked'},
    ];
    expect(excludeBlockedIds(rows, new Set(['blocked']))).toEqual([
      {id: 'visible', name: 'Center QA Visible'},
    ]);
  });

  it('refuses a friend request when the pair is blocked and does not invent coach or creator actions', () => {
    const send = read('src/services/supabase/friendService.ts');
    const friends = read('src/screens/main/FriendsScreen.tsx');
    const add = read('src/screens/main/AddFriendScreen.tsx');
    expect(send).toMatch(/users_are_blocked/);
    expect(send).toMatch(/FriendActionUnavailableError/);
    expect(add).toMatch(/excludeBlockedIds/);
    expect(friends).not.toMatch(/coach|creator/i);
    expect(add).not.toMatch(/coach|creator/i);
  });
});
