/**
 * Edit Profile Screen
 * Screen for editing user profile: bio, image, privacy settings, name, username
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
  Image,
  Switch,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {ProfileVisibility} from '@/types/user.types';

type EditProfileNavigationProp = StackNavigationProp<any>;

const EditProfileScreen = () => {
  const navigation = useNavigation<EditProfileNavigationProp>();
  const {user, setUser} = useAppStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState('');
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
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    user?.privacySettings.profileVisibility || 'private'
  );

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
      weight: weight.trim() ? parseFloat(weight.trim()) : undefined,
      gender: gender || undefined,
      dateOfBirth: dateOfBirth || undefined,
      city: city.trim() || undefined,
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
        return 'Kun Venner & Lokal Centre';
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
            onPress={() => {
              Alert.alert('Foto', 'Foto upload kommer snart');
            }}
            activeOpacity={0.8}>
            {profileImageUrl ? (
              <Image source={{uri: profileImageUrl}} style={styles.profileImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon name="camera" size={32} color="#007AFF" />
              </View>
            )}
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

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privatindstillinger</Text>
          
          <View style={styles.visibilitySection}>
            <Text style={styles.settingLabel}>Profil synlighed</Text>
            <View style={styles.visibilityOptions}>
              {(['everyone', 'friends', 'friends_and_gyms', 'private'] as ProfileVisibility[]).map(option => (
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
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
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
    color: '#007AFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    position: 'relative',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  imagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F8F9FA',
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
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
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
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
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
});

export default EditProfileScreen;

