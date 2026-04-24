/**
 * SelectedCenterCard – Premium bottom card when a center is selected
 * Shows logo, name, address, distance, activity stats, status label
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GymLogoView from '@/components/ui/GymLogoView';
import colors from '@/theme/colors';
import {ACTIVITY_LABELS, type ActivityLevel} from '@/data/mapCenterActivity';

export interface SelectedCenterCardProps {
  gymName: string;
  brand?: string;
  city?: string;
  address?: string;
  distanceText: string;
  totalActiveCount: number;
  friendsActiveCount: number;
  activityLevel: ActivityLevel;
  friendNames?: string[];
  onClose: () => void;
  onViewDetails: () => void;
}

const SelectedCenterCard: React.FC<SelectedCenterCardProps> = ({
  gymName,
  brand,
  city,
  address,
  distanceText,
  totalActiveCount,
  friendsActiveCount,
  activityLevel,
  friendNames = [],
  onClose,
  onViewDetails,
}) => {
  const hasAnyone = totalActiveCount > 0 || friendsActiveCount > 0;
  const statusLabel = ACTIVITY_LABELS[activityLevel];
  const statusColor =
    activityLevel === 'busy'
      ? colors.secondary
      : activityLevel === 'moderate'
        ? colors.primary
        : colors.textMuted;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        activeOpacity={0.7}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Icon name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <GymLogoView gymName={gymName} brand={brand} size={56} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.gymName} numberOfLines={1}>
            {gymName}
          </Text>
          {city && (
            <Text style={styles.city} numberOfLines={1}>
              {city}
            </Text>
          )}
          <View style={styles.distanceRow}>
            <Icon name="location" size={14} color={colors.primary} />
            <Text style={styles.distanceText}>{distanceText} væk</Text>
          </View>
        </View>
      </View>

      {address && (
        <Text style={styles.address} numberOfLines={1}>
          {address}
        </Text>
      )}

      <View style={styles.activitySection}>
        {hasAnyone ? (
          <>
            <View style={styles.activityRow}>
              <View style={styles.activityItem}>
                <Icon name="people" size={18} color={colors.secondary} style={{marginRight: 6}} />
                <Text style={[styles.activityValue, {color: colors.secondary}]}>
                  {totalActiveCount} {totalActiveCount === 1 ? 'person' : 'personer'} aktive
                </Text>
              </View>
              <View style={styles.activityItem}>
                <Icon name="person" size={18} color={colors.primary} style={{marginRight: 6}} />
                <Text style={[styles.activityValue, {color: colors.primary}]}>
                  {friendsActiveCount} {friendsActiveCount === 1 ? 'ven' : 'venner'} aktive
                </Text>
              </View>
            </View>
            <View style={[styles.statusPill, {backgroundColor: `${statusColor}20`}]}>
              <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
              <Text style={[styles.statusText, {color: statusColor}]}>
                {statusLabel}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.activityEmpty}>Ingen er tjekket ind lige nu</Text>
        )}
      </View>

      {friendNames.length > 0 && (
        <View style={styles.friendsPreview}>
          <View style={styles.avatarRow}>
            {friendNames.slice(0, 3).map((name, i) => (
              <View key={i} style={[styles.miniAvatar, i === 0 && {marginLeft: 0}]}>
                <Text style={styles.miniAvatarText}>{name.charAt(0)}</Text>
              </View>
            ))}
            {friendNames.length > 3 && (
              <Text style={styles.moreText}>+{friendNames.length - 3}</Text>
            )}
          </View>
          <Text style={styles.friendsLabel}>
            {friendsActiveCount === 1 ? 'Ven' : 'Venner'} træner her nu
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.detailsButton}
        onPress={onViewDetails}
        activeOpacity={0.8}>
        <Text style={styles.detailsButtonText}>Se detaljer</Text>
        <Icon name="chevron-forward" size={18} color="#fff" style={{marginLeft: 6}} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    padding: 20,
    paddingTop: 18,
    marginHorizontal: 16,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  logoContainer: {
    marginRight: 14,
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  gymName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  city: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 4,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  address: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  activitySection: {
    marginBottom: 16,
  },
  activityRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  activityValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  activityEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  friendsPreview: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundCard,
    marginLeft: -8,
  },
  miniAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  moreText: {
    marginLeft: 12,
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  friendsLabel: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  detailsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default SelectedCenterCard;
