jest.mock('@/data/exerciseIllustrationAssets', () => ({
  ILLUSTRATION_ASSETS: {
    bench_press: 1,
    incline_bench_press: 2,
    chest_press: 3,
    cable_fly: 4,
    push_up: 5,
    lat_pulldown: 6,
    pull_up: 7,
    barbell_row: 8,
    seated_cable_row: 9,
    dumbbell_row: 10,
    squat: 11,
    leg_press: 12,
    romanian_deadlift: 13,
    leg_extension: 14,
    leg_curl: 15,
    calf_raise: 16,
    shoulder_press: 17,
    lateral_raise: 18,
    rear_delt_fly: 19,
    biceps_curl: 20,
    hammer_curl: 21,
    triceps_pushdown: 22,
    skull_crusher: 23,
    hip_thrust: 24,
    bulgarian_split_squat: 25,
    hip_abduction: 26,
    plank: 27,
    cable_crunch: 28,
    leg_raise: 29,
    running: 30,
    cycling: 31,
    stairmaster: 32,
    rowing: 33,
    decline_barbell_bench_press: 34,
    close_grip_bench_press: 35,
    dumbbell_bench_press: 36,
    incline_dumbbell_bench_press: 37,
    decline_dumbbell_bench_press: 38,
    dumbbell_fly: 39,
    incline_dumbbell_fly: 40,
    incline_chest_press_machine: 41,
    decline_chest_press_machine: 42,
    plate_loaded_chest_press: 43,
    smith_machine_bench_press: 44,
    smith_machine_incline_bench_press: 45,
    low_to_high_cable_fly: 46,
    high_to_low_cable_fly: 47,
    pec_deck: 48,
    weighted_push_up: 49,
    chest_dip: 50,
    chin_up: 51,
    neutral_grip_pull_up: 52,
    assisted_pull_up: 53,
    weighted_pull_up: 54,
    wide_grip_lat_pulldown: 55,
    close_grip_lat_pulldown: 56,
    neutral_grip_lat_pulldown: 57,
    single_arm_lat_pulldown: 58,
    straight_arm_pulldown: 59,
    wide_grip_seated_cable_row: 60,
    close_grip_seated_cable_row: 61,
    single_arm_cable_row: 62,
    pendlay_row: 63,
    t_bar_row: 64,
    chest_supported_t_bar_row: 65,
    single_arm_dumbbell_row: 66,
    chest_supported_dumbbell_row: 67,
    machine_row: 68,
    plate_loaded_row: 69,
    high_row_machine: 70,
    low_row_machine: 71,
    iso_lateral_row: 72,
    meadows_row: 73,
    rack_pull: 74,
    conventional_deadlift: 75,
    back_extension: 76,
    machine_back_extension: 77,
    dumbbell_pullover: 78,
    machine_pullover: 79,
    barbell_overhead_press: 80,
    seated_barbell_shoulder_press: 81,
    dumbbell_shoulder_press: 82,
    seated_dumbbell_shoulder_press: 83,
    arnold_press: 84,
    machine_shoulder_press: 85,
    smith_machine_shoulder_press: 86,
    cable_lateral_raise: 87,
    single_arm_cable_lateral_raise: 88,
    machine_lateral_raise: 89,
    dumbbell_front_raise: 90,
    cable_front_raise: 91,
    plate_front_raise: 92,
    reverse_pec_deck: 93,
    cable_rear_delt_fly: 94,
    face_pull: 95,
    upright_row: 96,
    dumbbell_upright_row: 97,
    barbell_curl: 98,
    ez_bar_curl: 99,
    dumbbell_curl: 100,
    alternating_dumbbell_curl: 101,
    cross_body_hammer_curl: 102,
    incline_dumbbell_curl: 103,
    preacher_curl: 104,
    ez_bar_preacher_curl: 105,
    dumbbell_preacher_curl: 106,
    machine_preacher_curl: 107,
    cable_curl: 108,
    straight_bar_cable_curl: 109,
    rope_hammer_curl: 110,
    bayesian_cable_curl: 111,
    concentration_curl: 112,
    spider_curl: 113,
    reverse_curl: 114,
    rope_tricep_pushdown: 115,
    straight_bar_tricep_pushdown: 116,
    v_bar_tricep_pushdown: 117,
    single_arm_tricep_pushdown: 118,
    reverse_grip_tricep_pushdown: 119,
    overhead_cable_tricep_extension: 120,
    rope_overhead_tricep_extension: 121,
    dumbbell_overhead_tricep_extension: 122,
    single_arm_dumbbell_tricep_extension: 123,
    ez_bar_skull_crusher: 124,
    dumbbell_skull_crusher: 125,
    lying_tricep_extension: 126,
    tricep_dip: 127,
    bench_dip: 128,
    tricep_extension_machine: 129,
    barbell_front_squat: 130,
    high_bar_squat: 131,
    low_bar_squat: 132,
    smith_machine_squat: 133,
    hack_squat: 134,
    pendulum_squat: 135,
    belt_squat: 136,
    goblet_squat: 137,
    '45_degree_leg_press': 138,
    horizontal_leg_press: 139,
    single_leg_press: 140,
    single_leg_extension: 141,
    dumbbell_bulgarian_split_squat: 142,
    smith_machine_bulgarian_split_squat: 143,
    walking_lunge: 144,
    dumbbell_walking_lunge: 145,
    reverse_lunge: 146,
    forward_lunge: 147,
    smith_machine_lunge: 148,
    step_up: 149,
    dumbbell_step_up: 150,
    sissy_squat: 151,
    barbell_romanian_deadlift: 152,
    dumbbell_romanian_deadlift: 153,
    smith_machine_romanian_deadlift: 154,
    stiff_leg_deadlift: 155,
    seated_leg_curl: 156,
    lying_leg_curl: 157,
    standing_leg_curl: 158,
    single_leg_curl: 159,
    nordic_hamstring_curl: 160,
    good_morning: 161,
    barbell_good_morning: 162,
    cable_pull_through: 163,
    glute_ham_raise: 164,
    single_leg_romanian_deadlift: 165,
    dumbbell_single_leg_romanian_deadlift: 166,
    smith_machine_hip_thrust: 167,
    machine_hip_thrust: 168,
    dumbbell_hip_thrust: 169,
    glute_bridge: 170,
    barbell_glute_bridge: 171,
    cable_kickback: 172,
    machine_glute_kickback: 173,
    cable_hip_abduction: 174,
    standing_hip_abduction: 175,
    frog_pump: 176,
    sumo_squat: 177,
    sumo_deadlift: 178,
    standing_calf_raise: 179,
    seated_calf_raise: 180,
    machine_standing_calf_raise: 181,
    machine_seated_calf_raise: 182,
    leg_press_calf_raise: 183,
    smith_machine_calf_raise: 184,
    single_leg_calf_raise: 185,
    donkey_calf_raise: 186,
    machine_crunch: 187,
    ab_crunch: 188,
    weighted_crunch: 189,
    sit_up: 190,
    weighted_sit_up: 191,
    decline_sit_up: 192,
    hanging_leg_raise: 193,
    hanging_knee_raise: 194,
    captains_chair_leg_raise: 195,
    reverse_crunch: 196,
    ab_wheel_rollout: 197,
    weighted_plank: 198,
    side_plank: 199,
    russian_twist: 200,
    cable_woodchop: 201,
    pallof_press: 202,
    bicycle_crunch: 203,
    dead_bug: 204,
    v_up: 205,
    toe_touch: 206,
    clean: 207,
    power_clean: 208,
    clean_and_jerk: 209,
    snatch: 210,
    dumbbell_thruster: 211,
    barbell_thruster: 212,
    kettlebell_swing: 213,
    farmers_walk: 214,
    dumbbell_farmers_walk: 215,
    kettlebell_farmers_walk: 216,
    burpee: 217,
    treadmill_walking: 218,
    outdoor_walking: 219,
    assault_bike: 220,
    spinning_bike: 221,
    elliptical: 222,
    skierg: 223,
    swimming: 224,
    jump_rope: 225,
  },
}));

import {
  EXERCISE_ID_TO_ASSET_KEY,
  ILLUSTRATION_ASSETS,
  getExerciseIllustrationSource,
  getAssetKeyForExercise,
} from '@/data/exerciseIllustrations';
import {EXERCISE_LIBRARY} from '@/data/exerciseLibrary';

describe('exercise illustrations full 225 set', () => {
  it('registers 225 bundled assets', () => {
    expect(Object.keys(ILLUSTRATION_ASSETS)).toHaveLength(225);
  });

  it('maps all 225 library exercise IDs', () => {
    expect(Object.keys(EXERCISE_ID_TO_ASSET_KEY)).toHaveLength(225);
    for (const exercise of EXERCISE_LIBRARY) {
      const key = getAssetKeyForExercise({id: exercise.id, name: exercise.name});
      expect(key).toBeTruthy();
      expect(key && ILLUSTRATION_ASSETS[key]).toBeTruthy();
      expect(getExerciseIllustrationSource({id: exercise.id, name: exercise.name})).toBeTruthy();
    }
  });

  it('only maps asset keys that have bundled modules', () => {
    for (const assetKey of Object.values(EXERCISE_ID_TO_ASSET_KEY)) {
      expect(ILLUSTRATION_ASSETS[assetKey]).toBeDefined();
    }
  });

  it('resolves by exact name when id is a server UUID', () => {
    expect(
      getAssetKeyForExercise({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Incline Dumbbell Bench Press',
      }),
    ).toBe('incline_dumbbell_bench_press');
  });

  it('does not register reference-only assets', () => {
    expect(ILLUSTRATION_ASSETS).not.toHaveProperty('cable_crossover_reference');
    expect(ILLUSTRATION_ASSETS).not.toHaveProperty('incline_cable_fly_reference');
  });

  it('uses dedicated filenames from production mapping CSV', () => {
    expect(getAssetKeyForExercise({id: 'ex-bench-press', name: 'Bench Press'})).toBe('bench_press');
    expect(getAssetKeyForExercise({id: 'ex-incline-dumbbell-bench-press', name: 'Incline Dumbbell Bench Press'})).toBe('incline_dumbbell_bench_press');
    expect(getAssetKeyForExercise({id: 'ex-push-up', name: 'Push-Up'})).toBe('push_up');
    expect(getAssetKeyForExercise({id: 'ex-squat', name: 'Squat'})).toBe('squat');
    expect(getAssetKeyForExercise({id: 'ex-hack-squat', name: 'Hack Squat'})).toBe('hack_squat');
    expect(getAssetKeyForExercise({id: 'ex-45-degree-leg-press', name: '45 Degree Leg Press'})).toBe('45_degree_leg_press');
    expect(getAssetKeyForExercise({id: 'ex-face-pull', name: 'Face Pull'})).toBe('face_pull');
    expect(getAssetKeyForExercise({id: 'ex-burpee', name: 'Burpee'})).toBe('burpee');
    expect(getAssetKeyForExercise({id: 'ex-jump-rope', name: 'Jump Rope'})).toBe('jump_rope');
  });

  it('does not invent illustrations for unknown exercises', () => {
    expect(
      getExerciseIllustrationSource({
        id: 'ex-not-in-library',
        name: 'Totally Fake Exercise',
      }),
    ).toBeNull();
  });
});
