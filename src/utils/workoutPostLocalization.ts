/**
 * Viewer-language localization for workout feed posts.
 * Structured keys + legacy display-label reverse mapping; no destructive DB rewrites.
 */

import {formatRelativeTime} from '@/utils/formatRelativeTime';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import type {AppLanguage} from '@/i18n/types';
import {getExerciseDisplayName} from '@/i18n/exerciseNames';
import {getRuntimeLanguage} from '@/i18n/runtimeLanguage';
import {getTranslations, getFallbackTranslations} from '@/i18n/translations';
import {getReadyLocaleIds} from '@/i18n/localeRegistry';
import {hasTranslationModule} from '@/i18n/types';
import {createTranslator} from '@/i18n/translate';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import type {WorkoutPostActivityKind, WorkoutPostRow} from '@/types/post.types';
import {
  formatWorkoutTypeDisplay,
  resolveMuscleTokenToKey,
} from '@/utils/muscleGroupLabels';

export type FeedActivityKind = WorkoutPostActivityKind;

export type ResolvedFeedActivity = {
  kind: FeedActivityKind;
  exerciseName?: string;
  prCount?: number;
  badgeId?: string;
  badgeEmoji?: string;
  badgeName?: string;
};

const ACTIVITY_KINDS = new Set<string>([
  'finished_workout',
  'beat_pr',
  'hit_pr',
  'hit_n_prs',
  'badge_unlocked',
]);

export function isFeedActivityKind(value: unknown): value is FeedActivityKind {
  return typeof value === 'string' && ACTIVITY_KINDS.has(value);
}

function splitMuscleTokens(raw: string): string[] {
  return raw
    .split(/[,&/|]+|\s+og\s+|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Normalize stored `posts.workout_type` (keys or legacy "Ryg, Triceps") to comma-separated keys.
 * Unknown tokens are kept as-is so display can fall back without inventing data.
 */
export function normalizeWorkoutTypeToKeys(stored: string | null | undefined): string {
  if (!stored?.trim()) {
    return '';
  }
  const parts = splitMuscleTokens(stored);
  if (parts.length === 0) {
    return '';
  }
  return parts
    .map(part => {
      const key = resolveMuscleTokenToKey(part);
      return key ?? part.trim();
    })
    .join(',');
}

/** Format workout type for the viewer language (handles keys + legacy labels). */
export function formatWorkoutTypeForViewer(
  stored: string | null | undefined,
  language: AppLanguage = getRuntimeLanguage(),
): string {
  const keys = normalizeWorkoutTypeToKeys(stored);
  if (!keys) {
    return formatWorkoutTypeDisplay('cardio', language);
  }
  return formatWorkoutTypeDisplay(keys, language);
}

export function buildWorkoutInfoLine(params: {
  centerLabel: string;
  durationMinutes: number;
  workoutTypeStored: string | null | undefined;
  language?: AppLanguage;
}): string {
  const language = params.language ?? getRuntimeLanguage();
  const typeLabel = formatWorkoutTypeForViewer(params.workoutTypeStored, language);
  const durationLabel = formatWorkoutDuration(params.durationMinutes, language);
  return `${params.centerLabel} · ${durationLabel} · ${typeLabel}`;
}

/**
 * Caption shown under a post. System "finished a workout" lines are omitted
 * because the header and summary already say who trained and what they did.
 * Other system lines (PRs, badges) are rewritten in the viewer's language
 * without repeating the author's name.
 */
export function displayFeedCaption(
  caption: string | null | undefined,
  language: AppLanguage = getRuntimeLanguage(),
): string {
  const text = (caption ?? '').trim();
  if (!text) {
    return '';
  }
  const matched = matchSystemGeneratedCaption(text);
  if (!matched) {
    return text;
  }
  if (matched.kind === 'finished_workout') {
    return '';
  }
  return formatFeedActivityCaption({
    activity: matched,
    authorDisplayName: '',
    includeName: false,
    language,
  });
}

/**
 * Prefer structured keys, then snapshot localization, then legacy workout_type reverse-map.
 */
export function resolvePostMuscleKeys(row: {
  workout_type?: string | null;
  workout_type_keys?: string | null;
  workout_snapshot?: SharedWorkoutSnapshot | null;
}): string {
  const fromCol = row.workout_type_keys?.trim();
  if (fromCol) {
    return normalizeWorkoutTypeToKeys(fromCol) || fromCol;
  }
  const fromSnap = row.workout_snapshot?.localization?.muscleGroupKeys?.trim();
  if (fromSnap) {
    return normalizeWorkoutTypeToKeys(fromSnap) || fromSnap;
  }
  return normalizeWorkoutTypeToKeys(row.workout_type);
}

function enrichActivityFromKind(
  kind: FeedActivityKind,
  snapshot: SharedWorkoutSnapshot | null | undefined,
  language: AppLanguage,
): ResolvedFeedActivity {
  if (kind === 'badge_unlocked') {
    return {
      kind,
      badgeId: snapshot?.badgeId,
      badgeEmoji: snapshot?.badgeEmoji,
      badgeName: snapshot?.badgeName,
    };
  }
  const prs = snapshot?.prs ?? [];
  if (kind === 'hit_n_prs') {
    return {kind, prCount: prs.length > 0 ? prs.length : undefined};
  }
  if ((kind === 'beat_pr' || kind === 'hit_pr') && prs.length >= 1) {
    return {
      kind,
      exerciseName: getExerciseDisplayName({
        exerciseId: null,
        fallbackName: prs[0].exerciseName,
        language,
      }),
    };
  }
  if (kind === 'beat_pr' || kind === 'hit_pr') {
    const t = translatorFor(language);
    return {
      kind,
      exerciseName: t('prCopy.exerciseFallback'),
    };
  }
  return {kind: 'finished_workout'};
}

/**
 * Dual-write payload: legacy columns stay human-readable for old clients;
 * structured keys + activity_kind power viewer-language rendering on new clients.
 */
export function buildCompatibleWorkoutPostWriteFields(params: {
  authorDisplayName: string;
  /** Session keys or legacy labels — normalized to keys. */
  workoutType: string;
  userCaption: string;
  snapshot?: SharedWorkoutSnapshot | null;
  language?: AppLanguage;
}): {
  caption: string;
  workout_type: string;
  workout_type_keys: string;
  activity_kind: FeedActivityKind | null;
  workout_snapshot: SharedWorkoutSnapshot | null;
} {
  const language = params.language ?? getRuntimeLanguage();
  const keys =
    normalizeWorkoutTypeToKeys(params.workoutType) || params.workoutType.trim();
  const legacyWorkoutType = formatWorkoutTypeDisplay(keys || 'cardio', language);
  const userCaption = params.userCaption.trim();

  let activityKind: FeedActivityKind | null = null;
  let caption = userCaption;

  if (!userCaption) {
    const derived = resolveFeedActivity({
      caption: '',
      snapshot: params.snapshot,
      treatEmptyAsSystem: true,
    });
    activityKind = derived?.kind ?? 'finished_workout';
    const activity = derived ?? {kind: 'finished_workout' as const};
    caption = formatFeedActivityCaption({
      activity,
      authorDisplayName: params.authorDisplayName,
      includeName: true,
      language,
    });
  }

  let snapshot = params.snapshot ?? null;
  if (snapshot) {
    snapshot = {
      ...snapshot,
      localization: {
        muscleGroupKeys: keys,
        activityKind,
      },
    };
  }

  return {
    caption,
    workout_type: legacyWorkoutType,
    workout_type_keys: keys,
    activity_kind: activityKind,
    workout_snapshot: snapshot,
  };
}

/** Simulate what an older client shows (raw caption + workout_type only). */
export function readPostAsLegacyClient(row: Pick<WorkoutPostRow, 'caption' | 'workout_type'>): {
  caption: string;
  workoutType: string;
} {
  return {
    caption: row.caption || '',
    workoutType: row.workout_type || '',
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex from an i18n template like "{{name}} finished a workout 💪".
 */
function templateToRegex(template: string): RegExp | null {
  if (!template?.trim()) {
    return null;
  }
  let pattern = '';
  const re = /\{\{(\w+)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    pattern += escapeRegExp(template.slice(last, match.index));
    const key = match[1];
    if (key === 'count') {
      pattern += '(\\d+)';
    } else {
      pattern += '(.+?)';
    }
    last = match.index + match[0].length;
  }
  pattern += escapeRegExp(template.slice(last));
  try {
    return new RegExp(`^${pattern}$`, 'u');
  } catch {
    return null;
  }
}

type TemplateSpec = {
  kind: FeedActivityKind;
  leaf: 'finishedWorkout' | 'beatPr' | 'hitPr' | 'hitNPrs';
};

const AUTO_CAPTION_SPECS: TemplateSpec[] = [
  {kind: 'finished_workout', leaf: 'finishedWorkout'},
  {kind: 'beat_pr', leaf: 'beatPr'},
  {kind: 'hit_pr', leaf: 'hitPr'},
  {kind: 'hit_n_prs', leaf: 'hitNPrs'},
];

type AutoCaptionPattern = {
  kind: FeedActivityKind;
  regex: RegExp;
  hasExercise: boolean;
  hasCount: boolean;
};

let cachedAutoPatterns: AutoCaptionPattern[] | null = null;

function getAutoCaptionPatterns(): AutoCaptionPattern[] {
  if (cachedAutoPatterns) {
    return cachedAutoPatterns;
  }
  // Ready ∩ installed only — never force-load planned RTL packs (ar/he) for caption regex.
  // Still lazy: each getTranslations() evaluates that pack once when patterns first build.
  const locales = getReadyLocaleIds().filter(id => hasTranslationModule(id));
  const out: AutoCaptionPattern[] = [];
  for (const spec of AUTO_CAPTION_SPECS) {
    for (const locale of locales) {
      const dict = getTranslations(locale as Parameters<typeof getTranslations>[0]) as Record<
        string,
        unknown
      >;
      const prCopy = dict.prCopy as Record<string, string> | undefined;
      const raw = prCopy?.[spec.leaf];
      if (!raw) {
        continue;
      }
      const regex = templateToRegex(raw);
      if (!regex) {
        continue;
      }
      out.push({
        kind: spec.kind,
        regex,
        hasExercise: raw.includes('{{exercise}}'),
        hasCount: raw.includes('{{count}}'),
      });
    }
  }
  cachedAutoPatterns = out;
  return out;
}

/**
 * Detect a known system-generated auto-caption (any supported author language).
 * Returns null for user-written captions.
 */
export function matchSystemGeneratedCaption(
  caption: string | null | undefined,
): ResolvedFeedActivity | null {
  const text = (caption ?? '').trim();
  if (!text) {
    return null;
  }
  for (const pattern of getAutoCaptionPatterns()) {
    const m = text.match(pattern.regex);
    if (!m) {
      continue;
    }
    if (pattern.kind === 'finished_workout') {
      return {kind: 'finished_workout'};
    }
    if (pattern.kind === 'hit_n_prs') {
      // Template order: {{name}} … {{count}}
      const count = Number(m[2] ?? m[1]);
      return {
        kind: 'hit_n_prs',
        prCount: Number.isFinite(count) ? count : undefined,
      };
    }
    if (pattern.hasExercise) {
      return {
        kind: pattern.kind,
        exerciseName: (m[2] ?? '').trim() || undefined,
      };
    }
    return {kind: pattern.kind};
  }
  return null;
}

/**
 * Prefer structured snapshot for activity kind when caption is empty (new posts)
 * or when caption matches a known auto template (legacy).
 */
export function resolveFeedActivity(params: {
  caption: string | null | undefined;
  snapshot?: SharedWorkoutSnapshot | null;
  /** When true, empty caption is treated as system "finished workout" (new posts). */
  treatEmptyAsSystem?: boolean;
}): ResolvedFeedActivity | null {
  const caption = (params.caption ?? '').trim();
  const prs = params.snapshot?.prs ?? [];
  const language = getRuntimeLanguage();

  if (!caption) {
    if (!params.treatEmptyAsSystem) {
      return null;
    }
    if (prs.length === 0) {
      return {kind: 'finished_workout'};
    }
    if (prs.length === 1) {
      const ex = prs[0];
      const exerciseName = getExerciseDisplayName({
        exerciseId: null,
        fallbackName: ex.exerciseName,
        language,
      });
      const useAlt = exerciseName.length % 2 === 1;
      return {
        kind: useAlt ? 'beat_pr' : 'hit_pr',
        exerciseName,
      };
    }
    return {kind: 'hit_n_prs', prCount: prs.length};
  }

  const matched = matchSystemGeneratedCaption(caption);
  if (!matched) {
    return null;
  }

  if (matched.kind === 'hit_n_prs' && prs.length > 1) {
    return {kind: 'hit_n_prs', prCount: prs.length};
  }
  if ((matched.kind === 'beat_pr' || matched.kind === 'hit_pr') && prs.length === 1) {
    const ex = prs[0];
    return {
      kind: matched.kind,
      exerciseName: getExerciseDisplayName({
        exerciseId: null,
        fallbackName: matched.exerciseName || ex.exerciseName,
        language,
      }),
    };
  }
  return matched;
}

/**
 * New-client activity resolution: structured activity_kind first, then legacy caption match.
 */
export function resolvePostActivity(
  row: {
    caption?: string | null;
    activity_kind?: string | null;
    workout_snapshot?: SharedWorkoutSnapshot | null;
  },
  language: AppLanguage = getRuntimeLanguage(),
): ResolvedFeedActivity | null {
  const structured =
    row.activity_kind ?? row.workout_snapshot?.localization?.activityKind ?? null;
  if (isFeedActivityKind(structured)) {
    return enrichActivityFromKind(structured, row.workout_snapshot, language);
  }
  return resolveFeedActivity({
    caption: row.caption,
    snapshot: row.workout_snapshot,
    treatEmptyAsSystem: false,
  });
}

function translatorFor(language: AppLanguage) {
  return createTranslator(getTranslations(language), getFallbackTranslations());
}

export function formatFeedActivityCaption(params: {
  activity: ResolvedFeedActivity;
  authorDisplayName: string;
  /** When false, omit the name (Home already shows bold username). */
  includeName: boolean;
  language?: AppLanguage;
}): string {
  const language = params.language ?? getRuntimeLanguage();
  const t = translatorFor(language);
  const firstName =
    params.authorDisplayName.trim().split(/\s+/)[0] || t('prCopy.someone');

  const exercise =
    params.activity.exerciseName || t('prCopy.exerciseFallback');
  const count = params.activity.prCount ?? 0;

  if (!params.includeName) {
    switch (params.activity.kind) {
      case 'finished_workout':
        return t('prCopy.finishedWorkoutBody');
      case 'beat_pr':
        return t('prCopy.beatPrBody', {exercise});
      case 'hit_pr':
        return t('prCopy.hitPrBody', {exercise});
      case 'hit_n_prs':
        return t('prCopy.hitNPrsBody', {count});
      case 'badge_unlocked': {
        const badge =
          params.activity.badgeName ||
          params.activity.badgeEmoji ||
          'badge';
        return t('prCopy.badgeUnlockedBody', {
          badge,
          emoji: params.activity.badgeEmoji || '🏆',
        });
      }
      default:
        return t('prCopy.finishedWorkoutBody');
    }
  }

  switch (params.activity.kind) {
    case 'finished_workout':
      return t('prCopy.finishedWorkout', {name: firstName});
    case 'beat_pr':
      return t('prCopy.beatPr', {name: firstName, exercise});
    case 'hit_pr':
      return t('prCopy.hitPr', {name: firstName, exercise});
    case 'hit_n_prs':
      return t('prCopy.hitNPrs', {name: firstName, count});
    case 'badge_unlocked': {
      const badge =
        params.activity.badgeName ||
        params.activity.badgeEmoji ||
        'badge';
      return t('prCopy.badgeUnlocked', {
        name: firstName,
        badge,
        emoji: params.activity.badgeEmoji || '🏆',
      });
    }
    default:
      return t('prCopy.finishedWorkout', {name: firstName});
  }
}

export function authorFirstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName.trim();
}

/** Caption for profile cards: system activity includes name once; custom text unchanged. */
export function formatFeedItemCaptionForProfile(item: {
  user: string;
  description: string;
  isSystemActivity?: boolean;
  activityKind?: FeedActivityKind | null;
  activityExerciseName?: string;
  activityPrCount?: number;
  captionSource?: string;
}, language?: AppLanguage): string {
  if (item.isSystemActivity && item.activityKind) {
    return formatFeedActivityCaption({
      activity: {
        kind: item.activityKind,
        exerciseName: item.activityExerciseName,
        prCount: item.activityPrCount,
      },
      authorDisplayName: item.user,
      includeName: true,
      language,
    });
  }
  if (item.captionSource?.trim()) {
    const matched = matchSystemGeneratedCaption(item.captionSource);
    if (matched) {
      return formatFeedActivityCaption({
        activity: matched,
        authorDisplayName: item.user,
        includeName: true,
        language,
      });
    }
    return item.captionSource;
  }
  return item.description;
}

/** Re-localize display fields on an already-mapped feed item (language switch). */
export function relocalizeFeedDisplayFields<
  T extends {
    user: string;
    description: string;
    workoutInfo?: string;
    timestamp: string;
    workoutTypeSource?: string;
    centerName?: string;
    durationMinutes?: number;
    createdAt?: string;
    captionSource?: string;
    isSystemActivity?: boolean;
    activityKind?: FeedActivityKind | null;
    activityExerciseName?: string;
    activityPrCount?: number;
    workoutSnapshot?: SharedWorkoutSnapshot;
  },
>(item: T, language: AppLanguage): T {
  let workoutInfo = item.workoutInfo;
  if (
    item.centerName != null &&
    item.durationMinutes != null &&
    item.workoutTypeSource != null
  ) {
    workoutInfo = buildWorkoutInfoLine({
      centerLabel: item.centerName,
      durationMinutes: item.durationMinutes,
      workoutTypeStored: item.workoutTypeSource,
      language,
    });
  } else if (item.workoutInfo) {
    // Demo / legacy in-memory items: remapping the type segment only
    const parts = item.workoutInfo.split('·').map(p => p.trim());
    if (parts.length >= 3) {
      const typePart = parts.slice(2).join(' · ');
      parts[2] = formatWorkoutTypeForViewer(typePart, language);
      workoutInfo = `${parts[0]} · ${parts[1]} · ${parts[2]}`;
    }
  }

  let description = item.description;
  if (item.isSystemActivity && item.activityKind) {
    description = formatFeedActivityCaption({
      activity: {
        kind: item.activityKind,
        exerciseName: item.activityExerciseName,
        prCount: item.activityPrCount,
      },
      authorDisplayName: item.user,
      includeName: false,
      language,
    });
  } else if (item.captionSource != null && item.captionSource.trim()) {
    const matched = matchSystemGeneratedCaption(item.captionSource);
    if (matched) {
      description = formatFeedActivityCaption({
        activity: matched,
        authorDisplayName: item.user,
        includeName: false,
        language,
      });
    } else {
      description = item.captionSource;
    }
  }

  const timestamp = item.createdAt
    ? formatRelativeTime(new Date(item.createdAt), language)
    : item.timestamp;

  return {
    ...item,
    workoutInfo,
    description,
    timestamp,
  };
}
