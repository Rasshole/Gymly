/**
 * Favorite Gyms Selector
 * Modal screen to select top 3 favorite gyms
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {colors} from '@/theme/colors';

interface FavoriteGymsSelectorProps {
  visible: boolean;
  onClose: () => void;
}

const FavoriteGymsSelector = ({visible, onClose}: FavoriteGymsSelectorProps) => {
  const {user, setFavoriteGyms} = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGyms, setSelectedGyms] = useState<number[]>(
    user?.favoriteGyms || [],
  );

  const filteredGyms = useMemo(() => {
    return danishGyms.filter(
      gym =>
        gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gym.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gym.brand?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery]);

  const toggleGym = (gymId: number) => {
    setSelectedGyms(prev => {
      if (prev.includes(gymId)) {
        // Remove gym
        return prev.filter(id => id !== gymId);
      } else {
        // Add gym (max 3)
        if (prev.length >= 3) {
          // Replace last one
          return [prev[1], prev[2], gymId];
        }
        return [...prev, gymId];
      }
    });
  };

  const handleSave = () => {
    setFavoriteGyms(selectedGyms);
    onClose();
  };

  const GymIcon = ({gym}: {gym: DanishGym}) => {
    const [logoError, setLogoError] = useState(false);
    const logoUrl = getGymLogo(gym.brand);
    const hasLogo = hasGymLogo(gym.brand);

    if (hasLogo && logoUrl && !logoError) {
      return (
        <View style={styles.gymLogoContainer}>
          <Image
            source={{uri: logoUrl}}
            style={styles.gymLogo}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        </View>
      );
    }

    return (
      <View style={styles.gymIconPlaceholder}>
        <Icon name="fitness" size={20} color="#007AFF" />
      </View>
    );
  };

  const renderGymItem = ({item}: {item: DanishGym}) => {
    const isSelected = selectedGyms.includes(item.id);
    const position = selectedGyms.indexOf(item.id) + 1;

    return (
      <TouchableOpacity
        style={[styles.gymItem, isSelected && styles.gymItemSelected]}
        onPress={() => toggleGym(item.id)}
        activeOpacity={0.7}>
        <View style={styles.gymItemLeft}>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && (
              <View style={styles.positionBadge}>
                <Text style={styles.positionBadgeText}>{position}</Text>
              </View>
            )}
            {!isSelected && <Icon name="add" size={20} color="#C7C7CC" />}
          </View>
          <GymIcon gym={item} />
          <View style={styles.gymInfo}>
            <Text style={styles.gymName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.gymDetails}>
              {item.brand && (
                <Text style={styles.gymBrand} numberOfLines={1}>
                  {item.brand}
                </Text>
              )}
              {item.city && (
                <Text style={styles.gymLocation} numberOfLines={1}>
                  {item.city}
                </Text>
              )}
            </View>
            {item.address && (
              <Text style={styles.gymAddress} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>
        </View>
        {isSelected && (
          <Icon name="checkmark-circle" size={24} color="#34C759" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Vælg lokale centre</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.saveButton}
            disabled={selectedGyms.length === 0}>
            <Text
              style={[
                styles.saveButtonText,
                selectedGyms.length === 0 && styles.saveButtonTextDisabled,
              ]}>
              Gem
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Icon name="information-circle" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            Vælg op til 3 lokale træningscentre. Disse vil vises først i listen.
          </Text>
        </View>

        {/* Selected Count */}
        {selectedGyms.length > 0 && (
          <View style={styles.selectedContainer}>
            <Text style={styles.selectedText}>
              {selectedGyms.length} / 3 valgt
            </Text>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Søg efter centre..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}>
              <Icon name="close-circle" size={20} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>

        {/* Gyms List */}
        <FlatList
          data={filteredGyms}
          renderItem={renderGymItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </Modal>
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
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    padding: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  saveButtonTextDisabled: {
    color: colors.textMuted,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.secondary,
    marginLeft: 8,
  },
  selectedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  gymItemSelected: {
    backgroundColor: '#F0F9FF',
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  gymItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    borderColor: '#34C759',
    backgroundColor: '#34C759',
  },
  positionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymLogoContainer: {
    width: 40,
    height: 40,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymLogo: {
    width: 40,
    height: 40,
  },
  gymIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  positionBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.text,
  },
  gymInfo: {
    flex: 1,
  },
  gymName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gymDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gymBrand: {
    fontSize: 14,
    color: colors.secondary,
    marginRight: 8,
  },
  gymLocation: {
    fontSize: 14,
    color: colors.textMuted,
  },
  gymAddress: {
    fontSize: 12,
    color: colors.textMuted,
  },
  separator: {
    height: 8,
  },
});

export default FavoriteGymsSelector;

