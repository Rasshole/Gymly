import {BADGE_DEFINITIONS, BADGE_BY_ID} from '@/config/badgeDefinitions';
import {
  computeBadgeProgress,
  evaluateNewUnlocks,
  getBadgeStatValue,
} from '@/services/badgeEngine';
import type {UserBadgeStats} from '@/types/badge.types';

const emptyStats = (): UserBadgeStats => ({
  total_training_time_minutes: 0,
  total_sessions: 0,
  current_streak_days: 0,
  longest_streak_days: 0,
  longest_session_minutes: 0,
  total_check_ins: 0,
  friends_trained_with_count: 0,
  unique_gyms_count: 0,
  total_messages_sent: 0,
  unique_dm_recipients: 0,
  planned_workouts_created: 0,
  planned_workouts_completed_valid: 0,
  early_check_ins: 0,
  late_check_ins: 0,
  total_logged_sets: 0,
  total_pr_events: 0,
});

describe('expanded badge catalog', () => {
  it('keeps all original badge IDs', () => {
    const legacy = [
      'streak_starter_3',
      'streak_disciplined_30',
      'streak_unstoppable_60',
      'streak_legendary_100',
      'checkin_first_1',
      'checkin_showing_5',
      'checkin_consistent_25',
      'checkin_always_100',
      'checkin_gymrat_300',
      'time_warmup_300',
      'time_grinder_10000',
      'time_elite_25000',
      'sessions_first_1',
      'sessions_routine_10',
      'sessions_habit_50',
      'sessions_addicted_100',
      'sessions_machine_250',
      'msg_first_1',
      'msg_active_unique_25',
      'social_partner_1',
      'social_squad_5',
      'social_community_15',
      'planned_planner_5',
      'habit_early_bird_5',
      'habit_night_grinder_5',
    ];
    expect(legacy).toHaveLength(25);
    for (const id of legacy) {
      expect(BADGE_BY_ID[id]).toBeDefined();
    }
  });

  it('expands to 54 badges with unique IDs', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(54);
    const ids = BADGE_DEFINITIONS.map(b => b.id);
    expect(new Set(ids).size).toBe(54);
  });

  it('orders streak badges easiest → hardest', () => {
    const streak = BADGE_DEFINITIONS.filter(b => b.category === 'streak');
    expect(streak.map(b => b.requirement_value)).toEqual([
      3, 7, 14, 30, 60, 100, 365,
    ]);
  });

  it('orders check-in badges easiest → hardest', () => {
    const checkins = BADGE_DEFINITIONS.filter(b => b.category === 'checkin');
    expect(checkins.map(b => b.requirement_value)).toEqual([
      1, 5, 25, 50, 100, 200, 300, 500,
    ]);
  });

  it('unlocks streak milestones retroactively from current streak', () => {
    const stats = {...emptyStats(), current_streak_days: 14};
    const unlocked = evaluateNewUnlocks(stats, new Set());
    const ids = unlocked.map(b => b.id);
    expect(ids).toContain('streak_starter_3');
    expect(ids).toContain('streak_locked_in_7');
    expect(ids).toContain('streak_no_excuses_14');
    expect(ids).not.toContain('streak_disciplined_30');
  });

  it('unlocks check-in milestones up to historical count', () => {
    const stats = {...emptyStats(), total_check_ins: 230};
    const unlocked = evaluateNewUnlocks(stats, new Set());
    const ids = unlocked.map(b => b.id);
    expect(ids).toContain('checkin_veteran_200');
    expect(ids).not.toContain('checkin_gymrat_300');
  });

  it('unlocks Workout Log set + PR badges from persisted stats', () => {
    const stats = {
      ...emptyStats(),
      total_logged_sets: 140,
      total_pr_events: 12,
    };
    const unlocked = evaluateNewUnlocks(stats, new Set());
    const ids = unlocked.map(b => b.id);
    expect(ids).toContain('strength_first_set_1');
    expect(ids).toContain('strength_century_100');
    expect(ids).toContain('strength_first_pr_1');
    expect(ids).toContain('strength_pr_machine_10');
    expect(ids).not.toContain('strength_record_breaker_50');
  });

  it('marks almost-there at ≥70% for new badges', () => {
    const def = BADGE_BY_ID.checkin_veteran_200;
    const progress = computeBadgeProgress(
      def,
      {...emptyStats(), total_check_ins: 140},
      false,
    );
    expect(progress.percent).toBe(70);
    expect(progress.status).toBe('almost_unlocked');
  });

  it('maps strength requirement types to stats', () => {
    const setDef = BADGE_BY_ID.strength_century_100;
    const prDef = BADGE_BY_ID.strength_pr_machine_10;
    const stats = {
      ...emptyStats(),
      total_logged_sets: 47,
      total_pr_events: 3,
    };
    expect(getBadgeStatValue(setDef, stats)).toBe(47);
    expect(getBadgeStatValue(prDef, stats)).toBe(3);
  });
});
