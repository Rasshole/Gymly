/**
 * Share Workout card — rendered at export canvas size (default 1080×1920).
 * Transparent mode: no card fill; white text + purple accents only.
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradientFallback from './ShareWorkoutBackgroundFill';
import type {
  ShareExportFormat,
  ShareWorkoutBackground,
  ShareWorkoutPayload,
  ShareWorkoutTemplate,
} from '@/types/shareWorkout.types';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';
import type {AppLanguage} from '@/i18n/types';
import {getExerciseDisplayName} from '@/i18n';
import {
  formatShareDuration,
  formatSharePrLift,
  formatShareVolumeKg,
} from '@/utils/shareWorkoutFormat';
import {shareWorkoutGymLabel} from '@/utils/shareWorkoutPrivacy';
import colors from '@/theme/colors';

const LOGO = require('@/assets/images/gymly-kettlebell-transparent.png');

export type ShareWorkoutCardProps = {
  payload: ShareWorkoutPayload;
  template: ShareWorkoutTemplate;
  background: ShareWorkoutBackground;
  language: AppLanguage;
  selectedPrIndex?: number;
  format?: ShareExportFormat;
  showGym?: boolean;
  backgroundPhotoUri?: string | null;
  /** Copy strings (from i18n) so the card stays presentation-only */
  copy: {
    workoutComplete: string;
    exercises: string;
    sets: string;
    volume: string;
    dayStreak: string;
    newPr: string;
    strongestSet: string;
    showingUp: string;
    brand: string;
    tagline: string;
  };
};

function textColors(background: ShareWorkoutBackground) {
  if (background === 'transparent' || background === 'photo') {
    return {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.92)',
      muted: 'rgba(255,255,255,0.78)',
      accent: colors.primaryLight,
    };
  }
  if (background === 'purple') {
    return {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.9)',
      muted: 'rgba(255,255,255,0.75)',
      accent: '#E9D5FF',
    };
  }
  return {
    primary: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textTertiary,
    accent: colors.primaryDark,
  };
}

function shadowStyle(background: ShareWorkoutBackground) {
  if (background === 'transparent' || background === 'photo') {
    return {
      textShadowColor: 'rgba(0,0,0,0.72)',
      textShadowOffset: {width: 0, height: 2} as const,
      textShadowRadius: 6,
    };
  }
  return {};
}

const ShareWorkoutCard: React.FC<ShareWorkoutCardProps> = ({
  payload,
  template,
  background,
  language,
  selectedPrIndex = 0,
  format = SHARE_EXPORT_FORMATS.stories,
  showGym = false,
  backgroundPhotoUri,
  copy,
}) => {
  const c = textColors(background);
  const shadow = shadowStyle(background);
  const hasPr = payload.prs.length > 0;
  const volumeLine = formatShareVolumeKg(
    payload.totalVolumeKg,
    language,
    copy.volume,
  );
  const durationLine = formatShareDuration(payload.durationMinutes);
  const gymLine = shareWorkoutGymLabel(payload.gymName, showGym);
  const pr =
    payload.prs[
      Math.min(Math.max(0, selectedPrIndex), Math.max(0, payload.prs.length - 1))
    ] ?? null;

  const canvasBg =
    background === 'transparent'
      ? 'transparent'
      : background === 'photo'
        ? undefined
        : undefined;

  return (
    <View
      collapsable={false}
      style={[
        styles.canvas,
        {
          width: format.width,
          height: format.height,
          backgroundColor: canvasBg,
        },
      ]}>
      {background === 'photo' && backgroundPhotoUri ? (
        <Image
          source={{uri: backgroundPhotoUri}}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {background !== 'transparent' && background !== 'photo' ? (
        <LinearGradientFallback variant={background} />
      ) : null}

      {background === 'photo' && backgroundPhotoUri ? (
        <View pointerEvents="none" style={styles.photoScrim} />
      ) : null}

      <View style={styles.content} collapsable={false}>
        {template === 'summary' ? (
          <View style={styles.block} collapsable={false}>
            {hasPr ? (
              <View style={styles.prPill}>
                <Text style={[styles.prPillText, shadow]}>{copy.newPr}</Text>
              </View>
            ) : null}

            <Text style={[styles.eyebrow, {color: c.accent}, shadow]}>
              {copy.workoutComplete}
            </Text>

            {payload.muscleGroupsLabel ? (
              <Text style={[styles.muscles, {color: c.secondary}, shadow]}>
                {payload.muscleGroupsLabel}
              </Text>
            ) : null}

            {durationLine ? (
              <Text style={[styles.hero, {color: c.primary}, shadow]}>
                {durationLine}
              </Text>
            ) : null}

            {volumeLine ? (
              <Text style={[styles.volumeLine, {color: c.primary}, shadow]}>
                {volumeLine}
              </Text>
            ) : null}

            {gymLine ? (
              <Text style={[styles.gymLine, {color: c.muted}, shadow]}>
                {gymLine}
              </Text>
            ) : null}

            {payload.streakDays > 0 ? (
              <Text style={[styles.streak, {color: c.accent}, shadow]}>
                🔥 {payload.streakDays} {copy.dayStreak}
              </Text>
            ) : null}
          </View>
        ) : null}

        {template === 'pr' && pr ? (
          <View style={styles.block} collapsable={false}>
            <Text style={[styles.eyebrow, {color: c.accent}, shadow]}>
              {copy.newPr}
            </Text>
            <Text style={[styles.prExercise, {color: c.primary}, shadow]}>
              {getExerciseDisplayName({
                exerciseId: null,
                fallbackName: pr.exerciseName,
                language,
              })}
            </Text>
            <Text style={[styles.prLift, {color: c.primary}, shadow]}>
              {formatSharePrLift(pr.weightKg, pr.reps)}
            </Text>
            <Text style={[styles.meta, {color: c.muted}, shadow]}>
              {copy.strongestSet}
            </Text>
          </View>
        ) : null}

        {template === 'streak' ? (
          <View style={styles.block} collapsable={false}>
            <Text style={[styles.streakHero, {color: c.primary}, shadow]}>
              {payload.streakDays} {copy.dayStreak.toUpperCase()} 🔥
            </Text>
            <Text style={[styles.streakTagline, {color: c.accent}, shadow]}>
              {copy.showingUp}
            </Text>
          </View>
        ) : null}

        <View style={styles.brandRow} collapsable={false}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.brand, {color: c.primary}, shadow]}>
            {copy.brand}
          </Text>
          <Text style={[styles.tagline, {color: c.accent}, shadow]}>
            {copy.tagline}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    overflow: 'hidden',
    position: 'relative',
  },
  photoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 96,
    paddingTop: 300,
    paddingBottom: 160,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  block: {
    width: '100%',
    alignItems: 'center',
  },
  prPill: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginBottom: 32,
  },
  prPillText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  eyebrow: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginBottom: 32,
    textTransform: 'uppercase',
  },
  muscles: {
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 52,
  },
  hero: {
    fontSize: 112,
    fontWeight: '900',
    letterSpacing: -2,
    textAlign: 'center',
    marginBottom: 28,
  },
  volumeLine: {
    fontSize: 44,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
  },
  gymLine: {
    fontSize: 34,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  meta: {
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  streak: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 28,
  },
  prExercise: {
    fontSize: 56,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  prLift: {
    fontSize: 72,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 24,
  },
  streakHero: {
    fontSize: 72,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 36,
  },
  streakTagline: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  brandRow: {
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 80,
    height: 80,
  },
  brand: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 5,
  },
  tagline: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});

export default ShareWorkoutCard;
