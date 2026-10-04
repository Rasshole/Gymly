import {
  FRIEND_SEARCH_MIN_CHARS,
  filterCommittedSearchGenerations,
  planFriendSearch,
  shouldClearResultsOnSearchError,
} from '@/utils/friendSearchPlan';
import {
  bumpSearchGeneration,
  shouldCommitSearchResults,
} from '@/utils/userBlockFilter';

describe('friendSearchPlan', () => {
  it('clears when query is below min chars', () => {
    expect(planFriendSearch('k', null)).toEqual({action: 'clear'});
    expect(planFriendSearch('', 'ka')).toEqual({action: 'clear'});
  });

  it('schedules when query is new', () => {
    expect(planFriendSearch('ka', null)).toEqual({
      action: 'schedule',
      query: 'ka',
    });
    expect(planFriendSearch('kas', 'ka')).toEqual({
      action: 'schedule',
      query: 'kas',
    });
  });

  it('noops when unchanged query would otherwise re-render', () => {
    expect(planFriendSearch('ka', 'ka')).toEqual({action: 'noop'});
    expect(
      planFriendSearch('ka', 'ka', FRIEND_SEARCH_MIN_CHARS),
    ).toEqual({action: 'noop'});
  });

  it('does not clear results on search error', () => {
    expect(shouldClearResultsOnSearchError()).toBe(false);
  });

  it('ignores out-of-order completed generations', () => {
    let gen = 0;
    const first = ++gen;
    const second = ++gen;
    expect(shouldCommitSearchResults(first, gen)).toBe(false);
    expect(shouldCommitSearchResults(second, gen)).toBe(true);
    expect(filterCommittedSearchGenerations([first, second], gen)).toEqual([
      second,
    ]);
  });

  it('clear + bump invalidates in-flight after field cleared', () => {
    let gen = 1;
    const inFlight = gen;
    const plan = planFriendSearch('', 'ka');
    expect(plan.action).toBe('clear');
    gen = bumpSearchGeneration(gen);
    expect(shouldCommitSearchResults(inFlight, gen)).toBe(false);
  });
});
