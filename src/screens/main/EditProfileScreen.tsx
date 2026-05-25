/**
 * Edit Profile Screen
 * Screen for editing user profile: bio, image, privacy settings, name, username
 */

import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  Image,
  Switch,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useChatStore} from '@/store/chatStore';
import AuthService from '@/services/auth/AuthService';
import {upsertMyProfile, mergeProfileUsernameIntoUser} from '@/services/supabase/friendService';
import {persistUserHomeGyms} from '@/services/supabase/userCentersService';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  getUsernameFormatError,
  normalizeUsernameForStorage,
  normalizeUsernameInput,
} from '@/utils/usernameRules';
import {useUsernameAvailability} from '@/hooks/useUsernameAvailability';
import {GymSlotsEditor} from '@/components/profile/GymSlotsEditor';
import {ProfileVisibility, type User} from '@/types/user.types';
import {
  spacing,
  radius,
  typography,
  shadows,
} from '@/theme/designTokens';
import colors from '@/theme/colors';
import {useTranslation, rt} from '@/i18n';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

type EditProfileNavigationProp = StackNavigationProp<any>;

const EditProfileScreen = () => {
  const navigation = useNavigation<EditProfileNavigationProp>();
  const {t, intlLocale, language} = useTranslation();
  const route = useRoute() as {params?: {forceUsernameChange?: boolean}};
  const {user, setUser} = useAppStore();
  const forceUsernameChange = route.params?.forceUsernameChange === true;

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(() =>
    normalizeUsernameForStorage(user?.username ?? ''),
  );
  const [bio, setBio] = useState(user?.bio || '');
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl || '');
  const [weight, setWeight] = useState(user?.weight ? user.weight.toString() : '');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | 'prefer_not_to_say' | ''>(
    user?.gender || ''
  );
  const [dateOfBirth, setDateOfBirth] = useState<Date>(
    user?.dateOfBirth ? new Date(user.dateOfBirth) : new Date(2000, 0, 1)
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [city, setCity] = useState(user?.city || '');
  const [bicepsEmoji, setBicepsEmoji] = useState(user?.bicepsEmoji || '💪🏻');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const photoScale = useRef(new Animated.Value(1)).current;
  /** Ved tvungen omdøbning: kræv at brugeren faktisk ændrer væk fra DB-værdien. */
  const forcedRenameStartNorm = useRef<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    user?.privacySettings.profileVisibility || 'private'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [gymIdsDraft, setGymIdsDraft] = useState<string[]>(
    () => (user?.favoriteGyms?.filter(Boolean) as string[] | undefined) ?? [],
  );
  const handleGymIdsChange = useCallback((ids: string[]) => {
    setGymIdsDraft(ids);
  }, []);
  const bicepsOptions = ['💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿', '🦾'];

  // Track last changes for 14-day limit
  const [lastDisplayNameChange, setLastDisplayNameChange] = useState<Date | null>(null);
  const [lastUsernameChange, setLastUsernameChange] = useState<Date | null>(null);

  const canChangeDisplayName = () => {
    if (!lastDisplayNameChange) return true;
    const daysSinceChange = (Date.now() - lastDisplayNameChange.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceChange >= 14;
  };

  const canChangeUsername = () => {
    if (!lastUsernameChange) return true;
    const daysSinceChange = (Date.now() - lastUsernameChange.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceChange >= 14;
  };

  const unchangedUsernameNorm = useMemo(
    () => (user?.username ? normalizeUsernameForStorage(user.username) : null),
    [user?.username],
  );

  const usernameAvailability = useUsernameAvailability({
    rawUsername: username,
    excludeUserId: user?.id,
    unchangedNormalized: unchangedUsernameNorm,
  });

  const usernameNormChanged = useMemo(() => {
    if (!user) {
      return false;
    }
    return (
      normalizeUsernameForStorage(username) !== normalizeUsernameForStorage(user.username)
    );
  }, [username, user]);

  const stuckOnForcedUsername =
    forceUsernameChange &&
    forcedRenameStartNorm.current != null &&
    normalizeUsernameForStorage(username) === forcedRenameStartNorm.current;

  const saveBlockedByUsername =
    stuckOnForcedUsername ||
    ((forceUsernameChange || usernameNormChanged) && !usernameAvailability.canProceed) ||
    isSaving;

  const PROFILE_AVATAR_BUCKET = 'workout-images';

  function userFacingSaveError(err: unknown): string {
    const msg = ((err as {message?: string})?.message ?? '').toLowerCase();
    const code = ((err as {code?: string})?.code ?? '').toString();
    if (
      code === '23505' ||
      msg.includes('brugernavnet er allerede taget') ||
      msg.includes('duplicate') ||
      msg.includes('unique')
    ) {
      return rt('editProfile.usernameTaken');
    }
    if (
      msg.includes('kun bogstaver, tal, punktum og _') ||
      msg.includes('invalid username')
    ) {
      return rt('editProfile.usernameInvalid');
    }
    if (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('offline') ||
      msg.includes('connection')
    ) {
      return rt('editProfile.noConnection');
    }
    if (msg.includes('row-level security') || msg.includes('rls')) {
      return rt('errors.couldNotSave');
    }
    return rt('errors.couldNotSave');
  }

  async function uploadAvatarIfNeeded(currentUserId: string): Promise<string> {
    const raw = profileImageUrl.trim();
    if (!raw) {
      return '';
    }
    const isLocal =
      raw.startsWith('file://') ||
      raw.startsWith('content://') ||
      raw.startsWith('ph://');
    if (!isLocal) {
      return raw;
    }
    const response = await fetch(raw);
    if (!response.ok) {
      throw new Error(rt('editProfile.couldNotReadImage'));
    }
    const body = await response.arrayBuffer();
    const path = `${currentUserId}/avatar-${Date.now()}.jpg`;
    const {error: uploadError} = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(path, body, {contentType: 'image/jpeg', upsert: true});
    if (uploadError) {
      throw new Error('Kunne ikke uploade profilbillede');
    }
    const {data: pub} = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
    if (!pub?.publicUrl) {
      throw new Error('Kunne ikke hente avatar-url');
    }
    return pub.publicUrl;
  }

  useEffect(() => {
    if (forceUsernameChange && user?.usernameRequiresChange && user.username) {
      forcedRenameStartNorm.current = normalizeUsernameForStorage(user.username);
    }
  }, [forceUsernameChange, user?.usernameRequiresChange, user?.username]);

  useEffect(() => {
    if (!forceUsernameChange || !user?.usernameRequiresChange) {
      return;
    }
    const sub = navigation.addListener('beforeRemove', e => {
      if (!useAppStore.getState().user?.usernameRequiresChange) {
        return;
      }
      e.preventDefault();
      Alert.alert(
        t('editProfile.usernameRequired'),
        t('editProfile.usernameRequiredBody'),
        [{text: t('common.ok')}],
      );
    });
    return sub;
  }, [forceUsernameChange, navigation, user?.usernameRequiresChange]);

  const handleSave = async () => {
    if (!user) return;
    if (isSaving) return;

    if (gymIdsDraft.length < 1) {
      Alert.alert(
        t('editProfile.localCentres'),
        t('editProfile.primaryCentreRequired'),
      );
      return;
    }

    // Validate display name change
    if (displayName !== user.displayName) {
      if (!canChangeDisplayName()) {
        const daysUntil = Math.ceil(14 - ((Date.now() - lastDisplayNameChange!.getTime()) / (1000 * 60 * 60 * 24)));
        Alert.alert(
          t('editProfile.cannotChangeName'),
          t('editProfile.nameChangeCooldown', {days: String(daysUntil)}),
        );
        setDisplayName(user.displayName);
        return;
      }
    }

    const nextUsernameNorm = normalizeUsernameForStorage(username);
    const uFmt = getUsernameFormatError(language, nextUsernameNorm);
    if (uFmt) {
      Alert.alert(t('editProfile.username'), uFmt);
      return;
    }

    if (stuckOnForcedUsername) {
      Alert.alert(
        t('editProfile.username'),
        t('editProfile.usernameMustChange'),
      );
      return;
    }

    if (usernameNormChanged) {
      if (!canChangeUsername()) {
        const daysUntil = Math.ceil(14 - ((Date.now() - lastUsernameChange!.getTime()) / (1000 * 60 * 60 * 24)));
        Alert.alert(
          t('editProfile.cannotChangeUsername'),
          t('editProfile.usernameCooldown', {days: String(daysUntil)}),
        );
        setUsername(normalizeUsernameForStorage(user.username));
        return;
      }
      if (!usernameAvailability.canProceed) {
        if (usernameAvailability.checking) {
          Alert.alert(t('editProfile.username'), t('editProfile.usernameWait'));
        } else if (usernameAvailability.available === false) {
          Alert.alert(t('editProfile.username'), t('editProfile.usernameTaken'));
        } else {
          Alert.alert(t('editProfile.username'), t('editProfile.usernameCheck'));
        }
        return;
      }
    }

    setIsSaving(true);
    try {
      const avatarUrl = await uploadAvatarIfNeeded(user.id);
      const updatedUser = {
        ...user,
        id: user.id, // always own user id for profile upsert
        displayName: displayName.trim(),
        username: nextUsernameNorm,
        usernameRequiresChange: false,
        profileImageUrl: avatarUrl || undefined,
        bio: bio.trim() || undefined,
        weight: weight.trim() ? parseFloat(weight.trim()) : undefined,
        gender: gender || undefined,
        dateOfBirth: dateOfBirth || undefined,
        city: city.trim() || undefined,
        bicepsEmoji: bicepsEmoji,
        favoriteGyms: gymIdsDraft.slice(0, 3),
        privacySettings: {
          ...user.privacySettings,
          profileVisibility,
        },
        updatedAt: new Date(),
      };

      const savedGymIds = await persistUserHomeGyms(
        user.id,
        gymIdsDraft.slice(0, 3),
      );
      const userWithGyms = {...updatedUser, favoriteGyms: savedGymIds};

      await upsertMyProfile(userWithGyms);

      const syncedFromAuth = await AuthService.syncProfileMetadataFromUser(userWithGyms);
      let finalUser: User = {
        ...userWithGyms,
        ...syncedFromAuth,
        id: userWithGyms.id,
        email: userWithGyms.email,
        gdprConsent: userWithGyms.gdprConsent,
        featuredBadgeIds:
          userWithGyms.featuredBadgeIds ?? syncedFromAuth.featuredBadgeIds,
        favoriteGyms: savedGymIds,
      };
      finalUser = await mergeProfileUsernameIntoUser(finalUser);
      emitProfileCentersChanged(user.id);

      if (displayName !== user.displayName) {
        setLastDisplayNameChange(new Date());
      }
      if (usernameNormChanged) {
        setLastUsernameChange(new Date());
      }

      setUser(finalUser, {skipProfileSync: true});
      void useFriendStore.getState().load(finalUser.id);
      useChatStore.getState().updateMyDmParticipantLabels(
        finalUser.id,
        (finalUser.displayName || '').trim() || 'Dig',
      );
      Alert.alert(t('editProfile.profileUpdated'), t('editProfile.profileUpdatedBody'));
      navigation.goBack();
    } catch (err) {
      if (__DEV__) {
        console.warn('[EditProfile] save failed', err);
      }
      Alert.alert(t('common.error'), userFacingSaveError(err));
      return;
    } finally {
      setIsSaving(false);
    }
  };

  const getProfileVisibilityLabel = (visibility: ProfileVisibility): string => {
    switch (visibility) {
      case 'friends':
        return t('editProfile.visibilityFriends');
      case 'friends_and_gyms':
        return t('editProfile.visibilityFriendsAndGyms');
      case 'everyone':
        return t('editProfile.visibilityEveryone');
      case 'private':
        return t('editProfile.visibilityPrivate');
      default:
        return t('editProfile.visibilityPrivate');
    }
  };

  const getGenderLabel = (g: string): string => {
    switch (g) {
      case 'male':
        return t('editProfile.genderMale');
      case 'female':
        return t('editProfile.genderFemale');
      case 'other':
        return t('editProfile.genderOther');
      case 'prefer_not_to_say':
        return t('editProfile.genderPreferNot');
      default:
        return t('editProfile.selectGender');
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(intlLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleProfilePhotoPick = () => {
    Alert.alert(t('editProfile.pickPhotoTitle'), t('editProfile.pickPhotoHow'), [
      {
        text: t('editProfile.takePhoto'),
        onPress: async () => {
          const cameraOptions: CameraOptions = {
            mediaType: 'photo',
            cameraType: 'front',
            saveToPhotos: false,
            quality: 0.8,
          };
          const response: ImagePickerResponse = await launchCamera(cameraOptions);
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setProfileImageUrl(asset.uri);
          }
        },
      },
      {
        text: t('editProfile.chooseLibrary'),
        onPress: async () => {
          const response: ImagePickerResponse = await launchImageLibrary({
            mediaType: 'photo',
            selectionLimit: 1,
            quality: 0.8,
          });
          const asset = response.assets && response.assets[0];
          if (asset?.uri) {
            setProfileImageUrl(asset.uri);
          }
        },
      },
      {text: t('common.cancel'), style: 'cancel'},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('editProfile.title')}</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          style={[styles.saveButton, saveBlockedByUsername && styles.saveButtonDisabled]}
          activeOpacity={0.7}
          disabled={saveBlockedByUsername}>
          <Text style={styles.saveButtonText}>
            {isSaving ? t('editProfile.saving') : t('editProfile.save')}
          </Text>
        </TouchableOpacity>
      </View>

      {forceUsernameChange ? (
        <View style={styles.forceBanner}>
          <Text style={styles.forceBannerText}>{t('editProfile.forceUsernameBanner')}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Image */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.profilePhoto')}</Text>
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={handleProfilePhotoPick}
            onPressIn={() =>
              Animated.spring(photoScale, {
                toValue: 0.97,
                friction: 6,
                tension: 300,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(photoScale, {
                toValue: 1,
                friction: 6,
                tension: 240,
                useNativeDriver: true,
              }).start()
            }
            activeOpacity={0.8}>
            <Animated.View style={{transform: [{scale: photoScale}]}}>
              {profileImageUrl ? (
                <Image source={{uri: profileImageUrl}} style={styles.profileImage} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Icon name="camera" size={32} color={colors.primary} />
                </View>
              )}
            </Animated.View>
            <View style={styles.imageEditOverlay}>
              <Icon name="pencil" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Display Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.name')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('editProfile.namePlaceholder')}
            placeholderTextColor="#8E8E93"
          />
          {!canChangeDisplayName() && displayName !== user?.displayName && (
            <Text style={styles.warningText}>
              {t('editProfile.nameChangeWarning')}
            </Text>
          )}
        </View>

        {/* Username */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.username')}</Text>
          <TextInput
            style={[
              styles.input,
              usernameAvailability.formatError || usernameAvailability.available === false
                ? styles.inputUsernameErr
                : usernameAvailability.available === true && !usernameAvailability.formatError
                  ? styles.inputUsernameOk
                  : null,
            ]}
            value={username}
            onChangeText={t => setUsername(normalizeUsernameInput(t))}
            placeholder={t('editProfile.usernamePlaceholder')}
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          <Text style={styles.helperMuted}>{t('editProfile.usernameRules')}</Text>
          {usernameAvailability.formatError ? (
            <View style={styles.usernameStatusRow}>
              <Icon name="close-circle" size={16} color={colors.error} />
              <Text style={styles.hintErr}>{usernameAvailability.formatError}</Text>
            </View>
          ) : usernameAvailability.checking && normalizeUsernameForStorage(username).length > 0 ? (
            <Text style={styles.helperMuted}>{t('editProfile.usernameChecking')}</Text>
          ) : usernameAvailability.available === false ? (
            <View style={styles.usernameStatusRow}>
              <Icon name="close-circle" size={16} color={colors.error} />
              <Text style={styles.hintErr}>{t('editProfile.usernameTaken')}</Text>
            </View>
          ) : usernameAvailability.available === true && usernameNormChanged ? (
            <View style={styles.usernameStatusRow}>
              <Icon name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={styles.hintOk}>{t('editProfile.usernameAvailable')}</Text>
            </View>
          ) : null}
          {!canChangeUsername() && usernameNormChanged && (
            <Text style={styles.warningText}>
              Du kan kun ændre dit brugernavn hver 14. dag
            </Text>
          )}
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.bio')}</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('editProfile.bioPlaceholder')}
            placeholderTextColor="#8E8E93"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Default Biceps Emoji */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.defaultBiceps')}</Text>
          <View style={styles.bicepsGrid}>
            {bicepsOptions.map(option => (
              <Pressable
                key={option}
                style={({pressed}) => [
                  styles.bicepsOption,
                  bicepsEmoji === option && styles.bicepsOptionSelected,
                  pressed && styles.bicepsOptionPressed,
                ]}
                onPress={() => setBicepsEmoji(option)}
                android_ripple={{color: '#00000010'}}>
                <Text style={styles.bicepsEmoji}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Weight */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.weight')}</Text>
          <View style={styles.weightInputContainer}>
            <TextInput
              style={[styles.input, styles.weightInput]}
              value={weight}
              onChangeText={(text) => {
                // Only allow numbers and one decimal point
                const numericValue = text.replace(/[^0-9.]/g, '');
                // Ensure only one decimal point
                const parts = numericValue.split('.');
                if (parts.length > 2) {
                  setWeight(parts[0] + '.' + parts.slice(1).join(''));
                } else {
                  setWeight(numericValue);
                }
              }}
              placeholder={t('editProfile.weightPlaceholder')}
              placeholderTextColor="#8E8E93"
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightUnit}>kg</Text>
          </View>
        </View>

        {/* Gender */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.gender')}</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowGenderPicker(!showGenderPicker)}
            activeOpacity={0.7}>
            <Text style={[styles.pickerButtonText, !gender && styles.pickerButtonPlaceholder]}>
              {gender ? getGenderLabel(gender) : t('editProfile.selectGender')}
            </Text>
            <Icon name="chevron-down" size={20} color="#8E8E93" />
          </TouchableOpacity>
          {showGenderPicker && (
            <View style={styles.pickerOptions}>
              {(['male', 'female', 'other', 'prefer_not_to_say'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.pickerOption,
                    gender === option && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setGender(option);
                    setShowGenderPicker(false);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.pickerOptionText,
                      gender === option && styles.pickerOptionTextSelected,
                    ]}>
                    {getGenderLabel(option)}
                  </Text>
                  {gender === option && (
                    <Icon name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Date of Birth */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.birthday')}</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}>
            <Text style={styles.pickerButtonText}>
              {formatDate(dateOfBirth)}
            </Text>
            <Icon name="calendar-outline" size={20} color="#8E8E93" />
          </TouchableOpacity>
          {showDatePicker && (
            <>
              <DateTimePicker
                value={dateOfBirth}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === 'android') {
                    setShowDatePicker(false);
                    if (event.type === 'set' && selectedDate) {
                      setDateOfBirth(selectedDate);
                    }
                  } else {
                    // iOS - update date but keep picker open
                    if (selectedDate) {
                      setDateOfBirth(selectedDate);
                    }
                  }
                }}
                maximumDate={new Date()}
                locale="da-DK"
              />
              {Platform.OS === 'ios' && (
                <View style={styles.datePickerButtonContainer}>
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(false)}
                    activeOpacity={0.7}>
                    <Text style={styles.datePickerButtonText}>{t('editProfile.pickDate')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* City */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.city')}</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder={t('editProfile.cityPlaceholder')}
            placeholderTextColor="#8E8E93"
          />
        </View>

        {/* Lokale centre (1 påkrævet, 2 valgfri) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.localCentres')}</Text>
          <GymSlotsEditor
            key={(user?.favoriteGyms ?? []).join('-') || 'gym-slots'}
            initialIds={user?.favoriteGyms ?? []}
            onIdsChange={handleGymIdsChange}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('editProfile.privacySettings')}</Text>
          
          <View style={styles.visibilitySection}>
            <Text style={styles.settingLabel}>{t('editProfile.profileVisibility')}</Text>
            <View style={styles.visibilityOptions}>
              {(['everyone', 'friends_and_gyms', 'friends', 'private'] as ProfileVisibility[]).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.visibilityOption,
                    profileVisibility === option && styles.visibilityOptionSelected,
                  ]}
                  onPress={() => setProfileVisibility(option)}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.visibilityOptionText,
                      profileVisibility === option && styles.visibilityOptionTextSelected,
                    ]}>
                    {getProfileVisibilityLabel(option)}
                  </Text>
                  {profileVisibility === option && (
                    <Icon name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginRight: 40, // Balance out the back button width
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  forceBanner: {
    backgroundColor: colors.primary + '14',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  forceBannerText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  imageContainer: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignSelf: 'center',
    position: 'relative',
  },
  profileImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  imagePlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.primary + '16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageEditOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.backgroundCard,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#F4F5F8',
  },
  inputUsernameOk: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputUsernameErr: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  helperMuted: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  hintOk: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  hintErr: {
    fontSize: 13,
    color: colors.error,
    flex: 1,
  },
  usernameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  bioInput: {
    height: 100,
    paddingTop: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
  },
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightInput: {
    flex: 1,
    marginRight: 8,
  },
  weightUnit: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F4F5F8',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#000',
  },
  pickerButtonPlaceholder: {
    color: '#8E8E93',
  },
  pickerOptions: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#F4F5F8',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  pickerOptionSelected: {
    backgroundColor: '#E3F2FD',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#000',
  },
  pickerOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  datePickerButtonContainer: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  datePickerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  datePickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  visibilitySection: {
    marginTop: 8,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  visibilityOptions: {
    gap: 8,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  visibilityOptionSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  visibilityOptionText: {
    fontSize: 16,
    color: '#000',
  },
  visibilityOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  bicepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  bicepsOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F4F5F8',
    borderWidth: 1.25,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bicepsOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.25,
    shadowRadius: 9,
    elevation: 3,
  },
  bicepsOptionPressed: {
    transform: [{scale: 0.97}],
  },
  bicepsEmoji: {
    fontSize: 24,
  },
});

export default EditProfileScreen;

