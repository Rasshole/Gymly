/**
 * Gymly exercise illustrations — ID → asset_key registry.
 *
 * Full library coverage (225 exercises). Source mapping:
 * exercise_image_mapping.csv from Claude production pack.
 *
 * Future updates:
 * 1. Drop `.webp` into `src/assets/images/exerciseIllustrations/`
 * 2. Register `require` in `exerciseIllustrationAssets.ts`
 * 3. Map exercise seed IDs here (only when the asset file exists)
 *
 * Never map `*_reference.webp` files.
 */

import type {ImageSourcePropType} from 'react-native';
import {EXERCISE_LIBRARY} from '@/data/exerciseLibrary';
import {ILLUSTRATION_ASSETS} from '@/data/exerciseIllustrationAssets';

export {ILLUSTRATION_ASSETS};

/**
 * Stable local seed exercise_id → asset_key.
 * One dedicated asset per exercise (full 225 set).
 */
export const EXERCISE_ID_TO_ASSET_KEY: Record<string, string> = {
  'ex-bench-press': 'bench_press',
  'ex-incline-bench': 'incline_bench_press',
  'ex-chest-press': 'chest_press',
  'ex-cable-fly': 'cable_fly',
  'ex-push-up': 'push_up',
  'ex-lat-pulldown': 'lat_pulldown',
  'ex-pull-up': 'pull_up',
  'ex-barbell-row': 'barbell_row',
  'ex-seated-row': 'seated_cable_row',
  'ex-db-row': 'dumbbell_row',
  'ex-squat': 'squat',
  'ex-leg-press': 'leg_press',
  'ex-rdl': 'romanian_deadlift',
  'ex-leg-ext': 'leg_extension',
  'ex-leg-curl': 'leg_curl',
  'ex-calf': 'calf_raise',
  'ex-shoulder-press': 'shoulder_press',
  'ex-lateral-raise': 'lateral_raise',
  'ex-rear-delt': 'rear_delt_fly',
  'ex-biceps-curl': 'biceps_curl',
  'ex-hammer-curl': 'hammer_curl',
  'ex-triceps-pushdown': 'triceps_pushdown',
  'ex-skull-crusher': 'skull_crusher',
  'ex-hip-thrust': 'hip_thrust',
  'ex-bulgarian': 'bulgarian_split_squat',
  'ex-hip-abd': 'hip_abduction',
  'ex-plank': 'plank',
  'ex-cable-crunch': 'cable_crunch',
  'ex-leg-raise': 'leg_raise',
  'ex-running': 'running',
  'ex-cycling': 'cycling',
  'ex-stairmaster': 'stairmaster',
  'ex-rowing': 'rowing',
  'ex-decline-barbell-bench-press': 'decline_barbell_bench_press',
  'ex-close-grip-bench-press': 'close_grip_bench_press',
  'ex-dumbbell-bench-press': 'dumbbell_bench_press',
  'ex-incline-dumbbell-bench-press': 'incline_dumbbell_bench_press',
  'ex-decline-dumbbell-bench-press': 'decline_dumbbell_bench_press',
  'ex-dumbbell-fly': 'dumbbell_fly',
  'ex-incline-dumbbell-fly': 'incline_dumbbell_fly',
  'ex-incline-chest-press-machine': 'incline_chest_press_machine',
  'ex-decline-chest-press-machine': 'decline_chest_press_machine',
  'ex-plate-loaded-chest-press': 'plate_loaded_chest_press',
  'ex-smith-machine-bench-press': 'smith_machine_bench_press',
  'ex-smith-machine-incline-bench-press': 'smith_machine_incline_bench_press',
  'ex-low-to-high-cable-fly': 'low_to_high_cable_fly',
  'ex-high-to-low-cable-fly': 'high_to_low_cable_fly',
  'ex-pec-deck': 'pec_deck',
  'ex-weighted-push-up': 'weighted_push_up',
  'ex-chest-dip': 'chest_dip',
  'ex-chin-up': 'chin_up',
  'ex-neutral-grip-pull-up': 'neutral_grip_pull_up',
  'ex-assisted-pull-up': 'assisted_pull_up',
  'ex-weighted-pull-up': 'weighted_pull_up',
  'ex-wide-grip-lat-pulldown': 'wide_grip_lat_pulldown',
  'ex-close-grip-lat-pulldown': 'close_grip_lat_pulldown',
  'ex-neutral-grip-lat-pulldown': 'neutral_grip_lat_pulldown',
  'ex-single-arm-lat-pulldown': 'single_arm_lat_pulldown',
  'ex-straight-arm-pulldown': 'straight_arm_pulldown',
  'ex-wide-grip-seated-cable-row': 'wide_grip_seated_cable_row',
  'ex-close-grip-seated-cable-row': 'close_grip_seated_cable_row',
  'ex-single-arm-cable-row': 'single_arm_cable_row',
  'ex-pendlay-row': 'pendlay_row',
  'ex-t-bar-row': 't_bar_row',
  'ex-chest-supported-t-bar-row': 'chest_supported_t_bar_row',
  'ex-single-arm-dumbbell-row': 'single_arm_dumbbell_row',
  'ex-chest-supported-dumbbell-row': 'chest_supported_dumbbell_row',
  'ex-machine-row': 'machine_row',
  'ex-plate-loaded-row': 'plate_loaded_row',
  'ex-high-row-machine': 'high_row_machine',
  'ex-low-row-machine': 'low_row_machine',
  'ex-iso-lateral-row': 'iso_lateral_row',
  'ex-meadows-row': 'meadows_row',
  'ex-rack-pull': 'rack_pull',
  'ex-conventional-deadlift': 'conventional_deadlift',
  'ex-back-extension': 'back_extension',
  'ex-machine-back-extension': 'machine_back_extension',
  'ex-dumbbell-pullover': 'dumbbell_pullover',
  'ex-machine-pullover': 'machine_pullover',
  'ex-barbell-overhead-press': 'barbell_overhead_press',
  'ex-seated-barbell-shoulder-press': 'seated_barbell_shoulder_press',
  'ex-dumbbell-shoulder-press': 'dumbbell_shoulder_press',
  'ex-seated-dumbbell-shoulder-press': 'seated_dumbbell_shoulder_press',
  'ex-arnold-press': 'arnold_press',
  'ex-machine-shoulder-press': 'machine_shoulder_press',
  'ex-smith-machine-shoulder-press': 'smith_machine_shoulder_press',
  'ex-cable-lateral-raise': 'cable_lateral_raise',
  'ex-single-arm-cable-lateral-raise': 'single_arm_cable_lateral_raise',
  'ex-machine-lateral-raise': 'machine_lateral_raise',
  'ex-dumbbell-front-raise': 'dumbbell_front_raise',
  'ex-cable-front-raise': 'cable_front_raise',
  'ex-plate-front-raise': 'plate_front_raise',
  'ex-reverse-pec-deck': 'reverse_pec_deck',
  'ex-cable-rear-delt-fly': 'cable_rear_delt_fly',
  'ex-face-pull': 'face_pull',
  'ex-upright-row': 'upright_row',
  'ex-dumbbell-upright-row': 'dumbbell_upright_row',
  'ex-barbell-curl': 'barbell_curl',
  'ex-ez-bar-curl': 'ez_bar_curl',
  'ex-dumbbell-curl': 'dumbbell_curl',
  'ex-alternating-dumbbell-curl': 'alternating_dumbbell_curl',
  'ex-cross-body-hammer-curl': 'cross_body_hammer_curl',
  'ex-incline-dumbbell-curl': 'incline_dumbbell_curl',
  'ex-preacher-curl': 'preacher_curl',
  'ex-ez-bar-preacher-curl': 'ez_bar_preacher_curl',
  'ex-dumbbell-preacher-curl': 'dumbbell_preacher_curl',
  'ex-machine-preacher-curl': 'machine_preacher_curl',
  'ex-cable-curl': 'cable_curl',
  'ex-straight-bar-cable-curl': 'straight_bar_cable_curl',
  'ex-rope-hammer-curl': 'rope_hammer_curl',
  'ex-bayesian-cable-curl': 'bayesian_cable_curl',
  'ex-concentration-curl': 'concentration_curl',
  'ex-spider-curl': 'spider_curl',
  'ex-reverse-curl': 'reverse_curl',
  'ex-rope-tricep-pushdown': 'rope_tricep_pushdown',
  'ex-straight-bar-tricep-pushdown': 'straight_bar_tricep_pushdown',
  'ex-v-bar-tricep-pushdown': 'v_bar_tricep_pushdown',
  'ex-single-arm-tricep-pushdown': 'single_arm_tricep_pushdown',
  'ex-reverse-grip-tricep-pushdown': 'reverse_grip_tricep_pushdown',
  'ex-overhead-cable-tricep-extension': 'overhead_cable_tricep_extension',
  'ex-rope-overhead-tricep-extension': 'rope_overhead_tricep_extension',
  'ex-dumbbell-overhead-tricep-extension': 'dumbbell_overhead_tricep_extension',
  'ex-single-arm-dumbbell-tricep-extension': 'single_arm_dumbbell_tricep_extension',
  'ex-ez-bar-skull-crusher': 'ez_bar_skull_crusher',
  'ex-dumbbell-skull-crusher': 'dumbbell_skull_crusher',
  'ex-lying-tricep-extension': 'lying_tricep_extension',
  'ex-tricep-dip': 'tricep_dip',
  'ex-bench-dip': 'bench_dip',
  'ex-tricep-extension-machine': 'tricep_extension_machine',
  'ex-barbell-front-squat': 'barbell_front_squat',
  'ex-high-bar-squat': 'high_bar_squat',
  'ex-low-bar-squat': 'low_bar_squat',
  'ex-smith-machine-squat': 'smith_machine_squat',
  'ex-hack-squat': 'hack_squat',
  'ex-pendulum-squat': 'pendulum_squat',
  'ex-belt-squat': 'belt_squat',
  'ex-goblet-squat': 'goblet_squat',
  'ex-45-degree-leg-press': '45_degree_leg_press',
  'ex-horizontal-leg-press': 'horizontal_leg_press',
  'ex-single-leg-press': 'single_leg_press',
  'ex-single-leg-extension': 'single_leg_extension',
  'ex-dumbbell-bulgarian-split-squat': 'dumbbell_bulgarian_split_squat',
  'ex-smith-machine-bulgarian-split-squat': 'smith_machine_bulgarian_split_squat',
  'ex-walking-lunge': 'walking_lunge',
  'ex-dumbbell-walking-lunge': 'dumbbell_walking_lunge',
  'ex-reverse-lunge': 'reverse_lunge',
  'ex-forward-lunge': 'forward_lunge',
  'ex-smith-machine-lunge': 'smith_machine_lunge',
  'ex-step-up': 'step_up',
  'ex-dumbbell-step-up': 'dumbbell_step_up',
  'ex-sissy-squat': 'sissy_squat',
  'ex-barbell-romanian-deadlift': 'barbell_romanian_deadlift',
  'ex-dumbbell-romanian-deadlift': 'dumbbell_romanian_deadlift',
  'ex-smith-machine-romanian-deadlift': 'smith_machine_romanian_deadlift',
  'ex-stiff-leg-deadlift': 'stiff_leg_deadlift',
  'ex-seated-leg-curl': 'seated_leg_curl',
  'ex-lying-leg-curl': 'lying_leg_curl',
  'ex-standing-leg-curl': 'standing_leg_curl',
  'ex-single-leg-curl': 'single_leg_curl',
  'ex-nordic-hamstring-curl': 'nordic_hamstring_curl',
  'ex-good-morning': 'good_morning',
  'ex-barbell-good-morning': 'barbell_good_morning',
  'ex-cable-pull-through': 'cable_pull_through',
  'ex-glute-ham-raise': 'glute_ham_raise',
  'ex-single-leg-romanian-deadlift': 'single_leg_romanian_deadlift',
  'ex-dumbbell-single-leg-romanian-deadlift': 'dumbbell_single_leg_romanian_deadlift',
  'ex-smith-machine-hip-thrust': 'smith_machine_hip_thrust',
  'ex-machine-hip-thrust': 'machine_hip_thrust',
  'ex-dumbbell-hip-thrust': 'dumbbell_hip_thrust',
  'ex-glute-bridge': 'glute_bridge',
  'ex-barbell-glute-bridge': 'barbell_glute_bridge',
  'ex-cable-kickback': 'cable_kickback',
  'ex-machine-glute-kickback': 'machine_glute_kickback',
  'ex-cable-hip-abduction': 'cable_hip_abduction',
  'ex-standing-hip-abduction': 'standing_hip_abduction',
  'ex-frog-pump': 'frog_pump',
  'ex-sumo-squat': 'sumo_squat',
  'ex-sumo-deadlift': 'sumo_deadlift',
  'ex-standing-calf-raise': 'standing_calf_raise',
  'ex-seated-calf-raise': 'seated_calf_raise',
  'ex-machine-standing-calf-raise': 'machine_standing_calf_raise',
  'ex-machine-seated-calf-raise': 'machine_seated_calf_raise',
  'ex-leg-press-calf-raise': 'leg_press_calf_raise',
  'ex-smith-machine-calf-raise': 'smith_machine_calf_raise',
  'ex-single-leg-calf-raise': 'single_leg_calf_raise',
  'ex-donkey-calf-raise': 'donkey_calf_raise',
  'ex-machine-crunch': 'machine_crunch',
  'ex-ab-crunch': 'ab_crunch',
  'ex-weighted-crunch': 'weighted_crunch',
  'ex-sit-up': 'sit_up',
  'ex-weighted-sit-up': 'weighted_sit_up',
  'ex-decline-sit-up': 'decline_sit_up',
  'ex-hanging-leg-raise': 'hanging_leg_raise',
  'ex-hanging-knee-raise': 'hanging_knee_raise',
  'ex-captain-s-chair-leg-raise': 'captains_chair_leg_raise',
  'ex-reverse-crunch': 'reverse_crunch',
  'ex-ab-wheel-rollout': 'ab_wheel_rollout',
  'ex-weighted-plank': 'weighted_plank',
  'ex-side-plank': 'side_plank',
  'ex-russian-twist': 'russian_twist',
  'ex-cable-woodchop': 'cable_woodchop',
  'ex-pallof-press': 'pallof_press',
  'ex-bicycle-crunch': 'bicycle_crunch',
  'ex-dead-bug': 'dead_bug',
  'ex-v-up': 'v_up',
  'ex-toe-touch': 'toe_touch',
  'ex-clean': 'clean',
  'ex-power-clean': 'power_clean',
  'ex-clean-and-jerk': 'clean_and_jerk',
  'ex-snatch': 'snatch',
  'ex-dumbbell-thruster': 'dumbbell_thruster',
  'ex-barbell-thruster': 'barbell_thruster',
  'ex-kettlebell-swing': 'kettlebell_swing',
  'ex-farmer-s-walk': 'farmers_walk',
  'ex-dumbbell-farmer-s-walk': 'dumbbell_farmers_walk',
  'ex-kettlebell-farmer-s-walk': 'kettlebell_farmers_walk',
  'ex-burpee': 'burpee',
  'ex-treadmill-walking': 'treadmill_walking',
  'ex-outdoor-walking': 'outdoor_walking',
  'ex-assault-bike': 'assault_bike',
  'ex-spinning-bike': 'spinning_bike',
  'ex-elliptical': 'elliptical',
  'ex-skierg': 'skierg',
  'ex-swimming': 'swimming',
  'ex-jump-rope': 'jump_rope',
};

/** Exact exercise name → asset_key (for server UUID id overlay). */
const EXERCISE_NAME_TO_ASSET_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, assetKey] of Object.entries(EXERCISE_ID_TO_ASSET_KEY)) {
    const item = EXERCISE_LIBRARY.find(e => e.id === id);
    if (item) {
      out[item.name.trim().toLowerCase()] = assetKey;
    }
  }
  return out;
})();

export function getAssetKeyForExercise(params: {
  id: string;
  name: string;
}): string | null {
  const byId = EXERCISE_ID_TO_ASSET_KEY[params.id];
  if (byId && ILLUSTRATION_ASSETS[byId]) {
    return byId;
  }
  const byName =
    EXERCISE_NAME_TO_ASSET_KEY[params.name.trim().toLowerCase()];
  if (byName && ILLUSTRATION_ASSETS[byName]) {
    return byName;
  }
  return null;
}

export function getExerciseIllustrationSource(params: {
  id: string;
  name: string;
}): ImageSourcePropType | null {
  const key = getAssetKeyForExercise(params);
  if (!key) {
    return null;
  }
  return ILLUSTRATION_ASSETS[key] ?? null;
}

export function hasExerciseIllustration(params: {
  id: string;
  name: string;
}): boolean {
  return getExerciseIllustrationSource(params) != null;
}
