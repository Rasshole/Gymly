/**
 * Bottom sheet: gem / rediger sæt (vægt + reps).
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import {
  parseRepsInput,
  parseWeightInput,
} from '@/utils/workoutLogMath';
import {useTranslation, getExerciseDisplayName} from '@/i18n';

const SCREEN_H = Dimensions.get('window').height;

export type SetEditorMode = 'create' | 'edit';

export type SetEditorSheetProps = {
  visible: boolean;
  mode: SetEditorMode;
  exerciseName: string;
  initialWeight?: number | null;
  initialReps?: number | null;
  onClose: () => void;
  onSave: (weightKg: number, reps: number) => Promise<void>;
};

const SetEditorSheet: React.FC<SetEditorSheetProps> = ({
  visible,
  mode,
  exerciseName,
  initialWeight,
  initialReps,
  onClose,
  onSave,
}) => {
  const {t, language} = useTranslation();
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const [weightText, setWeightText] = useState('');
  const [repsText, setRepsText] = useState('');
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);

  const displayName = getExerciseDisplayName({
    exerciseId: null,
    fallbackName: exerciseName,
    language,
  });

  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      const w = initialWeight;
      setWeightText(
        w == null
          ? ''
          : Number.isInteger(w)
            ? String(w)
            : String(w).replace('.', ','),
      );
      setRepsText(initialReps != null ? String(initialReps) : '');
      setSaving(false);
      savingLock.current = false;
    }
    wasVisible.current = visible;
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          stiffness: 420,
          damping: 36,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: SCREEN_H,
          stiffness: 520,
          damping: 40,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdrop, sheetY]);

  const handleSave = async () => {
    if (savingLock.current) {
      return;
    }
    const weight = parseWeightInput(weightText);
    const reps = parseRepsInput(repsText);
    if (weight == null) {
      Alert.alert(t('workoutLog.invalidWeightTitle'), t('workoutLog.invalidWeightBody'));
      return;
    }
    if (reps == null) {
      Alert.alert(t('workoutLog.invalidRepsTitle'), t('workoutLog.invalidRepsBody'));
      return;
    }
    savingLock.current = true;
    setSaving(true);
    try {
      await onSave(weight, reps);
      onClose();
    } catch {
      Alert.alert(t('workoutLog.saveFailedTitle'), t('workoutLog.saveFailedBody'), [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('workoutLog.retry'),
          onPress: () => {
            savingLock.current = false;
            setSaving(false);
            void handleSave();
          },
        },
      ]);
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          <Animated.View style={[styles.backdrop, {opacity: backdrop}]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
                transform: [{translateY: sheetY}],
              },
            ]}>
            <View style={styles.handle} />
            <Text style={styles.title}>
              {mode === 'edit'
                ? t('workoutLog.editSetTitle')
                : t('workoutLog.newSetTitle')}
            </Text>
            <Text style={styles.exercise} numberOfLines={2}>
              {displayName}
            </Text>

            <Text style={styles.label}>{t('workoutLog.weightLabel')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={weightText}
                onChangeText={setWeightText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
              />
              <Text style={styles.unit}>kg</Text>
            </View>

            <Text style={styles.label}>{t('workoutLog.repsLabel')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={repsText}
                onChangeText={setRepsText}
                keyboardType="number-pad"
                placeholder="8"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
              />
              <Text style={styles.unit}>{t('phase2ui.reps')}</Text>
            </View>

            <SocialPrimaryButton
              label={saving ? t('workoutLog.saving') : t('workoutLog.saveSet')}
              onPress={() => void handleSave()}
              disabled={saving}
              loading={saving}
              variant="premium"
              style={styles.cta}
            />
            {saving ? (
              <ActivityIndicator
                color={colors.primary}
                style={{marginTop: spacing.sm}}
              />
            ) : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadows.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  exercise: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    minHeight: 56,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  unit: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  cta: {marginTop: spacing.sm},
});

export default SetEditorSheet;
