/**
 * Edit Profile Screen
 * Screen for editing user profile: bio, image, privacy settings, name, username
 */

import React, {useState, useCallback, useRef} from 'react';
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
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {GymSlotsEditor} from '@/components/profile/GymSlotsEditor';
import {ProfileVisibility} from '@/types/user.types';
import {
  spacing,
  radius,
  typography,
  shadows,
} from '@/theme/designTokens';
import colors from '@/theme/colors';
import {
  launchCamera,
  launchImageLibrary,
  CameraOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

type EditProfileNavigationProp = StackNavigationProp<any>;

const EditProfileScreen = () => {
  const navigation = useNavigation<EditProfileNavigationProp>();
  const {user, setUser} = useAppStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
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
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    user?.privacySettings.profileVisibility || 'private'
  );
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

  const handleSave = () => {
    if (!user) return;

    if (gymIdsDraft.length < 1) {
      Alert.alert(
        'Lokale centre',
        'Vælg mindst ét primært lokale center (felt 1).',
      );
      return;
    }

    // Validate display name change
    if (displayName !== user.displayName) {
      if (!canChangeDisplayName()) {
        const daysUntil = Math.ceil(14 - ((Date.now() - lastDisplayNameChange!.getTime()) / (1000 * 60 * 60 * 24)));
        Alert.alert(
          'Kan ikke ændre navn',
          `Du kan ændre dit navn igen om ${daysUntil} dag${daysUntil !== 1 ? 'e' : ''}. Du kan kun ændre dit navn hver 14. dag.`
        );
        setDisplayName(user.displayName);
        return;
      }
    }

    // Validate username change
    if (username !== user.username) {
      if (!canChangeUsername()) {
        const daysUntil = Math.ceil(14 - ((Date.now() - lastUsernameChange!.getTime()) / (1000 * 60 * 60 * 24)));
        Alert.alert(
          'Kan ikke ændre brugernavn',
          `Du kan ændre dit brugernavn igen om ${daysUntil} dag${daysUntil !== 1 ? 'e' : ''}. Du kan kun ændre dit brugernavn hver 14. dag.`
        );
        setUsername(user.username);
        return;
      }
    }

    // Update user
    const updatedUser = {
      ...user,
      displayName: displayName.trim(),
      username: username.trim(),
      profileImageUrl: profileImageUrl.trim() || undefined,
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

    if (displayName !== user.displayName) {
      setLastDisplayNameChange(new Date());
    }
    if (username !== user.username) {
      setLastUsernameChange(new Date());
    }

    setUser(updatedUser);
    Alert.alert('Profil opdateret', 'Dine ændringer er blevet gemt.');
    navigation.goBack();
  };

  const getProfileVisibilityLabel = (visibility: ProfileVisibility): string => {
    switch (visibility) {
      case 'friends':
        return 'Kun Venner';
      case 'friends_and_gyms':
        return 'Venner & Lokal Centre';
      case 'everyone':
        return 'Alle';
      case 'private':
        return 'Privat';
      default:
        return 'Privat';
    }
  };

  const getGenderLabel = (g: string): string => {
    switch (g) {
      case 'male':
        return 'Mand';
      case 'female':
        return 'Kvinde';
      case 'other':
        return 'Andet';
      case 'prefer_not_to_say':
        return 'Foretrækker ikke at sige';
      default:
        return 'Vælg køn';
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleProfilePhotoPick = () => {
    Alert.alert('Vælg profilbillede', 'Hvordan vil du tilføje et billede?', [
      {
        text: 'Tag billede',
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
        text: 'Vælg fra bibliotek',
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
      {text: 'Annuller', style: 'cancel'},
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
        <Text style={styles.headerTitle}>Rediger Profil</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          activeOpacity={0.7}>
          <Text style={styles.saveButtonText}>Gem</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Image */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profilbillede</Text>
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
          <Text style={styles.sectionTitle}>Navn</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Dit navn"
            placeholderTextColor="#8E8E93"
          />
          {!canChangeDisplayName() && displayName !== user?.displayName && (
            <Text style={styles.warningText}>
              Du kan kun ændre dit navn hver 14. dag
            </Text>
          )}
        </View>

        {/* Username */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brugernavn</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Dit brugernavn"
            placeholderTextColor="#8E8E93"
          />
          {!canChangeUsername() && username !== user?.username && (
            <Text style={styles.warningText}>
              Du kan kun ændre dit brugernavn hver 14. dag
            </Text>
          )}
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Fortæl lidt om dig selv..."
            placeholderTextColor="#8E8E93"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Default Biceps Emoji */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Standard biceps emoji</Text>
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
          <Text style={styles.sectionTitle}>Vægt</Text>
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
              placeholder="Vægt i kg"
              placeholderTextColor="#8E8E93"
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightUnit}>kg</Text>
          </View>
        </View>

        {/* Gender */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Køn</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowGenderPicker(!showGenderPicker)}
            activeOpacity={0.7}>
            <Text style={[styles.pickerButtonText, !gender && styles.pickerButtonPlaceholder]}>
              {gender ? getGenderLabel(gender) : 'Vælg køn'}
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
          <Text style={styles.sectionTitle}>Fødselsdag</Text>
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
                    <Text style={styles.datePickerButtonText}>Vælg</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* City */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Din by"
            placeholderTextColor="#8E8E93"
          />
        </View>

        {/* Lokale centre (1 påkrævet, 2 valgfri) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lokale centre</Text>
          <GymSlotsEditor
            key={(user?.favoriteGyms ?? []).join('-') || 'gym-slots'}
            initialIds={user?.favoriteGyms ?? []}
            onIdsChange={handleGymIdsChange}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privatindstillinger</Text>
          
          <View style={styles.visibilitySection}>
            <Text style={styles.settingLabel}>Profil synlighed</Text>
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

