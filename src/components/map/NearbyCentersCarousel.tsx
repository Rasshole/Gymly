/**
 * NearbyCentersCarousel – Horizontal scroll of nearest centers
 * Shows logo, name, distance, activity (friends + total)
 */

import React, {useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GymLogoView from '@/components/ui/GymLogoView';
import colors from '@/theme/colors';
import type {DanishGym} from '@/data/danishGyms';

export interface NearbyCenterItem {
  gym: DanishGym;
  distanceText: string;
  totalActiveCount: number;
  friendsActiveCount: number;
}

export interface NearbyCentersCarouselProps {
  centers: NearbyCenterItem[];
  selectedGymId: number | null;
  onSelectCenter: (gym: DanishGym) => void;
}

const CARD_WIDTH = Dimensions.get('window').width * 0.72;
const CARD_MARGIN = 12;

const NearbyCentersCarousel: React.FC<NearbyCentersCarouselProps> = ({
  centers,
  selectedGymId,
  onSelectCenter,
}) => {
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (selectedGymId && centers.length > 0) {
      const index = centers.findIndex(c => c.gym.id === selectedGymId);
      if (index >= 0) {
        flatListRef.current?.scrollToOffset({
          offset: index * (CARD_WIDTH + CARD_MARGIN),
          animated: true,
        });
      }
    }
  }, [selectedGymId, centers]);

  const renderItem = ({item}: {item: NearbyCenterItem}) => {
    const {gym, distanceText, totalActiveCount, friendsActiveCount} = item;
    const isSelected = selectedGymId === gym.id;

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={() => onSelectCenter(gym)}
        activeOpacity={0.85}>
        <View style={styles.logoSection}>
          <GymLogoView gymName={gym.name} brand={gym.brand} size={100} style={styles.logoFill} />
        </View>
        <View style={styles.infoSection}>
          <Text style={styles.gymName} numberOfLines={1}>
            {gym.name}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="location" size={12} color={colors.primary} />
            <Text style={styles.distanceText}>{distanceText}</Text>
          </View>
          <View style={styles.activityRow}>
            <View style={styles.activityChip}>
              <Icon name="people" size={11} color={colors.secondary} />
              <Text style={[styles.activityChipText, {color: colors.secondary}]}>
                {totalActiveCount}
              </Text>
            </View>
            <View style={styles.activityChip}>
              <Icon name="person" size={11} color={colors.primary} />
              <Text style={[styles.activityChipText, {color: colors.primary}]}>
                {friendsActiveCount}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (centers.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Tæt på dig</Text>
      <FlatList
        ref={flatListRef}
        data={centers}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.gym.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingRight: 28,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  logoSection: {
    width: 88,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFill: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  infoSection: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  gymName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 6,
  },
  activityRow: {
    flexDirection: 'row',
  },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  activityChipText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
});

export default NearbyCentersCarousel;
