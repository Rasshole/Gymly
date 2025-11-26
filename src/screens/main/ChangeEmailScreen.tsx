/**
 * Change Email Screen
 * Allows user to change their email address
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';

const ChangeEmailScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user, setUser} = useAppStore();
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const currentEmail = user?.email || '';

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSave = async () => {
    if (!newEmail.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en ny email adresse');
      return;
    }

    if (!validateEmail(newEmail)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email adresse');
      return;
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      Alert.alert('Info', 'Dette er allerede din nuværende email adresse');
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Implement actual API call to update email
      // For now, update local user state
      if (user) {
        const updatedUser = {
          ...user,
          email: newEmail.trim(),
          updatedAt: new Date(),
        };
        setUser(updatedUser);
        
        Alert.alert(
          'Succes',
          'Din email adresse er blevet opdateret',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ],
        );
      }
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere email adresse. Prøv igen senere.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Skift Email</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Current Email */}
          <View style={styles.section}>
            <Text style={styles.label}>Nuværende email</Text>
            <View style={styles.currentEmailContainer}>
              <Text style={styles.currentEmail}>{currentEmail}</Text>
            </View>
          </View>

          {/* New Email Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Ny email</Text>
            <TextInput
              style={styles.input}
              placeholder="Indtast ny email adresse"
              placeholderTextColor="#8E8E93"
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!newEmail.trim() || isLoading) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!newEmail.trim() || isLoading}
            activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>
              {isLoading ? 'Gemmer...' : 'Gem'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  currentEmailContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  currentEmail: {
    fontSize: 16,
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    fontSize: 16,
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ChangeEmailScreen;


