/**
 * Share Workout editor — templates, backgrounds, export for Stories (9:16).
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
  Dimensions,
  Switch,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ViewShot, {type ViewShotRef} from 'react-native-view-shot';
import {
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import ShareWorkoutCard from '@/components/shareWorkout/ShareWorkoutCard';
import {useAppStore} from '@/store/appStore';
import {useTranslation, getRuntimeLanguage} from '@/i18n';
import type {AppLanguage} from '@/i18n/types';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {
  buildShareWorkoutPayload,
} from '@/services/shareWorkout/buildShareWorkoutPayload';
import {availableShareTemplates} from '@/utils/shareWorkoutTemplates';
import {
  captureShareWorkoutImage,
  saveShareWorkoutImage,
  shareShareWorkoutImage,
  shareShareWorkoutToInstagramStories,
} from '@/services/shareWorkout/shareWorkoutExport';
import type {
  ShareWorkoutBackground,
  ShareWorkoutPayload,
  ShareWorkoutTemplate,
} from '@/types/shareWorkout.types';
import {SHARE_EXPORT_FORMATS} from '@/types/shareWorkout.types';

export type ShareWorkoutParams = {
  ShareWorkout: {sessionId: string};
};

const PREVIEW_MAX_W = Math.min(Dimensions.get('window').width - spacing.lg * 2, 340);

const ShareWorkoutScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ShareWorkoutParams, 'ShareWorkout'>>();
  const insets = useSafeAreaInsets();
  const userId = useAppStore(s => s.user?.id);
  const sessionId = route.params?.sessionId;
  const language = getRuntimeLanguage() as AppLanguage;

  const captureRef = useRef<ViewShotRef>(null);

  const [payload, setPayload] = useState<ShareWorkoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<ShareWorkoutTemplate>('summary');
  const [background, setBackground] =
    useState<ShareWorkoutBackground>('transparent');
  const [backgroundPhotoUri, setBackgroundPhotoUri] = useState<string | null>(
    null,
  );
  const [showGym, setShowGym] = useState(false);
  const [prIndex, setPrIndex] = useState(0);

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

  const pickBackgroundPhoto = useCallback(() => {
    launchImageLibrary(
      {mediaType: 'photo', quality: 1, selectionLimit: 1},
      (response: ImagePickerResponse) => {
        const uri = response.assets?.[0]?.uri;
        if (uri) {
          setBackgroundPhotoUri(uri);
          setBackground('photo');
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
        language,
      });
      if (data.sessionId !== sessionId) {
        throw new Error(t('shareWorkout.sessionMismatch'));
      }
      setPayload(data);
      const available = availableShareTemplates(data);
      if (!available.includes(template)) {
        setTemplate('summary');
      }
      setPrIndex(0);
    } catch (e: any) {
      setPayload(null);
      setError(e?.message ?? t('shareWorkout.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, sessionId, language, t, template]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per session
  }, [sessionId, userId]);

  const templates: ShareWorkoutTemplate[] = useMemo(
    () => (payload ? availableShareTemplates(payload) : ['summary']),
    [payload],
  );

  const format = SHARE_EXPORT_FORMATS.stories;
  const previewScale = PREVIEW_MAX_W / format.width;
  const previewH = format.height * previewScale;

  const runCapture = useCallback(async () => {
    if (!captureRef.current) {
      throw new Error(t('shareWorkout.captureFailed'));
    }
    return captureShareWorkoutImage({
      viewRef: captureRef as any,
      background,
      format,
    });
  }, [background, format, t]);

  const handleShare = useCallback(async () => {
    if (!payload || busy) {
      return;
    }
    setBusy(true);
    try {
      const uri = await runCapture();
      const ig = await shareShareWorkoutToInstagramStories({
        uri,
        background,
      });
      if (ig === 'shared') {
        return;
      }
      await shareShareWorkoutImage({
        uri,
        message: t('shareWorkout.shareMessage'),
      });
    } catch (e: any) {
      Alert.alert(t('shareWorkout.prepareFailed'), e?.message ?? '');
    } finally {
      setBusy(false);
    }
  }, [payload, busy, runCapture, background, t]);

  const handleSave = useCallback(async () => {
    if (!payload || busy) {
      return;
    }
    setBusy(true);
    try {
      const uri = await runCapture();
      await saveShareWorkoutImage(uri);
    } catch (e: any) {
      Alert.alert(t('shareWorkout.prepareFailed'), e?.message ?? '');
    } finally {
      setBusy(false);
    }
  }, [payload, busy, runCapture, t]);

  const handleNativeShareOnly = useCallback(async () => {
    if (!payload || busy) {
      return;
    }
    setBusy(true);
    try {
      const uri = await runCapture();
      await shareShareWorkoutImage({
        uri,
        message: t('shareWorkout.shareMessage'),
      });
    } catch (e: any) {
      Alert.alert(t('shareWorkout.prepareFailed'), e?.message ?? '');
    } finally {
      setBusy(false);
    }
  }, [payload, busy, runCapture, t]);

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScreenHeader
        title={t('shareWorkout.title')}
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
          {/* Off-screen full-size capture target — preserves transparency */}
          <View
            pointerEvents="none"
            style={styles.offscreen}
            collapsable={false}>
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
                backgroundColor: 'transparent',
              }}>
              <ShareWorkoutCard
                payload={payload}
                template={template}
                background={background}
                language={language}
                selectedPrIndex={prIndex}
                format={format}
                showGym={showGym}
                backgroundPhotoUri={backgroundPhotoUri}
                copy={copy}
              />
            </ViewShot>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.previewFrame,
                {
                  width: PREVIEW_MAX_W,
                  height: previewH,
                  backgroundColor:
                    background === 'transparent'
                      ? colors.surface
                      : colors.backgroundCard,
                },
              ]}>
              {background === 'transparent' ? (
                <View style={styles.checker} pointerEvents="none" />
              ) : null}
              <View
                style={{
                  width: format.width,
                  height: format.height,
                  transform: [
                    {translateX: (PREVIEW_MAX_W - format.width) / 2},
                    {translateY: (previewH - format.height) / 2},
                    {scale: previewScale},
                  ],
                }}>
                <ShareWorkoutCard
                  payload={payload}
                  template={template}
                  background={background}
                  language={language}
                  selectedPrIndex={prIndex}
                  format={format}
                  showGym={showGym}
                  backgroundPhotoUri={backgroundPhotoUri}
                  copy={copy}
                />
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>{t('shareWorkout.showGym')}</Text>
                <Text style={styles.toggleHint}>{t('shareWorkout.showGymHint')}</Text>
              </View>
              <Switch
                value={showGym}
                onValueChange={setShowGym}
                trackColor={{false: colors.border, true: colors.primary + '88'}}
                thumbColor={showGym ? colors.primary : colors.white}
              />
            </View>

            <Text style={styles.sectionLabel}>{t('shareWorkout.template')}</Text>
            <View style={styles.chipRow}>
              {(
                [
                  {id: 'summary' as const, label: t('shareWorkout.templateSummary')},
                  {id: 'pr' as const, label: t('shareWorkout.templatePr')},
                  {id: 'streak' as const, label: t('shareWorkout.templateStreak')},
                ] as const
              ).map(opt => {
                const enabled = templates.includes(opt.id);
                const active = template === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    disabled={!enabled}
                    onPress={() => setTemplate(opt.id)}
                    style={[
                      styles.chip,
                      active && styles.chipActive,
                      !enabled && styles.chipDisabled,
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                        !enabled && styles.chipTextDisabled,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {template === 'pr' && payload.prs.length > 1 ? (
              <View style={styles.prPager}>
                <TouchableOpacity
                  onPress={() =>
                    setPrIndex(i =>
                      i <= 0 ? payload.prs.length - 1 : i - 1,
                    )
                  }
                  style={styles.prArrow}>
                  <Text style={styles.prArrowText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.prPagerLabel}>
                  {prIndex + 1} / {payload.prs.length}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setPrIndex(i =>
                      i >= payload.prs.length - 1 ? 0 : i + 1,
                    )
                  }
                  style={styles.prArrow}>
                  <Text style={styles.prArrowText}>›</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>
              {t('shareWorkout.background')}
            </Text>
            <View style={styles.chipRow}>
              {(
                [
                  {
                    id: 'transparent' as const,
                    label: t('shareWorkout.bgTransparent'),
                  },
                  {id: 'white' as const, label: t('shareWorkout.bgWhite')},
                  {id: 'purple' as const, label: t('shareWorkout.bgPurple')},
                ] as const
              ).map(opt => {
                const active = background === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      setBackground(opt.id);
                      setBackgroundPhotoUri(null);
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.photoBtn,
                background === 'photo' && styles.photoBtnActive,
              ]}
              onPress={pickBackgroundPhoto}>
              <Text
                style={[
                  styles.photoBtnText,
                  background === 'photo' && styles.photoBtnTextActive,
                ]}>
                {backgroundPhotoUri
                  ? t('shareWorkout.changePhoto')
                  : t('shareWorkout.pickPhoto')}
              </Text>
            </TouchableOpacity>

            {background === 'transparent' ? (
              <Text style={styles.hint}>{t('shareWorkout.transparentHint')}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <SocialPrimaryButton
              label={busy ? t('shareWorkout.working') : t('shareWorkout.share')}
              onPress={() => void handleShare()}
              variant="premium"
              disabled={busy}
            />
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={() => void handleSave()}
                disabled={busy}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>{t('shareWorkout.save')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleNativeShareOnly()}
                disabled={busy}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>
                  {t('shareWorkout.shareSheet')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}
    </View>
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
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 1,
  },
  previewFrame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  checker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#CBD5E1',
    opacity: 0.35,
  },
  sectionLabel: {
    alignSelf: 'stretch',
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.white,
  },
  chipTextDisabled: {
    color: colors.textMuted,
  },
  prPager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  prArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prArrowText: {
    fontSize: 28,
    color: colors.primaryDark,
    fontWeight: '700',
    lineHeight: 32,
  },
  prPagerLabel: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  hint: {
    alignSelf: 'stretch',
    ...typography.small,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  toggleHint: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
  },
  photoBtn: {
    alignSelf: 'stretch',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  photoBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '14',
  },
  photoBtnText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  photoBtnTextActive: {
    color: colors.primaryDark,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  secondaryBtn: {
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    ...typography.body,
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
