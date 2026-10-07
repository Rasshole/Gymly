import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20261006010000_profile_follows.sql'),
  'utf8',
);
const friends = fs.readFileSync(
  path.join(__dirname, '../src/screens/main/FriendsScreen.tsx'),
  'utf8',
);
const profile = fs.readFileSync(
  path.join(__dirname, '../src/screens/main/FriendProfileScreen.tsx'),
  'utf8',
);

describe('profile follows', () => {
  it('keeps follows one-way, private, and blocked in both directions', () => {
    expect(sql).toMatch(/constraint profile_follows_no_self check \(follower_id <> followed_id\)/);
    expect(sql).toMatch(/primary key \(follower_id, followed_id\)/);
    expect(sql).toMatch(/on conflict \(follower_id, followed_id\) do nothing/);
    expect(sql).toMatch(/users_are_blocked\(me, p_followed\)/);
    expect(sql).toMatch(/follower_id = auth\.uid\(\)/);
    expect(sql).not.toMatch(/follower_count|following_count|count\(\*\)/i);
    expect(sql).toMatch(/profile_follows_clear_on_block/);
  });

  it('shows follow state on search and profile without a public follower count', () => {
    expect(friends).toMatch(/person-follow-/);
    expect(friends).toMatch(/friendsScreen\.following/);
    expect(profile).toMatch(/testID="profile-follow"/);
    expect(profile).not.toMatch(/key: 'followers'|key: 'following'/);
    expect(friends).not.toMatch(/followersCount|followingCount/);
  });
});
