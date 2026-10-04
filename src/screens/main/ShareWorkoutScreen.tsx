/**
 * Share a completed workout as a feed post, with story export kept underneath.
 * Params: { sessionId } — always the completed check_ins.id.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ViewShot, {type ViewShotRef} from 'react-native-view-shot';
import {
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import ShareWorkoutCard from '@/components/shareWorkout/ShareWorkoutCard';
import {useAppStore} from '@/store/appStore';
import {useWorkoutLogStore} from '@/store/workoutLogStore';
import {useTranslation, getRuntimeLanguage, getExerciseDisplayName} from '@/i18n';
import type {AppLanguage} from '@/i18n/types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {buildShareWorkoutPayload} from '@/services/shareWorkout/buildShareWorkoutPayload';
import {
  captureShareWorkoutImage,
  saveShareWorkoutImage,
  shareShareWorkoutImage,
  shareShareWorkoutToInstagramStories,
} from '@/services/shareWorkout/shareWorkoutExport';
import {
  createWorkoutPost,
  refreshWorkoutFeedFromServer,
} from '@/services/supabase/workoutPostService';
import {buildSharedWorkoutSnapshot} from '@/services/supabase/personalRecordService';
import {supabase} from '@/services/supabase/supabaseClient';
import type {
  ShareWorkoutPayload,
  ShareWorkoutTemplate,
} from '@/types/shareWorkout.types';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';
import type {ProfileVisibility} from '@/types/user.types';
import type {DetectedPersonalRecord} from '@/types/personalRecord.types';
import {formatVolumeKg, formatWeightKg} from '@/utils/workoutLogFormat';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import {shouldInsertWorkoutPost} from '@/utils/shareComposer';

export type ShareWorkoutParams = {
  ShareWorkout: {sessionId: string};
};

const AUDIENCES: ProfileVisibility[] = [
  'friends',
  'friends_and_gyms',
  'everyone',
  'private',
];

function audienceLabelKey(audience: ProfileVisibility): string {
  switch (audience) {
    case 'friends':
      return 'editProfile.visibilityFriends';
    case 'friends_and_gyms':
      return 'editProfile.visibilityFriendsAndGyms';
    case 'everyone':
      return 'editProfile.visibilityEveryone';
    case 'private':
      return 'editProfile.visibilityPrivate';
  }
}

async function findExistingPostId(
  userId: string,
  sessionId: string,
): Promise<string | null> {
  const {data, error} = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', userId)
    .eq('check_in_id', sessionId)
    .limit(1);
  if (error || !data?.length) {
    return null;
  }
  return String((data[0] as {id: string}).id);
}

const ShareWorkoutScreen: React.FC = () => {
  const {t, language} = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ShareWorkoutParams, 'ShareWorkout'>>();
  const insets = useSafeAreaInsets();
  const user = useAppStore(s => s.user);
  const userId = user?.id;
  const sessionId = route.params?.sessionId;
  const appLanguage = getRuntimeLanguage() as AppLanguage;

  const captureRef = useRef<ViewShotRef>(null);
  const publishLock = useRef(false);

  const [payload, setPayload] = useState<ShareWorkoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [caption, setCaption] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showGym, setShowGym] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [audience, setAudience] = useState<ProfileVisibility>(
    user?.privacySettings?.profileVisibility ?? 'friends',
  );
  const [outcome, setOutcome] = useState<'shared' | 'saved' | null>(null);

  const copy = useMemo(
    () => ({
      workoutComplete: t('shareWorkout.cardWorkoutComplete'),
      exercises: t('shareWorkout.cardExercises'),
      sets: t('shareWorkout.cardSets'),
      volume: t('shareWorkout.cardVolume'),
      dayStreak: t('shareWorkout.cardDayStreak'),
      newPr: t('shareWorkout.cardNewPr'),
      strongestSet: t('shareWorkout.cardStrongestSet'),
      showingUp: t('shareWorkout.cardShowingUp'),
      brand: 'GYMLY',
      tagline: t('shareWorkout.cardTagline'),
    }),
    [t],
  );

  const pickPhoto = useCallback(() => {
    launchImageLibrary(
      {mediaType: 'photo', quality: 0.8, selectionLimit: 1},
      (response: ImagePickerResponse) => {
        const uri = response.assets?.[0]?.uri;
        if (uri) {
          setPhotoUri(uri);
        }
      },
    );
  }, []);

  const load = useCallback(async () => {
    if (!userId || !sessionId) {
      setError(t('shareWorkout.missingSession'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await buildShareWorkoutPayload({
        sessionId,
        userId,
        language: appLanguage,
      });
      if (data.sessionId !== sessionId) {
        throw new Error(t('shareWorkout.sessionMismatch'));
      }
      setPayload(data);
    } catch (e: any) {
      setPayload(null);
      setError(e?.message ?? t('shareWorkout.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, sessionId, appLanguage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const template: ShareWorkoutTemplate = 'summary';
  const format = SHARE_EXPORT_FORMATS.stories;
  const exportBackground = photoUri ? 'photo' : 'white';

  const runCapture = useCallback(async () => {
    if (!captureRef.current) {
      throw new Error(t('shareWorkout.captureFailed'));
    }
    return captureShareWorkoutImage({
      viewRef: captureRef as any,
      background: exportBackground,
      format,
    });
  }, [exportBackground, format, t]);

  const leaveAfter = useCallback(
    (next: 'shared' | 'saved') => {
      setOutcome(next);
      setTimeout(() => {
        navigation.goBack();
      }, 900);
    },
    [navigation],
  );

  const handlePublish = useCallback(async () => {
    if (!payload || !userId || publishLock.current || outcome) {
      return;
    }
    publishLock.current = true;
    setBusy(true);
    try {
      await useWorkoutLogStore.getState().flush();
      const existingPostId = await findExistingPostId(userId, payload.sessionId);
      const insert = shouldInsertWorkoutPost({
        audience,
        existingPostId,
        alreadySubmitted: false,
      });
      if (!insert) {
        leaveAfter(audience === 'private' && !existingPostId ? 'saved' : 'shared');
        return;
      }
      const prs: DetectedPersonalRecord[] = payload.prs.map(pr => ({
        recordType: pr.recordType,
        exerciseId: null,
        exerciseName: pr.exerciseName,
        weightKg: pr.weightKg,
        reps: pr.reps,
        previousWeightKg: null,
        previousReps: null,
      }));
      const workoutSnapshot = await buildSharedWorkoutSnapshot(
        payload.sessionId,
        payload.durationMinutes ?? 0,
        prs,
        payload.exercises,
      );
      await createWorkoutPost({
        userId,
        authorDisplayName: user?.displayName?.trim() || '',
        mediaUri: photoUri ?? undefined,
        caption: caption.trim(),
        durationMinutes: payload.durationMinutes ?? 0,
        centerName: showGym ? payload.gymName : '',
        workoutTypeLabel: payload.muscleGroupsLabel,
        moodRating: null,
        checkInId: payload.sessionId,
        workoutSnapshot,
      });
      await refreshWorkoutFeedFromServer();
      leaveAfter('shared');
    } catch (e: any) {
      publishLock.current = false;
      Alert.alert(
        t('checkIn.couldNotShare'),
        e?.message ? t('checkIn.shareFailedBody') : t('checkIn.shareFailedBody'),
      );
    } finally {
      setBusy(false);
    }
  }, [
    payload,
    userId,
    user?.displayName,
    outcome,
    audience,
    photoUri,
    caption,
    showGym,
    leaveAfter,
    t,
  ]);

  const handleSave = useCallback(async () => {
    if (!payload || exporting || busy) {
      return;
    }
    setExporting(true);
    try {
      const uri = await runCapture();
      await saveShareWorkoutImage(uri);
    } catch (e: any) {
      Alert.alert(t('shareWorkout.prepareFailed'), e?.message ?? '');
    } finally {
      setExporting(false);
    }
  }, [payload, exporting, busy, runCapture, t]);

  const handleNativeShareOnly = useCallback(async () => {
    if (!payload || exporting || busy) {
      return;
    }
    setExporting(true);
    try {
      const uri = await runCapture();
      const ig = await shareShareWorkoutToInstagramStories({
        uri,
        background: exportBackground,
      });
      if (ig !== 'shared') {
        await shareShareWorkoutImage({
          uri,
          message: caption.trim() || t('shareWorkout.shareMessage'),
        });
      }
    } catch (e: any) {
      Alert.alert(t('shareWorkout.prepareFailed'), e?.message ?? '');
    } finally {
      setExporting(false);
    }
  }, [payload, exporting, busy, runCapture, exportBackground, caption, t]);

  const statsLine = payload
    ? t('workoutHistory.summaryLine', {
        exercises: payload.exerciseCount,
        sets: payload.setCount,
        volume: formatVolumeKg(payload.totalVolumeKg),
      })
    : '';

  const metaLine = payload
    ? [payload.gymName, formatWorkoutDuration(payload.durationMinutes ?? 0, language)]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={t('shareWorkout.composerTitle')}
        onBack={() => navigation.goBack()}
      />

      {loading && !payload ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error && !payload ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>{t('shareWorkout.loadFailed')}</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : payload ? (
        <>
          <View pointerEvents="none" style={styles.offscreen} collapsable={false}>
            <ViewShot
              ref={captureRef}
              options={{
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: format.width,
                height: format.height,
              }}
              style={{
                width: format.width,
                height: format.height,
                backgroundColor: colors.white,
              }}>
              <ShareWorkoutCard
                payload={payload}
                template={template}
                background={exportBackground}
                language={appLanguage}
                format={format}
                showGym={showGym}
                backgroundPhotoUri={photoUri}
                copy={copy}
              />
            </ViewShot>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>
            <View style={styles.preview}>
              {photoUri ? (
                <View>
                  <Image source={{uri: photoUri}} style={styles.previewImage} />
                  <View style={styles.photoActions}>
                    <TouchableOpacity onPress={pickPhoto} disabled={busy}>
                      <Text style={styles.photoActionText}>
                        {t('shareWorkout.replacePhoto')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPhotoUri(null)}
                      disabled={busy}>
                      <Text style={styles.photoActionText}>
                        {t('shareWorkout.removePhoto')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              {caption.trim() ? (
                <Text style={styles.previewCaption}>{caption.trim()}</Text>
              ) : null}
              <Text style={styles.previewMeta}>{metaLine}</Text>
              <Text style={styles.previewStats}>{statsLine}</Text>
              {payload.prs.length > 0 ? (
                <Text style={styles.previewPr}>
                  {payload.prs.length === 1
                    ? t('personalRecords.oneNewPr')
                    : t('personalRecords.nNewPrs', {count: payload.prs.length})}
                </Text>
              ) : null}
            </View>

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t('shareWorkout.captionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={styles.caption}
              multiline
              maxLength={500}
              editable={!busy && !outcome}
              textAlignVertical="top"
            />

            {photoUri ? null : (
              <TouchableOpacity
                style={styles.addPhoto}
                onPress={pickPhoto}
                disabled={busy || !!outcome}>
                <Icon name="image-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.addPhotoText}>{t('shareWorkout.addPhoto')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.logToggle}
              onPress={() => setLogOpen(open => !open)}>
              <Text style={styles.logToggleText}>
                {logOpen ? t('shareWorkout.hideLog') : t('shareWorkout.seeLog')}
              </Text>
              <Icon
                name={logOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.primaryDark}
              />
            </TouchableOpacity>

            {logOpen ? (
              <View style={styles.log}>
                {payload.exercises.length === 0 ? (
                  <Text style={styles.logEmpty}>
                    {t('workoutHistory.noExercisesLogged')}
                  </Text>
                ) : (
                  payload.exercises.map(exercise => (
                    <View key={exercise.id} style={styles.logExercise}>
                      <Text style={styles.logName}>
                        {getExerciseDisplayName({
                          exerciseId: exercise.exerciseId,
                          fallbackName: exercise.exerciseName,
                          language,
                        })}
                      </Text>
                      {exercise.sets.map(set => {
                        const isPr = payload.prs.some(
                          pr =>
                            pr.exerciseName.trim().toLowerCase() ===
                              exercise.exerciseName.trim().toLowerCase() &&
                            pr.weightKg === set.weightKg &&
                            pr.reps === set.reps,
                        );
                        return (
                          <Text key={set.id} style={styles.logSet}>
                            {t('workoutLog.setN', {n: set.setNumber})}
                            {'  '}
                            {formatWeightKg(set.weightKg)}
                            {'  '}
                            {set.reps == null ? '—' : String(set.reps)}
                            {isPr ? '  PR' : ''}
                          </Text>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>{t('shareWorkout.audienceTitle')}</Text>
            <View style={styles.chips}>
              {AUDIENCES.map(option => {
                const active = audience === option;
                return (
                  <TouchableOpacity
                    key={option}
                    disabled={busy || !!outcome}
                    onPress={() => setAudience(option)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(audienceLabelKey(option))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('shareWorkout.showCenter')}</Text>
              <Switch
                value={showGym}
                onValueChange={setShowGym}
                disabled={busy || !!outcome}
                trackColor={{false: colors.border, true: colors.primary + '88'}}
                thumbColor={showGym ? colors.primary : colors.white}
              />
            </View>
          </ScrollView>

          <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
            {outcome ? (
              <Text style={styles.confirm}>
                {outcome === 'shared'
                  ? t('shareWorkout.sharedConfirm')
                  : t('shareWorkout.savedConfirm')}
              </Text>
            ) : (
              <SocialPrimaryButton
                label={busy ? t('shareWorkout.sharing') : t('workoutHistory.shareWorkout')}
                onPress={() => void handlePublish()}
                variant="premium"
                disabled={busy || exporting}
                loading={busy}
              />
            )}
            {outcome ? null : (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                disabled={busy}
                style={styles.finishBtn}>
                <Text style={styles.finishText}>
                  {t('shareWorkout.finishWithoutSharing')}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={() => void handleSave()}
                disabled={busy || exporting}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>{t('shareWorkout.save')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleNativeShareOnly()}
                disabled={busy || exporting}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>
                  {t('shareWorkout.shareSheet')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  preview: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 168,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  photoActionText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  previewCaption: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  previewMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  previewStats: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginTop: 4,
  },
  previewPr: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  caption: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 72,
    marginBottom: spacing.sm,
  },
  addPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  addPhotoText: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  logToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  logToggleText: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  log: {
    marginBottom: spacing.md,
  },
  logEmpty: {
    ...typography.caption,
    color: colors.textMuted,
  },
  logExercise: {
    marginBottom: spacing.sm,
  },
  logName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  logSet: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.white,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  confirm: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  finishBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  finishText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  secondaryBtn: {
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  errorTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  errorSub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});

export default ShareWorkoutScreen;
