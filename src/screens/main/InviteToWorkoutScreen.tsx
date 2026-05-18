/**
 * Inviter til træning fra profil — samme backend som Planlagte sessions (create_planned_session).
 * UI: delt formular med Planlæg fra beskeder (PlannedWorkoutInviteForm).
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  Pressable,
  useColorScheme,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import {MuscleGroup} from '@/types/workout.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {
  createTrainingInvitation,
  loadWorkoutPlanEntriesForUser,
} from '@/services/supabase/plannedWorkoutService';
import {formatGymDisplayName, findGymByIdRelaxed} from '@/utils/gymDisplay';
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import TimePickerSheet from '@/components/ui/TimePickerSheet';
import PlannedWorkoutInviteForm, {
  defaultScheduleParts,
  INVITE_FORM_SCREEN_TINT,
} from '@/components/planned/PlannedWorkoutInviteForm';

const FALLBACK_GYMS = getActiveDanishGyms();

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
      await createTrainingInvitation({
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

      <PlannedWorkoutInviteForm
        variant="hero"
        peerDisplayName={displayName}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        onPressSelectDate={() => setShowDatePicker(true)}
        onPressSelectTime={() => setShowTimePicker(true)}
        scheduledPreview={scheduledPreview}
        planSelectedGym={planSelectedGym}
        onGymChange={setPlanSelectedGym}
        planMuscle={planMuscle}
        onMuscleChange={setPlanMuscle}
        onSubmit={handleSendInvitation}
        submitLabel="Send invitation"
        saving={saving}
        submitDisabled={sendDisabled}
      />

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
    backgroundColor: INVITE_FORM_SCREEN_TINT,
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
