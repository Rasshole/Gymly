/**
 * NearbyCentersCarousel – Horizontal scroll of nearest centers
 */

import React, {useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GymLogoView from '@/components/ui/GymLogoView';
import colors from '@/theme/colors';
import {radius, spacing} from '@/theme/designTokens';
import type {DanishGym} from '@/data/danishGyms';
import {useTranslation} from '@/i18n';

export interface NearbyCenterItem {
  gym: DanishGym;
  distanceText: string;
  totalActiveCount: number;
  friendsActiveCount: number;
}

export interface NearbyCentersCarouselProps {
  centers: NearbyCenterItem[];
  selectedGymId: string | null;
  onSelectCenter: (gym: DanishGym) => void;
  /** When any gym has active check-ins, show "Aktive centre" / "Active gyms". */
  hasActiveGyms?: boolean;
}

const CARD_WIDTH = Dimensions.get('window').width * 0.74;
const CARD_MARGIN = 12;

function NearbyCard({
  item,
  isSelected,
  onPress,
}: {
  item: NearbyCenterItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const {gym, distanceText, totalActiveCount, friendsActiveCount} = item;
  const hasActivity = totalActiveCount > 0 || friendsActiveCount > 0;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.985,
          friction: 9,
          tension: 280,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 140,
          useNativeDriver: true,
        }).start();
      }}>
      <Animated.View style={[styles.card, isSelected && styles.cardSelected, {transform: [{scale}]}]}>
        <View style={styles.logoSection}>
          <View style={styles.logoFrame}>
            <GymLogoView gymName={gym.name} brand={gym.brand} size={72} style={styles.logoFill} />
          </View>
        </View>
        <View style={styles.infoSection}>
          <Text style={styles.gymName} numberOfLines={1}>
            {gym.name}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.distanceText}>{distanceText}</Text>
          </View>
          {hasActivity ? (
            <View style={styles.activityRow}>
              {totalActiveCount > 0 ? (
                <View style={styles.activityChip}>
                  <Icon name="people" size={11} color={colors.secondary} />
                  <Text style={[styles.activityChipText, {color: colors.secondary}]}>
                    {t('map.activeCount', {count: String(totalActiveCount)})}
                  </Text>
                </View>
              ) : null}
              {friendsActiveCount > 0 ? (
                <View style={[styles.activityChip, styles.activityChipFriends]}>
                  <Icon name="person" size={11} color={colors.primary} />
                  <Text style={[styles.activityChipText, {color: colors.primaryDark}]}>
                    {t('map.friendsCount', {count: String(friendsActiveCount)})}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.activityEmpty}>{t('map.noOneCheckedIn')}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const NearbyCentersCarousel: React.FC<NearbyCentersCarouselProps> = ({
  centers,
  selectedGymId,
  onSelectCenter,
  hasActiveGyms = false,
}) => {
  const {t} = useTranslation();
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

  if (centers.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        {hasActiveGyms ? t('map.activeGyms') : t('map.nearYou')}
      </Text>
      <FlatList
        ref={flatListRef}
        data={centers}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.gym.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => (
          <NearbyCard
            item={item}
            isSelected={selectedGymId === item.gym.id}
            onPress={() => onSelectCenter(item.gym)}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    letterSpacing: -0.3,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.xl,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: radius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 6},
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: {elevation: 5},
    }),
  },
  cardSelected: {
    borderColor: colors.primary + '55',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {elevation: 7},
    }),
  },
  logoSection: {
    width: 92,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    justifyContent: 'center',
  },
  logoFrame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.backgroundCard,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  logoFill: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
  },
  infoSection: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
    justifyContent: 'center',
  },
  gymName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginLeft: 4,
  },
  activityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  activityChipFriends: {
    backgroundColor: colors.primary + '10',
  },
  activityChipText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  activityEmpty: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
});

export default NearbyCentersCarousel;
