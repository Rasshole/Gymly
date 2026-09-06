# Gymly Workout Log — Final Exercise Illustration Audit

_Audit only. No code, mappings, or assets were modified._

Generated from current codebase state (exercise library + illustration registry + asset directory).

## Executive Summary

- **Total exercises:** 225
- **Correct illustrations:** 82
- **Fallback:** 143
- **Wrong mappings:** 0
- **Suspicious duplicate mappings (primary status):** 0
- **Missing referenced assets:** 0
- **Unused bundled WebP assets:** 0 (all 68 registered WebPs are mapped)
- **Unknown/review required:** 0 primary; see SAFE_REUSE notes below
- **Bundled WebP count:** 68
- **Distinct mapped exercise IDs:** 82
- **Distinct planned assets still needed for fallbacks:** 107

### Architecture (source of truth)

| Piece | Location |
|---|---|
| Exercise library | `src/data/exerciseLibrary.ts` (`EXERCISE_LIBRARY` / SEED, 225 IDs) |
| Asset requires | `src/data/exerciseIllustrationAssets.ts` |
| ID → asset mapping | `src/data/exerciseIllustrations.ts` (`EXERCISE_ID_TO_ASSET_KEY`) |
| Resolver | `getExerciseIllustrationSource` / `getAssetKeyForExercise` (ID first, then exact name) |
| Assets | `src/assets/images/exerciseIllustrations/*.webp` |
| References (not mapped) | `src/assets/images/exerciseIllustrations/_references/` |
| Thumbnail UI | `src/components/workoutLog/ExerciseIllustrationThumb.tsx` |
| Consumer | `src/components/workoutLog/AddExerciseSheet.tsx` only |
| Fallback | Ionicons `barbell-outline` when resolver returns null |

## Exercises With Correct Illustrations

82 exercises resolve to a bundled WebP.

| exercise_id | name | muscle | equipment | asset | batch | reuse |
|---|---|---|---|---|---|---|
| `ex-barbell-row` | Barbell Row | back | barbell | `barbell_row.webp` | 3 | SAFE_REUSE |
| `ex-close-grip-lat-pulldown` | Close Grip Lat Pulldown | back | cable | `lat_pulldown.webp` | 3 | SAFE_REUSE |
| `ex-close-grip-seated-cable-row` | Close Grip Seated Cable Row | back | cable | `seated_cable_row.webp` | 3 | SAFE_REUSE |
| `ex-db-row` | Dumbbell Row | back | dumbbell | `dumbbell_row.webp` | 3 | SAFE_REUSE |
| `ex-iso-lateral-row` | Iso-Lateral Row | back | machine | `machine_row.webp` | 3 | SAFE_REUSE |
| `ex-lat-pulldown` | Lat Pulldown | back | cable | `lat_pulldown.webp` | 3 | SAFE_REUSE |
| `ex-low-row-machine` | Low Row Machine | back | machine | `machine_row.webp` | 3 | SAFE_REUSE |
| `ex-machine-pullover` | Machine Pullover | back | machine | `pullover_machine.webp` | 3 | — |
| `ex-machine-row` | Machine Row | back | machine | `machine_row.webp` | 3 | SAFE_REUSE |
| `ex-neutral-grip-lat-pulldown` | Neutral Grip Lat Pulldown | back | cable | `lat_pulldown.webp` | 3 | SAFE_REUSE |
| `ex-neutral-grip-pull-up` | Neutral Grip Pull-Up | back | bodyweight | `pull_up.webp` | 3 | SAFE_REUSE |
| `ex-pendlay-row` | Pendlay Row | back | barbell | `barbell_row.webp` | 3 | SAFE_REUSE |
| `ex-plate-loaded-row` | Plate Loaded Row | back | machine | `machine_row.webp` | 3 | SAFE_REUSE |
| `ex-pull-up` | Pull-Up | back | bodyweight | `pull_up.webp` | 3 | SAFE_REUSE |
| `ex-seated-row` | Seated Cable Row | back | cable | `seated_cable_row.webp` | 3 | SAFE_REUSE |
| `ex-single-arm-cable-row` | Single Arm Cable Row | back | cable | `cable_row_single_arm.webp` | 3 | — |
| `ex-single-arm-dumbbell-row` | Single Arm Dumbbell Row | back | dumbbell | `dumbbell_row.webp` | 3 | SAFE_REUSE |
| `ex-straight-arm-pulldown` | Straight Arm Pulldown | back | cable | `straight_arm_pulldown.webp` | 3 | — |
| `ex-t-bar-row` | T-Bar Row | back | barbell | `t_bar_row.webp` | 3 | — |
| `ex-weighted-pull-up` | Weighted Pull-Up | back | bodyweight | `pull_up.webp` | 3 | SAFE_REUSE |
| `ex-wide-grip-lat-pulldown` | Wide Grip Lat Pulldown | back | cable | `lat_pulldown.webp` | 3 | SAFE_REUSE |
| `ex-wide-grip-seated-cable-row` | Wide Grip Seated Cable Row | back | cable | `seated_cable_row.webp` | 3 | SAFE_REUSE |
| `ex-barbell-curl` | Barbell Curl | biceps | barbell | `curl_barbell.webp` | 4 | — |
| `ex-bayesian-cable-curl` | Bayesian Cable Curl | biceps | cable | `curl_cable_bayesian.webp` | 4 | — |
| `ex-biceps-curl` | Biceps Curl | biceps | dumbbell | `curl_dumbbell.webp` | 2 | — |
| `ex-cable-curl` | Cable Curl | biceps | cable | `curl_cable.webp` | 4 | — |
| `ex-concentration-curl` | Concentration Curl | biceps | dumbbell | `curl_concentration.webp` | 4 | — |
| `ex-hammer-curl` | Hammer Curl | biceps | dumbbell | `curl_hammer.webp` | 2 | — |
| `ex-incline-dumbbell-curl` | Incline Dumbbell Curl | biceps | dumbbell | `curl_dumbbell_incline.webp` | 4 | — |
| `ex-preacher-curl` | Preacher Curl | biceps | barbell | `curl_preacher.webp` | 5 | — |
| `ex-reverse-curl` | Reverse Curl | biceps | barbell | `curl_reverse.webp` | 5 | — |
| `ex-spider-curl` | Spider Curl | biceps | barbell | `curl_spider.webp` | 5 | — |
| `ex-calf` | Calf Raise | calves | machine | `calf_raise_standing.webp` | 8 | — |
| `ex-seated-calf-raise` | Seated Calf Raise | calves | machine | `calf_raise_seated.webp` | 8 | — |
| `ex-cycling` | Cycling | cardio | cardio_machine | `bike_stationary.webp` | 2 | — |
| `ex-rowing` | Rowing | cardio | cardio_machine | `rower.webp` | 2 | — |
| `ex-running` | Running | cardio | cardio_machine | `running_treadmill.webp` | 2 | — |
| `ex-stairmaster` | Stairmaster | cardio | cardio_machine | `stair_climber.webp` | 2 | — |
| `ex-bench-press` | Bench Press | chest | barbell | `bench_press_barbell.webp` | 1 | SAFE_REUSE |
| `ex-cable-fly` | Cable Fly | chest | cable | `chest_fly_cable.webp` | 1 | — |
| `ex-chest-press` | Chest Press | chest | machine | `chest_press_machine.webp` | 1 | SAFE_REUSE |
| `ex-close-grip-bench-press` | Close Grip Bench Press | chest | barbell | `bench_press_barbell.webp` | 1 | SAFE_REUSE |
| `ex-decline-barbell-bench-press` | Decline Barbell Bench Press | chest | barbell | `bench_press_barbell_decline.webp` | 1 | — |
| `ex-decline-dumbbell-bench-press` | Decline Dumbbell Bench Press | chest | dumbbell | `bench_press_dumbbell_decline.webp` | 1 | — |
| `ex-dumbbell-bench-press` | Dumbbell Bench Press | chest | dumbbell | `bench_press_dumbbell.webp` | 1 | — |
| `ex-dumbbell-fly` | Dumbbell Fly | chest | dumbbell | `chest_fly_dumbbell.webp` | 1 | — |
| `ex-incline-bench` | Incline Bench Press | chest | barbell | `bench_press_barbell_incline.webp` | 1 | — |
| `ex-incline-dumbbell-bench-press` | Incline Dumbbell Bench Press | chest | dumbbell | `bench_press_dumbbell_incline.webp` | 1 | — |
| `ex-incline-dumbbell-fly` | Incline Dumbbell Fly | chest | dumbbell | `chest_fly_dumbbell_incline.webp` | 1 | — |
| `ex-plate-loaded-chest-press` | Plate Loaded Chest Press | chest | machine | `chest_press_machine.webp` | 1 | SAFE_REUSE |
| `ex-smith-machine-bench-press` | Smith Machine Bench Press | chest | smith | `bench_press_smith.webp` | 1 | — |
| `ex-ab-wheel-rollout` | Ab Wheel Rollout | core | other | `ab_wheel_rollout.webp` | 8 | — |
| `ex-cable-crunch` | Cable Crunch | core | cable | `crunch_cable.webp` | 2 | — |
| `ex-leg-raise` | Leg Raise | core | bodyweight | `leg_raise_lying.webp` | 2 | — |
| `ex-machine-crunch` | Machine Crunch | core | machine | `crunch_machine.webp` | 8 | — |
| `ex-plank` | Plank | core | bodyweight | `plank.webp` | 2 | — |
| `ex-bulgarian` | Bulgarian Split Squat | glutes | dumbbell | `bulgarian_split_squat.webp` | 2 | — |
| `ex-cable-kickback` | Cable Kickback | glutes | cable | `glute_kickback.webp` | 7 | — |
| `ex-glute-bridge` | Glute Bridge | glutes | bodyweight | `glute_bridge.webp` | 7 | — |
| `ex-hip-abd` | Hip Abduction | glutes | machine | `hip_abduction_machine.webp` | 2 | — |
| `ex-hip-thrust` | Hip Thrust | glutes | barbell | `hip_thrust_barbell.webp` | 2 | — |
| `ex-leg-curl` | Leg Curl | hamstrings | machine | `leg_curl_lying.webp` | 7 | — |
| `ex-rdl` | Romanian Deadlift | hamstrings | barbell | `rdl_barbell.webp` | 7 | — |
| `ex-seated-leg-curl` | Seated Leg Curl | hamstrings | machine | `leg_curl_seated.webp` | 7 | — |
| `ex-stiff-leg-deadlift` | Stiff Leg Deadlift | hamstrings | barbell | `stiff_leg_deadlift.webp` | 7 | — |
| `ex-leg-ext` | Leg Extension | quads | machine | `leg_extension.webp` | 5 | — |
| `ex-leg-press` | Leg Press | quads | machine | `leg_press.webp` | 5 | — |
| `ex-barbell-overhead-press` | Barbell Overhead Press | shoulders | barbell | `shoulder_press_barbell.webp` | 4 | — |
| `ex-cable-rear-delt-fly` | Cable Rear Delt Fly | shoulders | cable | `rear_delt_fly_cable.webp` | 4 | — |
| `ex-dumbbell-shoulder-press` | Dumbbell Shoulder Press | shoulders | dumbbell | `shoulder_press_dumbbell.webp` | 4 | — |
| `ex-machine-lateral-raise` | Machine Lateral Raise | shoulders | machine | `lateral_raise_machine.webp` | 4 | — |
| `ex-machine-shoulder-press` | Machine Shoulder Press | shoulders | machine | `shoulder_press_machine.webp` | 4 | — |
| `ex-rear-delt` | Rear Delt Fly | shoulders | dumbbell | `rear_delt_fly_dumbbell.webp` | 2 | — |
| `ex-reverse-pec-deck` | Reverse Pec Deck | shoulders | machine | `reverse_pec_deck.webp` | 4 | — |
| `ex-smith-machine-shoulder-press` | Smith Machine Shoulder Press | shoulders | smith | `shoulder_press_smith.webp` | 4 | — |
| `ex-upright-row` | Upright Row | shoulders | barbell | `upright_row.webp` | 4 | — |
| `ex-bench-dip` | Bench Dip | triceps | bodyweight | `dip_bench.webp` | 5 | — |
| `ex-dumbbell-overhead-tricep-extension` | Dumbbell Overhead Tricep Extension | triceps | dumbbell | `tricep_overhead_dumbbell.webp` | 5 | — |
| `ex-overhead-cable-tricep-extension` | Overhead Cable Tricep Extension | triceps | cable | `tricep_overhead_cable.webp` | 5 | — |
| `ex-skull-crusher` | Skull Crusher | triceps | barbell | `skull_crusher.webp` | 2 | — |
| `ex-tricep-dip` | Tricep Dip | triceps | bodyweight | `dip_tricep.webp` | 5 | — |
| `ex-triceps-pushdown` | Triceps Pushdown | triceps | cable | `tricep_pushdown.webp` | 2 | — |

## Exercises Still Using Fallback

**143** exercises have no illustration mapping and show the barbell fallback icon.

Distinct target asset filenames (from `gymly_exercise_visual_mapping.csv` / catch-up batches): **107**.

| exercise_id | name | muscle | equipment | expected asset | source batch |
|---|---|---|---|---|---|
| `ex-assisted-pull-up` | Assisted Pull-Up | back | machine | `pull_up_assisted.webp` | — |
| `ex-back-extension` | Back Extension | back | machine | `back_extension.webp` | — |
| `ex-chest-supported-dumbbell-row` | Chest Supported Dumbbell Row | back | dumbbell | `dumbbell_row_chest_supported.webp` | — |
| `ex-chest-supported-t-bar-row` | Chest Supported T-Bar Row | back | machine | `t_bar_row_chest_supported.webp` | — |
| `ex-chin-up` | Chin-Up | back | bodyweight | `chin_up.webp` | — |
| `ex-conventional-deadlift` | Conventional Deadlift | back | barbell | `deadlift_conventional.webp` | — |
| `ex-dumbbell-pullover` | Dumbbell Pullover | back | dumbbell | `pullover_dumbbell.webp` | — |
| `ex-high-row-machine` | High Row Machine | back | machine | `machine_row_high.webp` | — |
| `ex-machine-back-extension` | Machine Back Extension | back | machine | `back_extension.webp` | — |
| `ex-meadows-row` | Meadows Row | back | barbell | `meadows_row.webp` | — |
| `ex-rack-pull` | Rack Pull | back | barbell | `deadlift_rack_pull.webp` | — |
| `ex-single-arm-lat-pulldown` | Single Arm Lat Pulldown | back | cable | `lat_pulldown_single_arm.webp` | — |
| `ex-alternating-dumbbell-curl` | Alternating Dumbbell Curl | biceps | dumbbell | `curl_dumbbell.webp` | — |
| `ex-cross-body-hammer-curl` | Cross Body Hammer Curl | biceps | dumbbell | `curl_hammer.webp` | — |
| `ex-dumbbell-curl` | Dumbbell Curl | biceps | dumbbell | `curl_dumbbell.webp` | — |
| `ex-dumbbell-preacher-curl` | Dumbbell Preacher Curl | biceps | dumbbell | `curl_preacher.webp` | — |
| `ex-ez-bar-curl` | EZ Bar Curl | biceps | barbell | `curl_barbell.webp` | — |
| `ex-ez-bar-preacher-curl` | EZ Bar Preacher Curl | biceps | barbell | `curl_preacher.webp` | — |
| `ex-machine-preacher-curl` | Machine Preacher Curl | biceps | machine | `curl_preacher_machine.webp` | 5 |
| `ex-rope-hammer-curl` | Rope Hammer Curl | biceps | cable | `curl_cable.webp` | — |
| `ex-straight-bar-cable-curl` | Straight Bar Cable Curl | biceps | cable | `curl_cable.webp` | — |
| `ex-donkey-calf-raise` | Donkey Calf Raise | calves | machine | `calf_raise_donkey.webp` | 8 |
| `ex-leg-press-calf-raise` | Leg Press Calf Raise | calves | machine | `calf_raise_leg_press.webp` | 8 |
| `ex-machine-seated-calf-raise` | Machine Seated Calf Raise | calves | machine | `calf_raise_seated.webp` | — |
| `ex-machine-standing-calf-raise` | Machine Standing Calf Raise | calves | machine | `calf_raise_standing.webp` | — |
| `ex-single-leg-calf-raise` | Single Leg Calf Raise | calves | bodyweight | `calf_raise_standing.webp` | — |
| `ex-smith-machine-calf-raise` | Smith Machine Calf Raise | calves | smith | `calf_raise_standing.webp` | — |
| `ex-standing-calf-raise` | Standing Calf Raise | calves | machine | `calf_raise_standing.webp` | — |
| `ex-assault-bike` | Assault Bike | cardio | cardio_machine | `bike_assault.webp` | 10 |
| `ex-elliptical` | Elliptical | cardio | cardio_machine | `elliptical.webp` | 10 |
| `ex-jump-rope` | Jump Rope | cardio | other | `jump_rope.webp` | 10 |
| `ex-outdoor-walking` | Outdoor Walking | cardio | other | `walking_outdoor.webp` | 11 |
| `ex-skierg` | SkiErg | cardio | cardio_machine | `skierg.webp` | 10 |
| `ex-spinning-bike` | Spinning Bike | cardio | cardio_machine | `bike_stationary.webp` | — |
| `ex-swimming` | Swimming | cardio | other | `swimming.webp` | 10 |
| `ex-treadmill-walking` | Treadmill Walking | cardio | cardio_machine | `walking_treadmill.webp` | 11 |
| `ex-chest-dip` | Chest Dip | chest | bodyweight | `dip_chest.webp` | — |
| `ex-decline-chest-press-machine` | Decline Chest Press Machine | chest | machine | `chest_press_machine_decline.webp` | — |
| `ex-high-to-low-cable-fly` | High to Low Cable Fly | chest | cable | `chest_fly_cable_high_to_low.webp` | — |
| `ex-incline-chest-press-machine` | Incline Chest Press Machine | chest | machine | `chest_press_machine_incline.webp` | — |
| `ex-low-to-high-cable-fly` | Low to High Cable Fly | chest | cable | `chest_fly_cable_low_to_high.webp` | — |
| `ex-pec-deck` | Pec Deck | chest | machine | `pec_deck.webp` | — |
| `ex-push-up` | Push-Up | chest | bodyweight | `push_up.webp` | — |
| `ex-smith-machine-incline-bench-press` | Smith Machine Incline Bench Press | chest | smith | `bench_press_smith_incline.webp` | — |
| `ex-weighted-push-up` | Weighted Push-Up | chest | bodyweight | `push_up.webp` | — |
| `ex-ab-crunch` | Ab Crunch | core | bodyweight | `crunch.webp` | 8 |
| `ex-bicycle-crunch` | Bicycle Crunch | core | bodyweight | `crunch_bicycle.webp` | 8 |
| `ex-cable-woodchop` | Cable Woodchop | core | cable | `woodchop_cable.webp` | 9 |
| `ex-captain-s-chair-leg-raise` | Captain's Chair Leg Raise | core | machine | `leg_raise_captains_chair.webp` | 9 |
| `ex-dead-bug` | Dead Bug | core | bodyweight | `dead_bug.webp` | 9 |
| `ex-decline-sit-up` | Decline Sit-Up | core | bodyweight | `sit_up.webp` | — |
| `ex-hanging-knee-raise` | Hanging Knee Raise | core | bodyweight | `leg_raise_hanging.webp` | — |
| `ex-hanging-leg-raise` | Hanging Leg Raise | core | bodyweight | `leg_raise_hanging.webp` | 9 |
| `ex-pallof-press` | Pallof Press | core | cable | `pallof_press.webp` | 9 |
| `ex-reverse-crunch` | Reverse Crunch | core | bodyweight | `crunch_reverse.webp` | 9 |
| `ex-russian-twist` | Russian Twist | core | bodyweight | `russian_twist.webp` | 9 |
| `ex-side-plank` | Side Plank | core | bodyweight | `plank_side.webp` | 9 |
| `ex-sit-up` | Sit-Up | core | bodyweight | `sit_up.webp` | 9 |
| `ex-toe-touch` | Toe Touch | core | bodyweight | `toe_touch.webp` | 9 |
| `ex-v-up` | V-Up | core | bodyweight | `v_up.webp` | 9 |
| `ex-weighted-crunch` | Weighted Crunch | core | other | `crunch.webp` | — |
| `ex-weighted-plank` | Weighted Plank | core | other | `plank.webp` | — |
| `ex-weighted-sit-up` | Weighted Sit-Up | core | other | `sit_up.webp` | — |
| `ex-barbell-thruster` | Barbell Thruster | full_body | barbell | `thruster_barbell.webp` | 10 |
| `ex-burpee` | Burpee | full_body | bodyweight | `burpee.webp` | 9 |
| `ex-clean` | Clean | full_body | barbell | `olympic_clean.webp` | 10 |
| `ex-clean-and-jerk` | Clean and Jerk | full_body | barbell | `olympic_clean_and_jerk.webp` | 10 |
| `ex-dumbbell-farmer-s-walk` | Dumbbell Farmer's Walk | full_body | dumbbell | `farmers_walk.webp` | — |
| `ex-dumbbell-thruster` | Dumbbell Thruster | full_body | dumbbell | `thruster_dumbbell.webp` | 10 |
| `ex-farmer-s-walk` | Farmer's Walk | full_body | other | `farmers_walk.webp` | 9 |
| `ex-kettlebell-farmer-s-walk` | Kettlebell Farmer's Walk | full_body | kettlebell | `farmers_walk.webp` | — |
| `ex-kettlebell-swing` | Kettlebell Swing | full_body | kettlebell | `kettlebell_swing.webp` | 10 |
| `ex-power-clean` | Power Clean | full_body | barbell | `olympic_clean.webp` | — |
| `ex-snatch` | Snatch | full_body | barbell | `olympic_snatch.webp` | 10 |
| `ex-barbell-glute-bridge` | Barbell Glute Bridge | glutes | barbell | `glute_bridge.webp` | — |
| `ex-cable-hip-abduction` | Cable Hip Abduction | glutes | cable | `hip_abduction_cable.webp` | 7 |
| `ex-dumbbell-hip-thrust` | Dumbbell Hip Thrust | glutes | dumbbell | `hip_thrust_dumbbell.webp` | 8 |
| `ex-frog-pump` | Frog Pump | glutes | bodyweight | `frog_pump.webp` | 7 |
| `ex-machine-glute-kickback` | Machine Glute Kickback | glutes | machine | `glute_kickback.webp` | — |
| `ex-machine-hip-thrust` | Machine Hip Thrust | glutes | machine | `hip_thrust_machine.webp` | 8 |
| `ex-smith-machine-hip-thrust` | Smith Machine Hip Thrust | glutes | smith | `hip_thrust_smith.webp` | 8 |
| `ex-standing-hip-abduction` | Standing Hip Abduction | glutes | cable | `hip_abduction_cable.webp` | — |
| `ex-sumo-deadlift` | Sumo Deadlift | glutes | barbell | `deadlift_sumo.webp` | 7 |
| `ex-sumo-squat` | Sumo Squat | glutes | dumbbell | `squat_sumo.webp` | 8 |
| `ex-barbell-good-morning` | Barbell Good Morning | hamstrings | barbell | `good_morning.webp` | — |
| `ex-barbell-romanian-deadlift` | Barbell Romanian Deadlift | hamstrings | barbell | `rdl_barbell.webp` | — |
| `ex-cable-pull-through` | Cable Pull Through | hamstrings | cable | `cable_pull_through.webp` | 6 |
| `ex-dumbbell-romanian-deadlift` | Dumbbell Romanian Deadlift | hamstrings | dumbbell | `rdl_dumbbell.webp` | 7 |
| `ex-dumbbell-single-leg-romanian-deadlift` | Dumbbell Single Leg Romanian Deadlift | hamstrings | dumbbell | `rdl_single_leg.webp` | — |
| `ex-glute-ham-raise` | Glute Ham Raise | hamstrings | machine | `glute_ham_raise.webp` | 6 |
| `ex-good-morning` | Good Morning | hamstrings | barbell | `good_morning.webp` | 6 |
| `ex-lying-leg-curl` | Lying Leg Curl | hamstrings | machine | `leg_curl_lying.webp` | — |
| `ex-nordic-hamstring-curl` | Nordic Hamstring Curl | hamstrings | bodyweight | `nordic_curl.webp` | 7 |
| `ex-single-leg-curl` | Single Leg Curl | hamstrings | machine | `leg_curl_lying.webp` | — |
| `ex-single-leg-romanian-deadlift` | Single Leg Romanian Deadlift | hamstrings | dumbbell | `rdl_single_leg.webp` | 7 |
| `ex-smith-machine-romanian-deadlift` | Smith Machine Romanian Deadlift | hamstrings | smith | `rdl_smith.webp` | 7 |
| `ex-standing-leg-curl` | Standing Leg Curl | hamstrings | machine | `leg_curl_standing.webp` | 7 |
| `ex-45-degree-leg-press` | 45 Degree Leg Press | quads | machine | `leg_press.webp` | — |
| `ex-barbell-front-squat` | Barbell Front Squat | quads | barbell | `squat_front_barbell.webp` | 6 |
| `ex-belt-squat` | Belt Squat | quads | machine | `squat_belt.webp` | 6 |
| `ex-dumbbell-bulgarian-split-squat` | Dumbbell Bulgarian Split Squat | quads | dumbbell | `bulgarian_split_squat.webp` | — |
| `ex-dumbbell-step-up` | Dumbbell Step-Up | quads | dumbbell | `step_up.webp` | — |
| `ex-dumbbell-walking-lunge` | Dumbbell Walking Lunge | quads | dumbbell | `lunge.webp` | — |
| `ex-forward-lunge` | Forward Lunge | quads | dumbbell | `lunge.webp` | — |
| `ex-goblet-squat` | Goblet Squat | quads | dumbbell | `squat_goblet.webp` | 6 |
| `ex-hack-squat` | Hack Squat | quads | machine | `squat_hack.webp` | 6 |
| `ex-high-bar-squat` | High Bar Squat | quads | barbell | `squat_back_barbell.webp` | — |
| `ex-horizontal-leg-press` | Horizontal Leg Press | quads | machine | `leg_press_horizontal.webp` | 6 |
| `ex-low-bar-squat` | Low Bar Squat | quads | barbell | `squat_back_barbell.webp` | — |
| `ex-pendulum-squat` | Pendulum Squat | quads | machine | `squat_pendulum.webp` | 6 |
| `ex-reverse-lunge` | Reverse Lunge | quads | dumbbell | `lunge_reverse.webp` | 6 |
| `ex-single-leg-extension` | Single Leg Extension | quads | machine | `leg_extension.webp` | — |
| `ex-single-leg-press` | Single Leg Press | quads | machine | `leg_press.webp` | — |
| `ex-sissy-squat` | Sissy Squat | quads | bodyweight | `squat_sissy.webp` | 6 |
| `ex-smith-machine-bulgarian-split-squat` | Smith Machine Bulgarian Split Squat | quads | smith | `bulgarian_split_squat.webp` | — |
| `ex-smith-machine-lunge` | Smith Machine Lunge | quads | smith | `lunge.webp` | — |
| `ex-smith-machine-squat` | Smith Machine Squat | quads | smith | `squat_smith.webp` | 6 |
| `ex-squat` | Squat | quads | barbell | `squat_back_barbell.webp` | 6 |
| `ex-step-up` | Step-Up | quads | dumbbell | `step_up.webp` | 6 |
| `ex-walking-lunge` | Walking Lunge | quads | dumbbell | `lunge.webp` | 6 |
| `ex-arnold-press` | Arnold Press | shoulders | dumbbell | `arnold_press.webp` | — |
| `ex-cable-front-raise` | Cable Front Raise | shoulders | cable | `front_raise.webp` | — |
| `ex-cable-lateral-raise` | Cable Lateral Raise | shoulders | cable | `lateral_raise_cable.webp` | — |
| `ex-dumbbell-front-raise` | Dumbbell Front Raise | shoulders | dumbbell | `front_raise.webp` | — |
| `ex-dumbbell-upright-row` | Dumbbell Upright Row | shoulders | dumbbell | `upright_row.webp` | — |
| `ex-face-pull` | Face Pull | shoulders | cable | `face_pull.webp` | — |
| `ex-lateral-raise` | Lateral Raise | shoulders | dumbbell | `lateral_raise_dumbbell.webp` | — |
| `ex-plate-front-raise` | Plate Front Raise | shoulders | other | `front_raise.webp` | — |
| `ex-seated-barbell-shoulder-press` | Seated Barbell Shoulder Press | shoulders | barbell | `shoulder_press_barbell.webp` | — |
| `ex-seated-dumbbell-shoulder-press` | Seated Dumbbell Shoulder Press | shoulders | dumbbell | `shoulder_press_dumbbell.webp` | — |
| `ex-shoulder-press` | Shoulder Press | shoulders | dumbbell | `shoulder_press_dumbbell.webp` | — |
| `ex-single-arm-cable-lateral-raise` | Single Arm Cable Lateral Raise | shoulders | cable | `lateral_raise_cable.webp` | — |
| `ex-dumbbell-skull-crusher` | Dumbbell Skull Crusher | triceps | dumbbell | `skull_crusher_dumbbell.webp` | 5 |
| `ex-ez-bar-skull-crusher` | EZ Bar Skull Crusher | triceps | barbell | `skull_crusher.webp` | — |
| `ex-lying-tricep-extension` | Lying Tricep Extension | triceps | barbell | `skull_crusher.webp` | — |
| `ex-reverse-grip-tricep-pushdown` | Reverse Grip Tricep Pushdown | triceps | cable | `tricep_pushdown.webp` | — |
| `ex-rope-overhead-tricep-extension` | Rope Overhead Tricep Extension | triceps | cable | `tricep_overhead_cable.webp` | — |
| `ex-rope-tricep-pushdown` | Rope Tricep Pushdown | triceps | cable | `tricep_pushdown.webp` | — |
| `ex-single-arm-dumbbell-tricep-extension` | Single Arm Dumbbell Tricep Extension | triceps | dumbbell | `tricep_overhead_dumbbell.webp` | — |
| `ex-single-arm-tricep-pushdown` | Single Arm Tricep Pushdown | triceps | cable | `tricep_pushdown.webp` | — |
| `ex-straight-bar-tricep-pushdown` | Straight Bar Tricep Pushdown | triceps | cable | `tricep_pushdown.webp` | — |
| `ex-tricep-extension-machine` | Tricep Extension Machine | triceps | machine | `tricep_extension_machine.webp` | 5 |
| `ex-v-bar-tricep-pushdown` | V-Bar Tricep Pushdown | triceps | cable | `tricep_pushdown.webp` | — |

## Wrong Illustration Mappings

**None found.**

Every currently mapped `exercise_id` points at an asset key whose filename matches the intended movement family from Batch 01–08 / visual mapping. No mapped exercise was found pointing at an unrelated movement (e.g. Running mapped to Walking, Plank mapped to Side Plank).

## Suspicious Duplicate Asset Mappings

**Primary status DUPLICATE_SUSPICIOUS: 0**

All multi-exercise asset sharing currently present was introduced intentionally (especially Batch 03 grip/machine variants). Classified as **SAFE_REUSE**:

| asset | exercise_ids | classification | notes |
|---|---|---|---|
| `lat_pulldown.webp` | `ex-lat-pulldown`, `ex-wide-grip-lat-pulldown`, `ex-close-grip-lat-pulldown`, `ex-neutral-grip-lat-pulldown` | SAFE_REUSE | Intentional Batch 01/03 family share |
| `machine_row.webp` | `ex-machine-row`, `ex-plate-loaded-row`, `ex-low-row-machine`, `ex-iso-lateral-row` | SAFE_REUSE | Intentional Batch 01/03 family share |
| `pull_up.webp` | `ex-pull-up`, `ex-neutral-grip-pull-up`, `ex-weighted-pull-up` | SAFE_REUSE | Intentional Batch 01/03 family share |
| `seated_cable_row.webp` | `ex-seated-row`, `ex-wide-grip-seated-cable-row`, `ex-close-grip-seated-cable-row` | SAFE_REUSE | Intentional Batch 01/03 family share |
| `bench_press_barbell.webp` | `ex-bench-press`, `ex-close-grip-bench-press` | SAFE_REUSE | Close-grip shares standard barbell bench thumbnail (optional dedicated asset later) |
| `chest_press_machine.webp` | `ex-chest-press`, `ex-plate-loaded-chest-press` | SAFE_REUSE | Intentional Batch 01/03 family share |
| `barbell_row.webp` | `ex-barbell-row`, `ex-pendlay-row` | SAFE_REUSE | Pendlay shares barbell row family |
| `dumbbell_row.webp` | `ex-db-row`, `ex-single-arm-dumbbell-row` | SAFE_REUSE | Intentional Batch 01/03 family share |

### Borderline review (still CORRECT / SAFE_REUSE)

- `ex-close-grip-bench-press` → `bench_press_barbell.webp` (same asset as Bench Press)
- `ex-pendlay-row` → `barbell_row.webp`
- Machine-row family shares one `machine_row.webp` across 4 IDs

These are **not** classified as wrong, but dedicated assets would improve accuracy.

## Missing Referenced Assets

**None.** Every key in `ILLUSTRATION_ASSETS` has a corresponding `.webp` on disk, and every mapped ID resolves to a registered key.

## Unused Illustration Assets

### Bundled WebPs (`exerciseIllustrations/*.webp`)
**0 unused.** All 68 files are registered and referenced by ≥1 exercise.

### Reference-only files (`_references/`) — intentionally unmapped

- `BATCH_04_REFERENCE.png`
- `cable_crossover_reference.webp`
- `decline_cable_fly_reference.webp`
- `hammer_strength_chest_press_reference.webp`
- `incline_cable_fly_reference.webp`

These must remain unmapped (not Workout Log thumbnails).

### Duplicate identical image bytes
**None** among the 68 WebPs (MD5 scan).

## Batch 01–15 Audit

Codebase is the source of truth. Batch CSVs were planning artifacts; empty-asset catch-up batches did not change mappings.

| Batch | Focus | New WebPs active | Mapped IDs from batch | Still fallback (from batch queue) | Conflicts / notes |
|---|---|---|---|---|---|
| 01 | Chest | 11 | 13 (incl. shares) | Other chest variants (e.g. Push-Up) | Close-grip shares barbell bench |
| 02 | Mixed | 15 | 15 | — | Bulgarian/hip/cable crunch protected vs later ZIP overwrites |
| 03 | Back | 10 | 22 (grip shares) | Other back variants | Intentional multi-ID shares |
| 04 | Shoulders/Biceps | 13 | 13 | Many shoulder/bicep variants | Rear delt + biceps curl reused Batch 02 |
| 05 | Arms + quads start | 9 new (+2 ZIP conflicts kept B02) | 9 new + prior hammer/skull/pushdown | Machine preacher, DB skull crusher, machine TE | ZIP tried overwrite skull/pushdown — kept B02 |
| 06 | Legs (squats/lunges) | **0** (empty ZIP) | 0 | All 15 Batch 06 IDs | Asset-pending |
| 07 | Hamstrings/glutes | 6 new (+BG conflict kept B02) | 6 new + Bulgarian kept | 8 missing from B07 queue | Bulgarian ZIP not overwritten |
| 08 | Glutes/calves/core | 4 new (+3 conflicts kept B02) | 4 new + hip/crunch kept | 8 missing from B08 queue | Hip/cable crunch ZIP not overwritten |
| 09 | Core/cardio catch-up A | 0 | Plank + Leg Raise already B02 | 13 others | Do not downgrade Plank/Leg Raise |
| 10 | Full body/cardio catch-up | 0 | Cycling/Rowing/Running/Stair already B02 | 11 others | Preserved cardio |
| 11 | Walking | 0 | 0 | Outdoor + Treadmill Walking | Not sharing Running |
| 12 | Catch-up A | 0 | 0 | 15 gap IDs (IDs resolved) | Empty assets |
| 13 | Catch-up B | 0 | Plank + Leg Raise preserved | 13 | Empty assets |
| 14 | Catch-up C | 0 | Cycling + Rowing preserved | 13 | Empty assets |
| 15 | Catch-up D (final) | 0 | Running + Stairmaster preserved | 4 | Empty assets |

### Active mapped ID counts by introducing batch (approx.)

- Batch 1: **13** mapped exercise IDs
- Batch 2: **15** mapped exercise IDs
- Batch 3: **22** mapped exercise IDs
- Batch 4: **13** mapped exercise IDs
- Batch 5: **9** mapped exercise IDs
- Batch 7: **6** mapped exercise IDs
- Batch 8: **4** mapped exercise IDs

## Workout Log UI Audit

### What was statically verified

- `ExerciseIllustrationThumb` uses fixed square container (default **44×44**), `resizeMode="contain"` → preserves aspect ratio, no stretch.
- Fallback icon centered in same box → row height stable whether image or fallback.
- Thumb is rendered inside `AddExerciseSheet` list rows → covers **All Exercises**, **Recent Exercises**, **search results**, and rows shown under **muscle/equipment filters** (same list component).

### What was NOT runtime-verified in this audit

- Visual flicker on device/simulator
- Actual tap-through of Live Workout / History screens
- Metro bundle re-run in this audit pass (prior batches bundled successfully with 68 WebPs)

### Coverage gap (product, not a mapping bug)

Illustrations are **only** wired into the exercise picker (`AddExerciseSheet`).

**Not found** in:
- `LiveWorkoutScreen`
- workout history detail rows
- set editors / PR surfaces

So selected-exercise / active-workout / history illustration display is currently **out of scope of the existing system** (fallback/N/A there), not a broken mapping.

## Data / Functionality Safety Audit

Static inspection indicates illustration work is isolated to:

- `exerciseIllustrationAssets.ts`
- `exerciseIllustrations.ts`
- `ExerciseIllustrationThumb.tsx`
- `AddExerciseSheet.tsx` (thumb render only)
- asset WebPs + tests

**No evidence** in this audit that illustration batches changed:

- exercise IDs / names / library seed contents (library still 225 unique `ex-*` IDs)
- custom exercise service
- sets/reps/weight / + New Set
- PR detection
- workout history/saving
- Supabase relationship schemas
- check-in / feed / profiles

`exerciseLibrary.test.ts` still passes (38 combined illustration+library tests green).

## Build Verification

| Check | Result |
|---|---|
| Jest `__tests__/exerciseIllustrations.test.ts` | PASS |
| Jest `__tests__/exerciseLibrary.test.ts` | PASS |
| Combined | **38/38 passed** |
| `tsc --noEmit` | Fails with **pre-existing unrelated** project errors (chat invitation types, test `describe` types, map carousel fixtures). **No errors referencing illustration assets / webp modules.** |
| Device/runtime UI pass | **Not run** in this audit |

## Recommended Final Fixes

_Do not implement until approved._

1. **Supply Batch 06 leg assets** (Squat, lunges, front/goblet/hack squats, etc.) — largest compound gap.
2. **Supply catch-up Batch 12–15 WebPs** for the remaining ~fallback queue with exact filenames already planned.
3. **Prioritize hero compounds still on fallback:** `ex-squat`, `ex-conventional-deadlift`, `ex-push-up`, `ex-lateral-raise`, `ex-shoulder-press`.
4. **Decide SAFE_REUSE policy** for near-duplicates that already have a sibling asset (e.g. map `ex-barbell-romanian-deadlift` → existing `rdl_barbell`? map seated shoulder-press variants → existing press assets?). Do this only with explicit product approval — current code correctly keeps them on fallback.
5. **Optional dedicated assets** for SAFE_REUSE borderline cases (close-grip bench, pendlay, machine-row variants).
6. **Optional product enhancement:** show the same thumb in Live Workout / history rows (not required to “fix” mappings).
7. Keep `_references/` unmapped.
8. When new WebPs arrive: register require → map exact IDs only → extend tests; never overwrite differing Batch 02 bytes without review.
9. Do not map Walking → Running or Assault Bike → Cycling.
10. Re-run this audit CSV after each asset drop.

---

## Appendix — Fallback by muscle group

- **quads:** 23
- **core:** 18
- **hamstrings:** 13
- **shoulders:** 12
- **back:** 12
- **triceps:** 11
- **full_body:** 11
- **glutes:** 10
- **chest:** 9
- **biceps:** 9
- **cardio:** 8
- **calves:** 7

## Appendix — System counts

- Library exercises: 225
- Mapped IDs: 82
- Fallback IDs: 143
- Registered asset keys: 68
- WebP files: 68
- Reference files: 5
