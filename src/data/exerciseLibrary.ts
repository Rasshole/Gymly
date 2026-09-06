/**
 * Lokal exercise library — primary catalog for Log Workout.
 * Existing seeded IDs/names are preserved for history compatibility.
 */

import type {
  ExerciseEquipment,
  ExerciseLibraryItem,
  WorkoutMuscleGroup,
  WorkoutTrackingType,
} from '@/types/workoutLog.types';

type SeedRow = {
  id: string;
  name: string;
  muscleGroup: WorkoutMuscleGroup;
  trackingType: WorkoutTrackingType;
  sortOrder: number;
  equipment: ExerciseEquipment;
  aliases?: string[];
};

const SEED: SeedRow[] = [
  {id: "ex-bench-press", name: "Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 1, equipment: 'barbell', aliases: ["Barbell Bench Press", "Bench", "BB Bench"]},
  {id: "ex-incline-bench", name: "Incline Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 2, equipment: 'barbell', aliases: ["Incline Bench", "Incline BB Bench", "Incline Barbell Bench Press"]},
  {id: "ex-chest-press", name: "Chest Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 3, equipment: 'machine', aliases: ["Chest Press Machine"]},
  {id: "ex-cable-fly", name: "Cable Fly", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 4, equipment: 'cable', aliases: ["Cable Crossover", "Pec Fly"]},
  {id: "ex-push-up", name: "Push-Up", muscleGroup: 'chest', trackingType: 'reps_only', sortOrder: 5, equipment: 'bodyweight', aliases: ["Push Up", "Pushups"]},
  {id: "ex-lat-pulldown", name: "Lat Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 1, equipment: 'cable', aliases: ["Pulldown", "Lat Pull Down", "Lat"]},
  {id: "ex-pull-up", name: "Pull-Up", muscleGroup: 'back', trackingType: 'reps_only', sortOrder: 2, equipment: 'bodyweight', aliases: ["Pull Up", "Pullups"]},
  {id: "ex-barbell-row", name: "Barbell Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 3, equipment: 'barbell', aliases: ["BB Row", "Bent Over Row"]},
  {id: "ex-seated-row", name: "Seated Cable Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 4, equipment: 'cable', aliases: ["Cable Row", "Seated Row"]},
  {id: "ex-db-row", name: "Dumbbell Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 5, equipment: 'dumbbell', aliases: ["DB Row"]},
  {id: "ex-squat", name: "Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 1, equipment: 'barbell', aliases: ["Barbell Back Squat", "Back Squat", "BB Squat"]},
  {id: "ex-leg-press", name: "Leg Press", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 2, equipment: 'machine', aliases: ["Legpress"]},
  {id: "ex-rdl", name: "Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 1, equipment: 'barbell', aliases: ["RDL", "BB RDL"]},
  {id: "ex-leg-ext", name: "Leg Extension", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 3, equipment: 'machine', aliases: ["Leg Ext"]},
  {id: "ex-leg-curl", name: "Leg Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 2, equipment: 'machine', aliases: ["Hamstring Curl"]},
  {id: "ex-calf", name: "Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 1, equipment: 'machine', aliases: ["Calves", "Standing Calves"]},
  {id: "ex-shoulder-press", name: "Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 1, equipment: 'dumbbell', aliases: ["OHP", "Military Press", "Overhead Press"]},
  {id: "ex-lateral-raise", name: "Lateral Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 2, equipment: 'dumbbell', aliases: ["Side Raise", "DB Lateral Raise", "Dumbbell Lateral Raise"]},
  {id: "ex-rear-delt", name: "Rear Delt Fly", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 3, equipment: 'dumbbell', aliases: ["Rear Delt", "Reverse Fly"]},
  {id: "ex-biceps-curl", name: "Biceps Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 1, equipment: 'dumbbell', aliases: ["Bicep Curl", "DB Curl", "Curl"]},
  {id: "ex-hammer-curl", name: "Hammer Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 2, equipment: 'dumbbell', aliases: ["Hammer"]},
  {id: "ex-triceps-pushdown", name: "Triceps Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 1, equipment: 'cable', aliases: ["Pushdown", "Tricep Pushdown"]},
  {id: "ex-skull-crusher", name: "Skull Crusher", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 2, equipment: 'barbell', aliases: ["Skullcrusher", "French Press"]},
  {id: "ex-hip-thrust", name: "Hip Thrust", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 1, equipment: 'barbell', aliases: ["Barbell Hip Thrust"]},
  {id: "ex-bulgarian", name: "Bulgarian Split Squat", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 2, equipment: 'dumbbell', aliases: ["BSS", "Bulgarian"]},
  {id: "ex-hip-abd", name: "Hip Abduction", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 3, equipment: 'machine', aliases: ["Abduction", "Hip Abduction Machine"]},
  {id: "ex-plank", name: "Plank", muscleGroup: 'core', trackingType: 'duration', sortOrder: 1, equipment: 'bodyweight'},
  {id: "ex-cable-crunch", name: "Cable Crunch", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 2, equipment: 'cable', aliases: ["Cable Abs"]},
  {id: "ex-leg-raise", name: "Leg Raise", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 3, equipment: 'bodyweight', aliases: ["Lying Leg Raise"]},
  {id: "ex-running", name: "Running", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 1, equipment: 'cardio_machine', aliases: ["Treadmill Running", "Outdoor Running"]},
  {id: "ex-cycling", name: "Cycling", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 2, equipment: 'cardio_machine', aliases: ["Bike", "Stationary Bike"]},
  {id: "ex-stairmaster", name: "Stairmaster", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 3, equipment: 'cardio_machine', aliases: ["Stair Climber"]},
  {id: "ex-rowing", name: "Rowing", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 4, equipment: 'cardio_machine', aliases: ["Rowing Machine"]},
  {id: "ex-decline-barbell-bench-press", name: "Decline Barbell Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 6, equipment: 'barbell', aliases: ["Decline Bench"]},
  {id: "ex-close-grip-bench-press", name: "Close Grip Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 7, equipment: 'barbell', aliases: ["CGBP"]},
  {id: "ex-dumbbell-bench-press", name: "Dumbbell Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 8, equipment: 'dumbbell', aliases: ["DB Bench"]},
  {id: "ex-incline-dumbbell-bench-press", name: "Incline Dumbbell Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 9, equipment: 'dumbbell', aliases: ["Incline DB Bench"]},
  {id: "ex-decline-dumbbell-bench-press", name: "Decline Dumbbell Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 10, equipment: 'dumbbell'},
  {id: "ex-dumbbell-fly", name: "Dumbbell Fly", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 11, equipment: 'dumbbell', aliases: ["DB Fly"]},
  {id: "ex-incline-dumbbell-fly", name: "Incline Dumbbell Fly", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 12, equipment: 'dumbbell'},
  {id: "ex-incline-chest-press-machine", name: "Incline Chest Press Machine", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 13, equipment: 'machine'},
  {id: "ex-decline-chest-press-machine", name: "Decline Chest Press Machine", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 14, equipment: 'machine'},
  {id: "ex-plate-loaded-chest-press", name: "Plate Loaded Chest Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 15, equipment: 'machine'},
  {id: "ex-smith-machine-bench-press", name: "Smith Machine Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 16, equipment: 'smith'},
  {id: "ex-smith-machine-incline-bench-press", name: "Smith Machine Incline Bench Press", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 17, equipment: 'smith'},
  {id: "ex-low-to-high-cable-fly", name: "Low to High Cable Fly", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 18, equipment: 'cable'},
  {id: "ex-high-to-low-cable-fly", name: "High to Low Cable Fly", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 19, equipment: 'cable'},
  {id: "ex-pec-deck", name: "Pec Deck", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 20, equipment: 'machine', aliases: ["Pec Fly Machine"]},
  {id: "ex-weighted-push-up", name: "Weighted Push-Up", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 21, equipment: 'bodyweight'},
  {id: "ex-chest-dip", name: "Chest Dip", muscleGroup: 'chest', trackingType: 'weight_reps', sortOrder: 22, equipment: 'bodyweight', aliases: ["Dips Chest"]},
  {id: "ex-chin-up", name: "Chin-Up", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 6, equipment: 'bodyweight', aliases: ["Chin Up"]},
  {id: "ex-neutral-grip-pull-up", name: "Neutral Grip Pull-Up", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 7, equipment: 'bodyweight'},
  {id: "ex-assisted-pull-up", name: "Assisted Pull-Up", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 8, equipment: 'machine'},
  {id: "ex-weighted-pull-up", name: "Weighted Pull-Up", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 9, equipment: 'bodyweight'},
  {id: "ex-wide-grip-lat-pulldown", name: "Wide Grip Lat Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 10, equipment: 'cable'},
  {id: "ex-close-grip-lat-pulldown", name: "Close Grip Lat Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 11, equipment: 'cable'},
  {id: "ex-neutral-grip-lat-pulldown", name: "Neutral Grip Lat Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 12, equipment: 'cable'},
  {id: "ex-single-arm-lat-pulldown", name: "Single Arm Lat Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 13, equipment: 'cable'},
  {id: "ex-straight-arm-pulldown", name: "Straight Arm Pulldown", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 14, equipment: 'cable'},
  {id: "ex-wide-grip-seated-cable-row", name: "Wide Grip Seated Cable Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 15, equipment: 'cable'},
  {id: "ex-close-grip-seated-cable-row", name: "Close Grip Seated Cable Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 16, equipment: 'cable'},
  {id: "ex-single-arm-cable-row", name: "Single Arm Cable Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 17, equipment: 'cable'},
  {id: "ex-pendlay-row", name: "Pendlay Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 18, equipment: 'barbell'},
  {id: "ex-t-bar-row", name: "T-Bar Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 19, equipment: 'barbell', aliases: ["T Bar", "T Bar Row"]},
  {id: "ex-chest-supported-t-bar-row", name: "Chest Supported T-Bar Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 20, equipment: 'machine'},
  {id: "ex-single-arm-dumbbell-row", name: "Single Arm Dumbbell Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 21, equipment: 'dumbbell'},
  {id: "ex-chest-supported-dumbbell-row", name: "Chest Supported Dumbbell Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 22, equipment: 'dumbbell'},
  {id: "ex-machine-row", name: "Machine Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 23, equipment: 'machine'},
  {id: "ex-plate-loaded-row", name: "Plate Loaded Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 24, equipment: 'machine'},
  {id: "ex-high-row-machine", name: "High Row Machine", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 25, equipment: 'machine'},
  {id: "ex-low-row-machine", name: "Low Row Machine", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 26, equipment: 'machine'},
  {id: "ex-iso-lateral-row", name: "Iso-Lateral Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 27, equipment: 'machine'},
  {id: "ex-meadows-row", name: "Meadows Row", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 28, equipment: 'barbell'},
  {id: "ex-rack-pull", name: "Rack Pull", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 29, equipment: 'barbell'},
  {id: "ex-conventional-deadlift", name: "Conventional Deadlift", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 30, equipment: 'barbell', aliases: ["Deadlift", "Conv Deadlift"]},
  {id: "ex-back-extension", name: "Back Extension", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 31, equipment: 'machine', aliases: ["Hyperextension"]},
  {id: "ex-machine-back-extension", name: "Machine Back Extension", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 32, equipment: 'machine'},
  {id: "ex-dumbbell-pullover", name: "Dumbbell Pullover", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 33, equipment: 'dumbbell'},
  {id: "ex-machine-pullover", name: "Machine Pullover", muscleGroup: 'back', trackingType: 'weight_reps', sortOrder: 34, equipment: 'machine'},
  {id: "ex-barbell-overhead-press", name: "Barbell Overhead Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 4, equipment: 'barbell', aliases: ["Barbell OHP"]},
  {id: "ex-seated-barbell-shoulder-press", name: "Seated Barbell Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 5, equipment: 'barbell'},
  {id: "ex-dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 6, equipment: 'dumbbell', aliases: ["DB Shoulder Press"]},
  {id: "ex-seated-dumbbell-shoulder-press", name: "Seated Dumbbell Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 7, equipment: 'dumbbell'},
  {id: "ex-arnold-press", name: "Arnold Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 8, equipment: 'dumbbell'},
  {id: "ex-machine-shoulder-press", name: "Machine Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 9, equipment: 'machine'},
  {id: "ex-smith-machine-shoulder-press", name: "Smith Machine Shoulder Press", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 10, equipment: 'smith'},
  {id: "ex-cable-lateral-raise", name: "Cable Lateral Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 11, equipment: 'cable'},
  {id: "ex-single-arm-cable-lateral-raise", name: "Single Arm Cable Lateral Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 12, equipment: 'cable'},
  {id: "ex-machine-lateral-raise", name: "Machine Lateral Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 13, equipment: 'machine'},
  {id: "ex-dumbbell-front-raise", name: "Dumbbell Front Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 14, equipment: 'dumbbell'},
  {id: "ex-cable-front-raise", name: "Cable Front Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 15, equipment: 'cable'},
  {id: "ex-plate-front-raise", name: "Plate Front Raise", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 16, equipment: 'other'},
  {id: "ex-reverse-pec-deck", name: "Reverse Pec Deck", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 17, equipment: 'machine', aliases: ["Reverse Pec"]},
  {id: "ex-cable-rear-delt-fly", name: "Cable Rear Delt Fly", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 18, equipment: 'cable'},
  {id: "ex-face-pull", name: "Face Pull", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 19, equipment: 'cable', aliases: ["Facepulls"]},
  {id: "ex-upright-row", name: "Upright Row", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 20, equipment: 'barbell'},
  {id: "ex-dumbbell-upright-row", name: "Dumbbell Upright Row", muscleGroup: 'shoulders', trackingType: 'weight_reps', sortOrder: 21, equipment: 'dumbbell'},
  {id: "ex-barbell-curl", name: "Barbell Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 3, equipment: 'barbell', aliases: ["BB Curl"]},
  {id: "ex-ez-bar-curl", name: "EZ Bar Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 4, equipment: 'barbell', aliases: ["EZ Curl"]},
  {id: "ex-dumbbell-curl", name: "Dumbbell Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 5, equipment: 'dumbbell'},
  {id: "ex-alternating-dumbbell-curl", name: "Alternating Dumbbell Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 6, equipment: 'dumbbell'},
  {id: "ex-cross-body-hammer-curl", name: "Cross Body Hammer Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 7, equipment: 'dumbbell'},
  {id: "ex-incline-dumbbell-curl", name: "Incline Dumbbell Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 8, equipment: 'dumbbell'},
  {id: "ex-preacher-curl", name: "Preacher Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 9, equipment: 'barbell', aliases: ["Preacher"]},
  {id: "ex-ez-bar-preacher-curl", name: "EZ Bar Preacher Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 10, equipment: 'barbell'},
  {id: "ex-dumbbell-preacher-curl", name: "Dumbbell Preacher Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 11, equipment: 'dumbbell'},
  {id: "ex-machine-preacher-curl", name: "Machine Preacher Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 12, equipment: 'machine'},
  {id: "ex-cable-curl", name: "Cable Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 13, equipment: 'cable'},
  {id: "ex-straight-bar-cable-curl", name: "Straight Bar Cable Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 14, equipment: 'cable'},
  {id: "ex-rope-hammer-curl", name: "Rope Hammer Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 15, equipment: 'cable'},
  {id: "ex-bayesian-cable-curl", name: "Bayesian Cable Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 16, equipment: 'cable'},
  {id: "ex-concentration-curl", name: "Concentration Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 17, equipment: 'dumbbell'},
  {id: "ex-spider-curl", name: "Spider Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 18, equipment: 'barbell'},
  {id: "ex-reverse-curl", name: "Reverse Curl", muscleGroup: 'biceps', trackingType: 'weight_reps', sortOrder: 19, equipment: 'barbell'},
  {id: "ex-rope-tricep-pushdown", name: "Rope Tricep Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 3, equipment: 'cable', aliases: ["Rope Pushdown"]},
  {id: "ex-straight-bar-tricep-pushdown", name: "Straight Bar Tricep Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 4, equipment: 'cable'},
  {id: "ex-v-bar-tricep-pushdown", name: "V-Bar Tricep Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 5, equipment: 'cable'},
  {id: "ex-single-arm-tricep-pushdown", name: "Single Arm Tricep Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 6, equipment: 'cable'},
  {id: "ex-reverse-grip-tricep-pushdown", name: "Reverse Grip Tricep Pushdown", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 7, equipment: 'cable'},
  {id: "ex-overhead-cable-tricep-extension", name: "Overhead Cable Tricep Extension", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 8, equipment: 'cable', aliases: ["Tricep Extension"]},
  {id: "ex-rope-overhead-tricep-extension", name: "Rope Overhead Tricep Extension", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 9, equipment: 'cable'},
  {id: "ex-dumbbell-overhead-tricep-extension", name: "Dumbbell Overhead Tricep Extension", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 10, equipment: 'dumbbell'},
  {id: "ex-single-arm-dumbbell-tricep-extension", name: "Single Arm Dumbbell Tricep Extension", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 11, equipment: 'dumbbell'},
  {id: "ex-ez-bar-skull-crusher", name: "EZ Bar Skull Crusher", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 12, equipment: 'barbell'},
  {id: "ex-dumbbell-skull-crusher", name: "Dumbbell Skull Crusher", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 13, equipment: 'dumbbell'},
  {id: "ex-lying-tricep-extension", name: "Lying Tricep Extension", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 14, equipment: 'barbell'},
  {id: "ex-tricep-dip", name: "Tricep Dip", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 15, equipment: 'bodyweight', aliases: ["Dips Tricep"]},
  {id: "ex-bench-dip", name: "Bench Dip", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 16, equipment: 'bodyweight'},
  {id: "ex-tricep-extension-machine", name: "Tricep Extension Machine", muscleGroup: 'triceps', trackingType: 'weight_reps', sortOrder: 17, equipment: 'machine'},
  {id: "ex-barbell-front-squat", name: "Barbell Front Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 4, equipment: 'barbell', aliases: ["Front Squat"]},
  {id: "ex-high-bar-squat", name: "High Bar Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 5, equipment: 'barbell'},
  {id: "ex-low-bar-squat", name: "Low Bar Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 6, equipment: 'barbell'},
  {id: "ex-smith-machine-squat", name: "Smith Machine Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 7, equipment: 'smith'},
  {id: "ex-hack-squat", name: "Hack Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 8, equipment: 'machine', aliases: ["Hack"]},
  {id: "ex-pendulum-squat", name: "Pendulum Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 9, equipment: 'machine'},
  {id: "ex-belt-squat", name: "Belt Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 10, equipment: 'machine'},
  {id: "ex-goblet-squat", name: "Goblet Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 11, equipment: 'dumbbell'},
  {id: "ex-45-degree-leg-press", name: "45 Degree Leg Press", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 12, equipment: 'machine'},
  {id: "ex-horizontal-leg-press", name: "Horizontal Leg Press", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 13, equipment: 'machine'},
  {id: "ex-single-leg-press", name: "Single Leg Press", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 14, equipment: 'machine'},
  {id: "ex-single-leg-extension", name: "Single Leg Extension", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 15, equipment: 'machine'},
  {id: "ex-dumbbell-bulgarian-split-squat", name: "Dumbbell Bulgarian Split Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 16, equipment: 'dumbbell'},
  {id: "ex-smith-machine-bulgarian-split-squat", name: "Smith Machine Bulgarian Split Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 17, equipment: 'smith'},
  {id: "ex-walking-lunge", name: "Walking Lunge", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 18, equipment: 'dumbbell', aliases: ["Lunges"]},
  {id: "ex-dumbbell-walking-lunge", name: "Dumbbell Walking Lunge", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 19, equipment: 'dumbbell'},
  {id: "ex-reverse-lunge", name: "Reverse Lunge", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 20, equipment: 'dumbbell'},
  {id: "ex-forward-lunge", name: "Forward Lunge", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 21, equipment: 'dumbbell'},
  {id: "ex-smith-machine-lunge", name: "Smith Machine Lunge", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 22, equipment: 'smith'},
  {id: "ex-step-up", name: "Step-Up", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 23, equipment: 'dumbbell', aliases: ["Step Up"]},
  {id: "ex-dumbbell-step-up", name: "Dumbbell Step-Up", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 24, equipment: 'dumbbell'},
  {id: "ex-sissy-squat", name: "Sissy Squat", muscleGroup: 'quads', trackingType: 'weight_reps', sortOrder: 25, equipment: 'bodyweight'},
  {id: "ex-barbell-romanian-deadlift", name: "Barbell Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 3, equipment: 'barbell'},
  {id: "ex-dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 4, equipment: 'dumbbell', aliases: ["DB RDL"]},
  {id: "ex-smith-machine-romanian-deadlift", name: "Smith Machine Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 5, equipment: 'smith'},
  {id: "ex-stiff-leg-deadlift", name: "Stiff Leg Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 6, equipment: 'barbell', aliases: ["SLDL"]},
  {id: "ex-seated-leg-curl", name: "Seated Leg Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 7, equipment: 'machine'},
  {id: "ex-lying-leg-curl", name: "Lying Leg Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 8, equipment: 'machine'},
  {id: "ex-standing-leg-curl", name: "Standing Leg Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 9, equipment: 'machine'},
  {id: "ex-single-leg-curl", name: "Single Leg Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 10, equipment: 'machine'},
  {id: "ex-nordic-hamstring-curl", name: "Nordic Hamstring Curl", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 11, equipment: 'bodyweight', aliases: ["Nordic Curl"]},
  {id: "ex-good-morning", name: "Good Morning", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 12, equipment: 'barbell'},
  {id: "ex-barbell-good-morning", name: "Barbell Good Morning", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 13, equipment: 'barbell'},
  {id: "ex-cable-pull-through", name: "Cable Pull Through", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 14, equipment: 'cable'},
  {id: "ex-glute-ham-raise", name: "Glute Ham Raise", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 15, equipment: 'machine', aliases: ["GHR"]},
  {id: "ex-single-leg-romanian-deadlift", name: "Single Leg Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 16, equipment: 'dumbbell'},
  {id: "ex-dumbbell-single-leg-romanian-deadlift", name: "Dumbbell Single Leg Romanian Deadlift", muscleGroup: 'hamstrings', trackingType: 'weight_reps', sortOrder: 17, equipment: 'dumbbell'},
  {id: "ex-smith-machine-hip-thrust", name: "Smith Machine Hip Thrust", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 4, equipment: 'smith'},
  {id: "ex-machine-hip-thrust", name: "Machine Hip Thrust", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 5, equipment: 'machine', aliases: ["Glute Machine"]},
  {id: "ex-dumbbell-hip-thrust", name: "Dumbbell Hip Thrust", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 6, equipment: 'dumbbell'},
  {id: "ex-glute-bridge", name: "Glute Bridge", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 7, equipment: 'bodyweight'},
  {id: "ex-barbell-glute-bridge", name: "Barbell Glute Bridge", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 8, equipment: 'barbell'},
  {id: "ex-cable-kickback", name: "Cable Kickback", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 9, equipment: 'cable', aliases: ["Kickback"]},
  {id: "ex-machine-glute-kickback", name: "Machine Glute Kickback", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 10, equipment: 'machine'},
  {id: "ex-cable-hip-abduction", name: "Cable Hip Abduction", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 11, equipment: 'cable'},
  {id: "ex-standing-hip-abduction", name: "Standing Hip Abduction", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 12, equipment: 'cable'},
  {id: "ex-frog-pump", name: "Frog Pump", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 13, equipment: 'bodyweight'},
  {id: "ex-sumo-squat", name: "Sumo Squat", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 14, equipment: 'dumbbell'},
  {id: "ex-sumo-deadlift", name: "Sumo Deadlift", muscleGroup: 'glutes', trackingType: 'weight_reps', sortOrder: 15, equipment: 'barbell', aliases: ["Sumo DL"]},
  {id: "ex-standing-calf-raise", name: "Standing Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 2, equipment: 'machine', aliases: ["Standing Calves"]},
  {id: "ex-seated-calf-raise", name: "Seated Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 3, equipment: 'machine', aliases: ["Seated Calves"]},
  {id: "ex-machine-standing-calf-raise", name: "Machine Standing Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 4, equipment: 'machine'},
  {id: "ex-machine-seated-calf-raise", name: "Machine Seated Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 5, equipment: 'machine'},
  {id: "ex-leg-press-calf-raise", name: "Leg Press Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 6, equipment: 'machine'},
  {id: "ex-smith-machine-calf-raise", name: "Smith Machine Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 7, equipment: 'smith'},
  {id: "ex-single-leg-calf-raise", name: "Single Leg Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 8, equipment: 'bodyweight'},
  {id: "ex-donkey-calf-raise", name: "Donkey Calf Raise", muscleGroup: 'calves', trackingType: 'weight_reps', sortOrder: 9, equipment: 'machine'},
  {id: "ex-machine-crunch", name: "Machine Crunch", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 4, equipment: 'machine', aliases: ["Abs"]},
  {id: "ex-ab-crunch", name: "Ab Crunch", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 5, equipment: 'bodyweight', aliases: ["Crunches", "Crunch"]},
  {id: "ex-weighted-crunch", name: "Weighted Crunch", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 6, equipment: 'other'},
  {id: "ex-sit-up", name: "Sit-Up", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 7, equipment: 'bodyweight', aliases: ["Sit Up"]},
  {id: "ex-weighted-sit-up", name: "Weighted Sit-Up", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 8, equipment: 'other'},
  {id: "ex-decline-sit-up", name: "Decline Sit-Up", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 9, equipment: 'bodyweight'},
  {id: "ex-hanging-leg-raise", name: "Hanging Leg Raise", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 10, equipment: 'bodyweight'},
  {id: "ex-hanging-knee-raise", name: "Hanging Knee Raise", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 11, equipment: 'bodyweight'},
  {id: "ex-captain-s-chair-leg-raise", name: "Captain's Chair Leg Raise", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 12, equipment: 'machine'},
  {id: "ex-reverse-crunch", name: "Reverse Crunch", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 13, equipment: 'bodyweight'},
  {id: "ex-ab-wheel-rollout", name: "Ab Wheel Rollout", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 14, equipment: 'other', aliases: ["Ab Wheel", "Rollout"]},
  {id: "ex-weighted-plank", name: "Weighted Plank", muscleGroup: 'core', trackingType: 'duration', sortOrder: 15, equipment: 'other'},
  {id: "ex-side-plank", name: "Side Plank", muscleGroup: 'core', trackingType: 'duration', sortOrder: 16, equipment: 'bodyweight'},
  {id: "ex-russian-twist", name: "Russian Twist", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 17, equipment: 'bodyweight'},
  {id: "ex-cable-woodchop", name: "Cable Woodchop", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 18, equipment: 'cable', aliases: ["Woodchopper"]},
  {id: "ex-pallof-press", name: "Pallof Press", muscleGroup: 'core', trackingType: 'weight_reps', sortOrder: 19, equipment: 'cable'},
  {id: "ex-bicycle-crunch", name: "Bicycle Crunch", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 20, equipment: 'bodyweight'},
  {id: "ex-dead-bug", name: "Dead Bug", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 21, equipment: 'bodyweight'},
  {id: "ex-v-up", name: "V-Up", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 22, equipment: 'bodyweight'},
  {id: "ex-toe-touch", name: "Toe Touch", muscleGroup: 'core', trackingType: 'reps_only', sortOrder: 23, equipment: 'bodyweight'},
  {id: "ex-clean", name: "Clean", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 1, equipment: 'barbell'},
  {id: "ex-power-clean", name: "Power Clean", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 2, equipment: 'barbell'},
  {id: "ex-clean-and-jerk", name: "Clean and Jerk", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 3, equipment: 'barbell'},
  {id: "ex-snatch", name: "Snatch", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 4, equipment: 'barbell'},
  {id: "ex-dumbbell-thruster", name: "Dumbbell Thruster", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 5, equipment: 'dumbbell'},
  {id: "ex-barbell-thruster", name: "Barbell Thruster", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 6, equipment: 'barbell'},
  {id: "ex-kettlebell-swing", name: "Kettlebell Swing", muscleGroup: 'full_body', trackingType: 'weight_reps', sortOrder: 7, equipment: 'kettlebell'},
  {id: "ex-farmer-s-walk", name: "Farmer's Walk", muscleGroup: 'full_body', trackingType: 'duration', sortOrder: 8, equipment: 'other', aliases: ["Farmers Walk"]},
  {id: "ex-dumbbell-farmer-s-walk", name: "Dumbbell Farmer's Walk", muscleGroup: 'full_body', trackingType: 'duration', sortOrder: 9, equipment: 'dumbbell'},
  {id: "ex-kettlebell-farmer-s-walk", name: "Kettlebell Farmer's Walk", muscleGroup: 'full_body', trackingType: 'duration', sortOrder: 10, equipment: 'kettlebell'},
  {id: "ex-burpee", name: "Burpee", muscleGroup: 'full_body', trackingType: 'reps_only', sortOrder: 11, equipment: 'bodyweight'},
  {id: "ex-treadmill-walking", name: "Treadmill Walking", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 5, equipment: 'cardio_machine'},
  {id: "ex-outdoor-walking", name: "Outdoor Walking", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 6, equipment: 'other', aliases: ["Walking"]},
  {id: "ex-assault-bike", name: "Assault Bike", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 7, equipment: 'cardio_machine'},
  {id: "ex-spinning-bike", name: "Spinning Bike", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 8, equipment: 'cardio_machine'},
  {id: "ex-elliptical", name: "Elliptical", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 9, equipment: 'cardio_machine'},
  {id: "ex-skierg", name: "SkiErg", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 10, equipment: 'cardio_machine', aliases: ["Ski Erg"]},
  {id: "ex-swimming", name: "Swimming", muscleGroup: 'cardio', trackingType: 'distance_duration', sortOrder: 11, equipment: 'other'},
  {id: "ex-jump-rope", name: "Jump Rope", muscleGroup: 'cardio', trackingType: 'duration', sortOrder: 12, equipment: 'other', aliases: ["Skipping"]},
];

export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = SEED.map(r => ({
  id: r.id,
  name: r.name,
  muscleGroup: r.muscleGroup,
  trackingType: r.trackingType,
  sortOrder: r.sortOrder,
  equipment: r.equipment,
  aliases: r.aliases,
}));

export const MUSCLE_GROUP_ORDER: WorkoutMuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'full_body',
  'cardio',
  'legs',
  'arms',
];

export const EQUIPMENT_ORDER: ExerciseEquipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'smith',
  'kettlebell',
  'cardio_machine',
  'other',
];

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
}

/** Extra search tokens for muscle groups (EN/DA + legacy buckets). */
const MUSCLE_SEARCH_ALIASES: Record<WorkoutMuscleGroup, string[]> = {
  chest: ['chest', 'bryst'],
  back: ['back', 'ryg'],
  shoulders: ['shoulders', 'shoulder', 'skuldre', 'delts'],
  biceps: ['biceps', 'bicep', 'arms', 'arme'],
  triceps: ['triceps', 'tricep', 'arms', 'arme'],
  quads: ['quads', 'quad', 'legs', 'ben', 'thigh'],
  hamstrings: ['hamstrings', 'hamstring', 'hams', 'legs', 'ben'],
  glutes: ['glutes', 'glute'],
  calves: ['calves', 'calf', 'legs', 'ben'],
  core: ['core', 'abs', 'mave'],
  full_body: ['full body', 'fullbody', 'compound'],
  cardio: ['cardio', 'conditioning'],
  legs: ['legs', 'ben'],
  arms: ['arms', 'arme'],
};

function exerciseMatchesQuery(
  exercise: ExerciseLibraryItem,
  q: string,
): boolean {
  if (normalizeSearch(exercise.name).includes(q)) {
    return true;
  }
  if ((exercise.aliases ?? []).some(a => normalizeSearch(a).includes(q))) {
    return true;
  }
  if (normalizeSearch(exercise.muscleGroup).includes(q)) {
    return true;
  }
  const muscleAliases = MUSCLE_SEARCH_ALIASES[exercise.muscleGroup] ?? [];
  // Exact alias match only (avoids "lat" matching every back exercise via "lats")
  if (muscleAliases.some(a => normalizeSearch(a) === q)) {
    return true;
  }
  if (
    exercise.equipment &&
    normalizeSearch(exercise.equipment.replace(/_/g, ' ')).includes(q)
  ) {
    return true;
  }
  return false;
}

export function searchExerciseLibrary(
  query: string,
  items: ExerciseLibraryItem[] = EXERCISE_LIBRARY,
): ExerciseLibraryItem[] {
  const q = normalizeSearch(query);
  if (!q) {
    return items;
  }
  return items.filter(e => exerciseMatchesQuery(e, q));
}

export function groupExercisesByMuscle(
  items: ExerciseLibraryItem[],
): Array<{muscleGroup: WorkoutMuscleGroup; exercises: ExerciseLibraryItem[]}> {
  return MUSCLE_GROUP_ORDER.map(mg => ({
    muscleGroup: mg,
    exercises: items
      .filter(e => e.muscleGroup === mg)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
  })).filter(g => g.exercises.length > 0);
}

export function isLocalExerciseId(id: string | null | undefined): boolean {
  if (!id) {
    return true;
  }
  return id.startsWith('ex-') || id.startsWith('custom-');
}

/** Catalog size helper for tests/docs */
export const EXERCISE_LIBRARY_COUNT = 225;

