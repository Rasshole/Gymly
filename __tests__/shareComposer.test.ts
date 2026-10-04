import {shouldInsertWorkoutPost} from '@/utils/shareComposer';

describe('shouldInsertWorkoutPost', () => {
  it('creates one feed post for a friends audience', () => {
    expect(
      shouldInsertWorkoutPost({
        audience: 'friends',
        existingPostId: null,
        alreadySubmitted: false,
      }),
    ).toBe(true);
  });

  it('does not create a second post or a private post', () => {
    expect(
      shouldInsertWorkoutPost({
        audience: 'friends',
        existingPostId: 'post-1',
        alreadySubmitted: false,
      }),
    ).toBe(false);
    expect(
      shouldInsertWorkoutPost({
        audience: 'friends',
        existingPostId: null,
        alreadySubmitted: true,
      }),
    ).toBe(false);
    expect(
      shouldInsertWorkoutPost({
        audience: 'private',
        existingPostId: null,
        alreadySubmitted: false,
      }),
    ).toBe(false);
  });
});
