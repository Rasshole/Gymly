/**
 * Add PR Screen
 * Screen for adding or editing a personal record
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchCamera, launchImageLibrary, CameraOptions, ImagePickerResponse} from 'react-native-image-picker';
import {createThumbnail} from 'react-native-create-thumbnail';
import {usePRStore} from '@/store/prStore';
import {ExerciseType, PersonalRecord} from '@/types/pr.types';
import colors from '@/theme/colors';
import {useTranslation, getExerciseDisplayName} from '@/i18n';

type AddPRRouteParams = {
  exercise: ExerciseType;
  existingPR?: PersonalRecord;
};

type AddPRNavigationProp = StackNavigationProp<any>;

const AddPRScreen = () => {
  const navigation = useNavigation<AddPRNavigationProp>();
  const route = useRoute<RouteProp<{params: AddPRRouteParams}, 'params'>>();
  const {exercise, existingPR} = route.params || {};
  const {addPR, updatePR} = usePRStore();
  const {t, language} = useTranslation();

  const [weight, setWeight] = useState(existingPR?.weight.toString() || '');
  const [videoUrl, setVideoUrl] = useState(existingPR?.videoUrl || '');
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState(existingPR?.videoThumbnailUrl || '');
  const [notes, setNotes] = useState(existingPR?.notes || '');

  const exerciseDisplayName = getExerciseDisplayName({
    exerciseId: null,
    fallbackName: String(exercise ?? ''),
    language,
  });

  const handleSave = () => {
    if (!weight || isNaN(Number(weight)) || Number(weight) <= 0) {
      Alert.alert(t('addPr.invalidWeightTitle'), t('addPr.invalidWeightBody'));
      return;
    }

    if (existingPR) {
      updatePR(existingPR.id, {
        weight: Number(weight),
        videoUrl: videoUrl.trim() || undefined,
        videoThumbnailUrl: videoThumbnailUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert(t('addPr.updatedTitle'), t('addPr.updatedBody'), [
        {text: t('common.ok'), onPress: () => navigation.goBack()},
      ]);
    } else {
      addPR({
        userId: 'current_user', // TODO: Get from auth store
        exercise: exercise!,
        weight: Number(weight),
        videoUrl: videoUrl.trim() || undefined,
        videoThumbnailUrl: videoThumbnailUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert(t('addPr.addedTitle'), t('addPr.addedBody'), [
        {text: t('common.ok'), onPress: () => navigation.goBack()},
      ]);
    }
  };

  const handleVideoPick = async () => {
    try {
    Alert.alert(
        t('addPr.pickVideoTitle'),
        t('addPr.pickVideoBody'),
        [
          {
            text: t('addPr.recordVideo'),
            onPress: async () => {
              const videoOptions: CameraOptions = {
                mediaType: 'video',
                cameraType: 'back',
                videoQuality: 'high',
                durationLimit: 30, // Max 30 seconds
                saveToPhotos: true,
              };
              const response: ImagePickerResponse = await launchCamera(videoOptions);
              if (response.didCancel) {
                return;
              }
              if (response.errorCode) {
                Alert.alert(
                  t('addPr.cameraErrorTitle'),
                  response.errorMessage || t('addPr.cameraErrorBody'),
                );
                return;
              }
              const asset = response.assets && response.assets[0];
              if (asset?.uri) {
                // Check video duration if available
                if (asset.duration && asset.duration > 30000) {
                  Alert.alert(t('addPr.videoTooLongTitle'), t('addPr.videoTooLongBody'));
                  return;
                }
                setVideoUrl(asset.uri);
                try {
                  const thumbnail = await createThumbnail({url: asset.uri, timeStamp: 1000});
                  if (thumbnail?.path) {
                    setVideoThumbnailUrl(thumbnail.path);
                  }
                } catch (error) {
                  setVideoThumbnailUrl('');
                }
                Alert.alert(t('addPr.videoAddedTitle'), t('addPr.videoAddedBody'));
              }
            },
          },
          {
            text: t('addPr.pickFromLibrary'),
            onPress: async () => {
              const libraryOptions: CameraOptions = {
                mediaType: 'video',
                videoQuality: 'high',
              };
              const response: ImagePickerResponse = await launchImageLibrary(libraryOptions);
              if (response.didCancel) {
                return;
              }
              if (response.errorCode) {
                Alert.alert(
                  t('common.error'),
                  response.errorMessage || t('addPr.libraryErrorBody'),
                );
                return;
              }
              const asset = response.assets && response.assets[0];
              if (asset?.uri) {
                // Check video duration if available
                if (asset.duration && asset.duration > 30000) {
                  Alert.alert(t('addPr.videoTooLongTitle'), t('addPr.videoTooLongBody'));
                  return;
                }
                setVideoUrl(asset.uri);
                try {
                  const thumbnail = await createThumbnail({url: asset.uri, timeStamp: 1000});
                  if (thumbnail?.path) {
                    setVideoThumbnailUrl(thumbnail.path);
                  }
                } catch (error) {
                  setVideoThumbnailUrl('');
                }
                Alert.alert(t('addPr.videoAddedTitle'), t('addPr.videoAddedBody'));
              }
            },
          },
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
        ],
    );
    } catch (error) {
      Alert.alert(t('common.error'), t('addPr.pickerErrorBody'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {existingPR ? t('addPr.titleEdit') : t('addPr.titleAdd')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Exercise Name */}
        <View style={styles.section}>
          <Text style={styles.exerciseName}>{exerciseDisplayName}</Text>
        </View>

        {/* Weight Input */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>{t('addPr.weightKg')}</Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder={t('addPr.weightPlaceholder')}
            keyboardType="numeric"
            placeholderTextColor="#8E8E93"
          />
        </View>

        {/* Video Section */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>{t('addPr.videoLabel')}</Text>
          <Text style={styles.inputHint}>
            {t('addPr.videoHint')}
          </Text>
          <TouchableOpacity
            style={styles.videoButton}
            onPress={handleVideoPick}
            activeOpacity={0.8}>
            <Icon name="videocam" size={24} color="#007AFF" />
            <Text style={styles.videoButtonText}>
              {videoUrl ? t('addPr.videoSelected') : t('addPr.chooseVideo')}
            </Text>
          </TouchableOpacity>
          {videoUrl && (
            <TouchableOpacity
              style={styles.removeVideoButton}
              onPress={() => {
                setVideoUrl('');
                setVideoThumbnailUrl('');
              }}
              activeOpacity={0.7}>
              <Icon name="close-circle" size={20} color="#FF3B30" />
              <Text style={styles.removeVideoText}>{t('addPr.removeVideo')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notes (Optional) */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>{t('addPr.notesOptional')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('addPr.notesPlaceholder')}
            placeholderTextColor="#8E8E93"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.8}>
          <Text style={styles.saveButtonText}>
            {existingPR ? t('addPr.update') : t('addPr.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  exerciseName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  videoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.secondary,
    borderStyle: 'dashed',
  },
  videoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
    marginLeft: 12,
  },
  removeVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  removeVideoText: {
    fontSize: 14,
    color: '#FF3B30',
    marginLeft: 6,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default AddPRScreen;
