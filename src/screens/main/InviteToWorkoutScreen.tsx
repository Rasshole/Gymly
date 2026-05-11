/**
 * Inviter til træning fra profil — samme backend som Planlagte sessions (create_planned_session).
 * UI: blød Gymly-lilla, luftige kort, diskrete animationer.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {MuscleGroup} from '@/types/workout.types';
import colors from '@/theme/colors';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {PurpleGradientButton} from '@/components/ui/PurpleGradientButton';
import TrainingTypeMuscleGrid from '@/components/planned/TrainingTypeMuscleGrid';
import {
  createPlannedSession,
  loadWorkoutPlanEntriesForUser,
} from '@/services/supabase/plannedWorkoutService';
import {formatGymDisplayName, findGymByIdRelaxed} from '@/utils/gymDisplay';
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import TrainingCenterPicker from '@/components/planned/TrainingCenterPicker';
import TimePickerSheet from '@/components/ui/TimePickerSheet';

const FALLBACK_GYMS = getActiveDanishGyms();

const SCREEN_TINT = '#F7F5FC';
const CARD_LINE = 'rgba(139, 92, 246, 0.1)';
const PURPLE_MIST = 'rgba(139, 92, 246, 0.09)';

function defaultScheduleParts(): {date: Date; time: Date} {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(next.getHours() + 1);
  const dateOnly = new Date(next);
  dateOnly.setHours(0, 0, 0, 0);
  const timeOnly = new Date();
  timeOnly.setHours(next.getHours(), next.getMinutes(), 0, 0);
  return {date: dateOnly, time: timeOnly};
}

const InviteToWorkoutScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const {friendId, friendName} = (route.params as {friendId?: string; friendName?: string}) || {};
  const {user} = useAppStore();
  const mergePlannedFromServer = useWorkoutPlanStore(s => s.mergePlannedFromServer);

  const displayName = (friendName || 'din ven').trim() || 'din ven';
  const colorScheme = useColorScheme();
  const datePickerIsDark = colorScheme === 'dark';

  const [selectedDate, setSelectedDate] = useState(() => defaultScheduleParts().date);
  const [selectedTime, setSelectedTime] = useState(() => defaultScheduleParts().time);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [planMuscle, setPlanMuscle] = useState<MuscleGroup>('bryst');
  const [planSelectedGym, setPlanSelectedGym] = useState<DanishGym | null>(null);
  const [saving, setSaving] = useState(false);
  const gymInitRef = useRef(false);

  useEffect(() => {
    if (gymInitRef.current || !user) {
      return;
    }
    gymInitRef.current = true;
    const primaryId = user.favoriteGyms?.[0];
    const fromProfile = primaryId ? findGymByIdRelaxed(primaryId) : null;
    setPlanSelectedGym(fromProfile ?? FALLBACK_GYMS[0] ?? null);
  }, [user]);

  const combineDateTime = useCallback(() => {
    const scheduled = new Date(selectedDate);
    scheduled.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
    return scheduled;
  }, [selectedDate, selectedTime]);

  const scheduledPreview = useMemo(() => combineDateTime(), [combineDateTime]);

  const handleDateChange = (event: {type?: string}, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!friendId?.trim()) {
      Alert.alert('Fejl', 'Kunne ikke finde brugeren.');
      return;
    }
    if (user?.id && friendId === user.id) {
      Alert.alert('Fejl', 'Du kan ikke invitere dig selv.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Log ind', 'Log ind for at sende en invitation.');
      return;
    }
    if (!planSelectedGym) {
      Alert.alert('Vælg center', 'Vælg hvor I skal mødes — som i Planlagte sessions.');
      return;
    }

    const scheduledDateTime = combineDateTime();
    const now = new Date();
    if (scheduledDateTime.getTime() <= now.getTime()) {
      Alert.alert('Ugyldigt tidspunkt', 'Vælg et tidspunkt i fremtiden.');
      return;
    }

    setSaving(true);
    try {
      await createPlannedSession({
        centerId: planSelectedGym.id,
        centerName: formatGymDisplayName(planSelectedGym),
        scheduledAt: scheduledDateTime,
        trainingTypes: [String(planMuscle)],
        note: null,
        inviteeIds: [friendId],
        threadId: null,
      });
      try {
        const entries = await loadWorkoutPlanEntriesForUser(user.id, true);
        mergePlannedFromServer(entries);
      } catch {
        // Plan opdateres ved næste åbning
      }
      Alert.alert(
        'Invitation sendt',
        `${displayName} får besked og kan svare under Planlagte sessions → Invitationer.`,
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Prøv igen om lidt.';
      Alert.alert('Kunne ikke oprette', message);
    } finally {
      setSaving(false);
    }
  };

  const formatDateLine = () =>
    selectedDate.toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  const formatTimeLine = () =>
    selectedTime.toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatPreviewLine = () => {
    const dateStr = scheduledPreview.toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = scheduledPreview.toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr} · kl. ${timeStr}`;
  };

  const sendDisabled = saving || !planSelectedGym;

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: Math.max(insets.top, 10) + 6}]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.headerBackPill, pressed && styles.headerBackPillPressed]}
          hitSlop={12}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Inviter til træning</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(240)}>
          <View style={styles.hero}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>Træn med {displayName}</Text>
            <Text style={styles.heroSubtitle}>Planlæg en session sammen</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(50)}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Tidspunkt</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={({pressed}) => [styles.timeRow, pressed && styles.rowPressed]}
              android_ripple={{color: PURPLE_MIST}}>
              <View style={styles.timeIconWrap}>
                <Icon name="calendar-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.timeRowText}>{formatDateLine()}</Text>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            <View style={styles.hairline} />
            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={({pressed}) => [styles.timeRow, pressed && styles.rowPressed]}
              android_ripple={{color: PURPLE_MIST}}>
              <View style={styles.timeIconWrap}>
                <Icon name="time-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.timeRowText}>{formatTimeLine()}</Text>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            <View style={styles.previewPill}>
              <Text style={styles.previewPillText}>{formatPreviewLine()}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(90)}>
          <TrainingCenterPicker
            variant="inviteCard"
            value={planSelectedGym}
            onChange={setPlanSelectedGym}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(130)}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Træningstype</Text>
            <Text style={styles.cardHint}>Én type — som i Planlagte sessions</Text>
            <TrainingTypeMuscleGrid value={planMuscle} onChange={setPlanMuscle} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(280).delay(160)}>
          <PurpleGradientButton
            onPress={() => {
              handleSendInvitation();
            }}
            disabled={sendDisabled}
            style={styles.sendCta}>
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.sendCtaText}>Send invitation</Text>
            )}
          </PurpleGradientButton>
        </Animated.View>
      </ScrollView>

      {showDatePicker && Platform.OS === 'ios' && (
        <View style={styles.pickerModal}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerHeaderBtn}>
                <Text style={styles.pickerCancel}>Annuller</Text>
              </Pressable>
              <Text style={styles.pickerTitle}>Dato</Text>
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerHeaderBtn}>
                <Text style={styles.pickerOk}>OK</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              minimumDate={new Date()}
              locale="da_DK"
              themeVariant={datePickerIsDark ? 'dark' : 'light'}
              textColor={datePickerIsDark ? '#F9FAFB' : '#111827'}
              style={styles.picker}
            />
          </View>
        </View>
      )}

      <TimePickerSheet
        visible={showTimePicker}
        value={selectedTime}
        onClose={() => setShowTimePicker(false)}
        onConfirm={d => setSelectedTime(d)}
        minuteInterval={15}
      />

      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_TINT,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  headerBackPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundCardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackPillPressed: {
    opacity: 0.75,
    transform: [{scale: 0.96}],
  },
  headerTitle: {
    ...typography.bodyBold,
    fontSize: 17,
    color: colors.text,
  },
  headerRight: {
    width: 36,
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 34,
    backgroundColor: PURPLE_MIST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    ...typography.caption,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_LINE,
    ...shadows.sm,
  },
  cardLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  rowPressed: {
    opacity: 0.88,
  },
  timeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PURPLE_MIST,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  timeRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(17, 24, 39, 0.07)',
    marginLeft: 36 + spacing.md,
  },
  previewPill: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: PURPLE_MIST,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 92, 246, 0.14)',
  },
  previewPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  sendCta: {
    marginTop: spacing.sm,
    minHeight: 54,
  },
  sendCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.2,
  },
  pickerModal: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  pickerModalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerHeaderBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 64,
  },
  pickerCancel: {
    ...typography.body,
    color: colors.textMuted,
  },
  pickerTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  pickerOk: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'right',
  },
  picker: {
    height: 216,
  },
});

export default InviteToWorkoutScreen;
