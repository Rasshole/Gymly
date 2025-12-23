/**
 * Invite To Workout Screen
 * Screen for inviting a friend to a workout
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {MuscleGroup} from '@/types/workout.types';
import {colors} from '@/theme/colors';
import {getMuscleGroupImage} from '@/utils/muscleGroupImages';

const MUSCLE_GROUPS: {key: MuscleGroup; label: string; icon: string}[] = [
  {key: 'bryst', label: 'Bryst', icon: 'body'},
  {key: 'triceps', label: 'Triceps', icon: 'fitness'},
  {key: 'skulder', label: 'Skulder', icon: 'body'},
  {key: 'ben', label: 'Ben', icon: 'walk'},
  {key: 'biceps', label: 'Biceps', icon: 'fitness'},
  {key: 'mave', label: 'Mave', icon: 'body'},
  {key: 'ryg', label: 'Ryg', icon: 'body'},
  {key: 'hele_kroppen', label: 'Hele kroppen', icon: 'body'},
];

type InviteToWorkoutScreenProps = {
  route: {
    params: {
      friendId: string;
      friendName: string;
    };
  };
};

const InviteToWorkoutScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {friendId, friendName} = (route.params as any) || {};
  const {user} = useAppStore();
  const {sendInvitation} = useWorkoutInvitationStore();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<MuscleGroup[]>([]);

  const toggleMuscleGroup = (group: MuscleGroup) => {
    setSelectedMuscleGroups(prev => {
      if (prev.includes(group)) {
        return prev.filter(g => g !== group);
      } else {
        return [...prev, group];
      }
    });
  };

  const handleDateChange = (event: any, date?: Date) => {
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

  const handleTimeChange = (event: any, time?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (time) {
      setSelectedTime(time);
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowTimePicker(false);
    }
  };

  const handleDatePickerConfirm = () => {
    setShowDatePicker(false);
  };

  const handleTimePickerConfirm = () => {
    setShowTimePicker(false);
  };

  const handleSendInvitation = () => {
    if (selectedMuscleGroups.length === 0) {
      Alert.alert('Vælg muskelgrupper', 'Vælg venligst mindst én muskelgruppe');
      return;
    }

    if (!friendId || !user) {
      Alert.alert('Fejl', 'Ven eller bruger ikke fundet');
      return;
    }

    // Combine date and time
    const scheduledDateTime = new Date(selectedDate);
    scheduledDateTime.setHours(selectedTime.getHours());
    scheduledDateTime.setMinutes(selectedTime.getMinutes());
    scheduledDateTime.setSeconds(0);
    scheduledDateTime.setMilliseconds(0);

    // Check if date is in the past
    if (scheduledDateTime < new Date()) {
      Alert.alert('Ugyldigt tidspunkt', 'Vælg venligst et tidspunkt i fremtiden');
      return;
    }

    sendInvitation({
      fromUserId: user.id,
      fromUserName: user.displayName,
      toUserId: friendId,
      toUserName: friendName,
      scheduledTime: scheduledDateTime,
      muscleGroups: selectedMuscleGroups,
    });

    Alert.alert(
      'Invitation sendt',
      `Du har inviteret ${friendName} til træning`,
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  const formatDateTime = () => {
    const dateStr = selectedDate.toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = selectedTime.toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr} kl. ${timeStr}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inviter til træning</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Friend Info */}
        <View style={styles.friendInfo}>
          <View style={styles.friendAvatar}>
            <Text style={styles.friendAvatarText}>
              {friendName?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.friendName}>{friendName || 'Ven'}</Text>
        </View>

        {/* Date & Time Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tidspunkt</Text>
          
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}>
            <Icon name="calendar-outline" size={20} color="#007AFF" />
            <Text style={styles.dateTimeText}>
              {selectedDate.toLocaleDateString('da-DK', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}>
            <Icon name="time-outline" size={20} color="#007AFF" />
            <Text style={styles.dateTimeText}>
              {selectedTime.toLocaleTimeString('da-DK', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <View style={styles.selectedDateTime}>
            <Text style={styles.selectedDateTimeText}>
              {formatDateTime()}
            </Text>
          </View>
        </View>

        {/* Muscle Groups Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muskelgrupper</Text>
          <Text style={styles.sectionSubtitle}>
            Vælg hvilke muskelgrupper I skal træne (flere valg muligt)
          </Text>

          <View style={styles.muscleGroupsGrid}>
            {MUSCLE_GROUPS.map(group => {
              const isSelected = selectedMuscleGroups.includes(group.key);
              return (
                <TouchableOpacity
                  key={group.key}
                  style={[
                    styles.muscleGroupButton,
                    isSelected && styles.muscleGroupButtonSelected,
                  ]}
                  onPress={() => toggleMuscleGroup(group.key)}
                  activeOpacity={0.7}>
                  <Image
                    source={getMuscleGroupImage(group.key)}
                    style={[styles.muscleGroupImage, isSelected && styles.muscleGroupImageSelected]}
                    resizeMode="contain"
                  />
                  <Text
                    style={[
                      styles.muscleGroupText,
                      isSelected && styles.muscleGroupTextSelected,
                    ]}>
                    {group.label}
                  </Text>
                  {isSelected && (
                    <Icon name="checkmark-circle" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            selectedMuscleGroups.length === 0 && styles.sendButtonDisabled,
          ]}
          onPress={handleSendInvitation}
          disabled={selectedMuscleGroups.length === 0}>
          <Text style={styles.sendButtonText}>Send invitation</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Picker Modal for iOS */}
      {showDatePicker && Platform.OS === 'ios' && (
        <View style={styles.pickerModal}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.pickerModalCancelButton}>
                <Text style={styles.pickerModalCancelText}>Annuller</Text>
              </TouchableOpacity>
              <Text style={styles.pickerModalTitle}>Vælg dato</Text>
              <TouchableOpacity
                onPress={handleDatePickerConfirm}
                style={styles.pickerModalConfirmButton}>
                <Text style={styles.pickerModalConfirmText}>OK</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              minimumDate={new Date()}
              style={styles.picker}
            />
          </View>
        </View>
      )}

      {/* Time Picker Modal for iOS */}
      {showTimePicker && Platform.OS === 'ios' && (
        <View style={styles.pickerModal}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={styles.pickerModalCancelButton}>
                <Text style={styles.pickerModalCancelText}>Annuller</Text>
              </TouchableOpacity>
              <Text style={styles.pickerModalTitle}>Vælg tid</Text>
              <TouchableOpacity
                onPress={handleTimePickerConfirm}
                style={styles.pickerModalConfirmButton}>
                <Text style={styles.pickerModalConfirmText}>OK</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
              style={styles.picker}
            />
          </View>
        </View>
      )}

      {/* Date Picker for Android */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Time Picker for Android */}
      {showTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
    paddingTop: 50,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerRight: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  friendInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  friendAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  friendAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  friendName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  selectedDateTime: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  selectedDateTimeText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  muscleGroupsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  muscleGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    minWidth: '45%',
  },
  muscleGroupButtonSelected: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  muscleGroupImage: {
    width: 32,
    height: 32,
  },
  muscleGroupImageSelected: {
    tintColor: '#fff',
  },
  muscleGroupText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  muscleGroupTextSelected: {
    color: '#fff',
  },
  sendButton: {
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  pickerModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  pickerModalCancelButton: {
    padding: 8,
  },
  pickerModalCancelText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  pickerModalConfirmButton: {
    padding: 8,
  },
  pickerModalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  picker: {
    height: 200,
  },
});

export default InviteToWorkoutScreen;

