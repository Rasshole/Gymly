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
import {spacing, radius, typography} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';

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

const WORKOUT_LABELS: Record<string, string> = {
  fri: 'Fri træning',
  styrke: 'Styrke',
  kondi: 'Kondition',
  ben: 'Ben',
  overkrop: 'Overkrop',
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  hele_kroppen: 'Hele kroppen',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  visible,
  summary,
  onClose,
  onComplete,
}) => {
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

  const workoutTypeLabel =
    summary.workoutType.includes(',') || summary.workoutType.includes('_')
      ? formatWorkoutTypeDisplay(summary.workoutType)
      : WORKOUT_LABELS[summary.workoutType] ?? formatWorkoutTypeDisplay(summary.workoutType);

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
      Alert.alert('Kamera', 'Tillad kamera i indstillinger for at tage et billede.');
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
        Alert.alert('Kamera', response.errorMessage || 'Kunne ikke åbne kameraet.');
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
        Alert.alert('Fotos', response.errorMessage || 'Kunne ikke åbne fotobiblioteket.');
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
      'Kassér træning',
      'Er du sikker på, at du vil kassere din træning?',
      [
        {text: 'Nej', style: 'cancel'},
        {text: 'Ja', onPress: () => void performDiscardShare()},
      ],
    );
  };

  const primaryLabel = shareToFeed ? 'Del træning' : 'Gem og afslut';

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
            <Text style={styles.title}>Opsummer din træning</Text>
            <Text style={styles.subtitle}>
              Billede, tekst og deling på feed (startside og profil)
            </Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Icon name="time-outline" size={22} color={colors.primary} />
                <Text style={styles.summaryValue}>{formatDuration(summary.durationMinutes)}</Text>
                <Text style={styles.summaryLabel}>Varighed</Text>
              </View>
              <View style={styles.summaryRow}>
                <Icon name="business-outline" size={22} color={colors.primary} />
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {summary.gymName}
                </Text>
                <Text style={styles.summaryLabel}>Center</Text>
              </View>
              <View style={styles.summaryRow}>
                <Icon name="barbell-outline" size={22} color={colors.primary} />
                <Text style={styles.summaryValue}>{workoutTypeLabel}</Text>
                <Text style={styles.summaryLabel}>Træningstype</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Billede (valgfrit)</Text>
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
                  <Icon name="camera-outline" size={20} color={colors.primary} />
                  <Text style={styles.mediaHalfButtonText}>Tag billede</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mediaHalfButton}
                  onPress={openLibrary}
                  activeOpacity={0.8}
                  disabled={submitting}>
                  <Icon name="images-outline" size={20} color={colors.primary} />
                  <Text style={styles.mediaHalfButtonText}>Vælg fra bibliotek</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tekst</Text>
              <TextInput
                style={styles.captionInput}
                placeholder="Skriv noget om din træning..."
                placeholderTextColor={colors.textMuted}
                value={caption}
                onChangeText={setCaption}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Humør</Text>
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
                  <Text style={styles.toggleLabel}>Del på feed</Text>
                  <Text style={styles.toggleHint}>
                    Synlig på startside, din profil og hos dine venner (som i Strava/Instagram)
                  </Text>
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
                  <Text style={styles.discardShareButtonText}>Kassér træning</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onClose}
                activeOpacity={0.8}
                disabled={submitting}>
                <Text style={styles.secondaryButtonText}>Annuller</Text>
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
    paddingBottom: spacing.xxxl,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  summaryValue: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  mediaHalfButtonText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  captionInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  moodButtonActive: {
    backgroundColor: colors.primary + '25',
    borderWidth: 2,
    borderColor: colors.primary,
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
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  primaryButton: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
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
