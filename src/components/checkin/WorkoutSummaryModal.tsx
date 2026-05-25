/**
 * WorkoutSummaryModal – afslut session
 * Opsummering + foto (kamera/bibliotek), tekst, humør, del på feed
 */

import React, {useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  TouchableWithoutFeedback,
  Platform,
  KeyboardAvoidingView,
  Alert,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {useTranslation, getRuntimeLanguage} from '@/i18n';

const MOODS = [
  {emoji: '😡', key: 'angry'},
  {emoji: '😐', key: 'neutral'},
  {emoji: '🙂', key: 'ok'},
  {emoji: '😄', key: 'good'},
  {emoji: '🤩', key: 'amazing'},
];

export interface WorkoutSummaryData {
  gymName: string;
  durationMinutes: number;
  workoutType: string;
}

export interface WorkoutSummaryModalProps {
  visible: boolean;
  summary: WorkoutSummaryData;
  onClose: () => void;
  onComplete: (data: {
    mediaUri?: string;
    caption: string;
    mood: string;
    shareToFeed: boolean;
  }) => void | Promise<void>;
}

const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  visible,
  summary,
  onClose,
  onComplete,
}) => {
  const {t} = useTranslation();
  const [caption, setCaption] = React.useState('');
  const [mood, setMood] = React.useState('good');
  const [shareToFeed, setShareToFeed] = React.useState(true);
  const [mediaUri, setMediaUri] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  useEffect(() => {
    if (!visible) {
      setCaption('');
      setMood('good');
      setShareToFeed(true);
      setMediaUri(undefined);
      setSubmitting(false);
    }
  }, [visible]);

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} t ${m} min` : `${h} time`;
  };

  const workoutTypeLabel = formatWorkoutTypeDisplay(
    summary.workoutType,
    getRuntimeLanguage(),
  );

  const ensureAndroidCamera = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Kamera',
          message: 'Gymly skal bruge kameraet for at tage et billede.',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const openCamera = useCallback(async () => {
    const ok = await ensureAndroidCamera();
    if (!ok) {
      Alert.alert(t('chat.cameraError'), t('workoutSummary.couldNotOpenLibrary'));
      return;
    }
    const cameraOptions: CameraOptions = {
      mediaType: 'photo',
      cameraType: 'back',
      saveToPhotos: true,
      quality: 0.8,
    };
    launchCamera(cameraOptions, (response: ImagePickerResponse) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(t('chat.cameraError'), response.errorMessage || t('chat.couldNotOpenCamera'));
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) setMediaUri(asset.uri);
    });
  }, []);

  const openLibrary = useCallback(() => {
    const libraryOptions: CameraOptions = {
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    };
    launchImageLibrary(libraryOptions, (response: ImagePickerResponse) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert(t('chat.photosError'), response.errorMessage || t('workoutSummary.couldNotOpenLibrary'));
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) setMediaUri(asset.uri);
    });
  }, []);

  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete({mediaUri, caption: caption.trim(), mood, shareToFeed});
    } finally {
      setSubmitting(false);
    }
  };

  /** Afslut uden at dele på feed (træningen gemmes stadig) */
  const performDiscardShare = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete({mediaUri, caption: caption.trim(), mood, shareToFeed: false});
    } finally {
      setSubmitting(false);
    }
  };

  const requestDiscardConfirmation = () => {
    if (submitting) return;
    Alert.alert(
      t('workoutSummary.discardTitle'),
      t('workoutSummary.discardBody'),
      [
        {text: t('common.no'), style: 'cancel'},
        {text: t('common.yes'), onPress: () => void performDiscardShare()},
      ],
    );
  };

  const primaryLabel = shareToFeed
    ? t('workoutSummary.shareWorkout')
    : t('workoutSummary.saveAndFinish');
  const centerShort = summary.gymName.replace(/\s*-\s*Falkoner$/i, '');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={styles.heroHeader}>
              <Text style={styles.heroTitle}>{t('workoutSummary.checkedIn')}</Text>
              <Text style={styles.heroCenter} numberOfLines={1}>
                {centerShort}
              </Text>
              <Text style={styles.heroWorkout} numberOfLines={1}>
                {workoutTypeLabel}
              </Text>
            </View>

            <View style={styles.heroTimerCard}>
              <View style={styles.heroCircleTop} />
              <View style={styles.heroCircleBottom} />
              <Text style={styles.heroTimerValue}>{formatDuration(summary.durationMinutes)}</Text>
              <Text style={styles.heroTimerSub}>{t('workoutSummary.sessionInProgress')}</Text>
            </View>

            <Text style={styles.title}>{t('workoutSummary.summarizeTitle')}</Text>
            <Text style={styles.subtitle}>{t('workoutSummary.summarizeSub')}</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Icon name="time-outline" size={18} color={colors.primaryDark} />
                </View>
                <Text style={styles.summaryValue}>{formatDuration(summary.durationMinutes)}</Text>
                <Text style={styles.summaryLabel}>{t('workoutSummary.duration')}</Text>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Icon name="business-outline" size={18} color={colors.primaryDark} />
                </View>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {centerShort}
                </Text>
                <Text style={styles.summaryLabel}>{t('workoutSummary.center')}</Text>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Icon name="barbell-outline" size={18} color={colors.primaryDark} />
                </View>
                <Text style={styles.summaryValue}>{workoutTypeLabel}</Text>
                <Text style={styles.summaryLabel}>{t('workoutSummary.workoutType')}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('workoutSummary.photoOptional')}</Text>
              {mediaUri ? (
                <View style={styles.previewWrap}>
                  <Image source={{uri: mediaUri}} style={styles.previewImage} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setMediaUri(undefined)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Icon name="close-circle" size={28} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.mediaButtonRow}>
                <TouchableOpacity
                  style={styles.mediaHalfButton}
                  onPress={openCamera}
                  activeOpacity={0.8}
                  disabled={submitting}>
                  <Icon name="camera-outline" size={20} color={colors.primaryDark} />
                  <Text style={styles.mediaHalfButtonText}>{t('workoutSummary.takePhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mediaHalfButton}
                  onPress={openLibrary}
                  activeOpacity={0.8}
                  disabled={submitting}>
                  <Icon name="images-outline" size={20} color={colors.primaryDark} />
                  <Text style={styles.mediaHalfButtonText}>{t('workoutSummary.chooseLibrary')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('workoutSummary.caption')}</Text>
              <TextInput
                style={styles.captionInput}
                placeholder={t('workoutSummary.writeAboutWorkout')}
                placeholderTextColor={colors.textMuted}
                value={caption}
                onChangeText={setCaption}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('workoutSummary.mood')}</Text>
              <View style={styles.moodsRow}>
                {MOODS.map(({emoji, key}) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.moodButton, mood === key && styles.moodButtonActive]}
                    onPress={() => setMood(key)}
                    activeOpacity={0.8}>
                    <Text style={styles.moodEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setShareToFeed(!shareToFeed)}
                activeOpacity={0.8}>
                <Icon
                  name={shareToFeed ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={shareToFeed ? colors.primary : colors.textMuted}
                />
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>{t('workoutSummary.shareToFeed')}</Text>
                  <Text style={styles.toggleHint}>{t('workoutSummary.visibleOnFeed')}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                onPress={handleFinish}
                activeOpacity={0.8}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
                )}
              </TouchableOpacity>
              {shareToFeed ? (
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.discardShareButtonOutline,
                    submitting && styles.primaryButtonDisabled,
                  ]}
                  onPress={requestDiscardConfirmation}
                  activeOpacity={0.8}
                  disabled={submitting}>
                  <Text style={styles.discardShareButtonText}>
                    {t('workoutSummary.discardWorkout')}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onClose}
                activeOpacity={0.8}
                disabled={submitting}>
                <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    maxHeight: '92%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  scroll: {
    maxHeight: 560,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.text,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroCenter: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  heroWorkout: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: 2,
  },
  heroTimerCard: {
    minHeight: 170,
    borderRadius: radius.xl + 4,
    backgroundColor: colors.primaryDark,
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.glow,
  },
  heroCircleTop: {
    position: 'absolute',
    top: -34,
    right: -20,
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: colors.primaryLight + '44',
  },
  heroCircleBottom: {
    position: 'absolute',
    left: -26,
    bottom: -36,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#C4B5FD2E',
  },
  heroTimerValue: {
    fontSize: 50,
    lineHeight: 56,
    fontWeight: '900',
    color: colors.white,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  heroTimerSub: {
    marginTop: 6,
    ...typography.small,
    color: '#F3E8FF',
    fontWeight: '700',
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 2,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md + 2,
    paddingHorizontal: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border + '99',
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
    gap: spacing.md,
  },
  summaryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '18',
  },
  summaryValue: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  previewWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.surface,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
  },
  mediaButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mediaHalfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    backgroundColor: colors.backgroundLight,
    ...shadows.sm,
  },
  mediaHalfButtonText: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  captionInput: {
    backgroundColor: '#F8F8FC',
    borderRadius: radius.lg,
    padding: spacing.md + 1,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    ...typography.body,
    color: colors.text,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  moodsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moodButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F1F6',
  },
  moodButtonActive: {
    backgroundColor: colors.primary + '22',
    borderWidth: 2,
    borderColor: colors.primary,
    transform: [{scale: 1.06}],
    ...shadows.sm,
  },
  moodEmoji: {
    fontSize: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  toggleHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  buttons: {
    marginTop: spacing.md + 2,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  primaryButton: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg + 2,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    ...shadows.glow,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  /** Samme højde/padding som primær – outline */
  discardShareButtonOutline: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
    shadowOpacity: 0,
    elevation: 0,
  },
  discardShareButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  secondaryButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

export default WorkoutSummaryModal;
