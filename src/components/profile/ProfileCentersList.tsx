/**
 * Liste over brugerens lokale centre (1–3) under profilheader
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';

export type ProfileCenterRow = {
  /** Stabilt center-id fra register — valgfrit for ældre navigations-fallback uden id */
  centerId?: string;
  name: string;
  city?: string;
  brand?: string;
};

type ProfileCentersListProps = {
  centers: ProfileCenterRow[];
  /** Default: "Dine centre" — brug fx "Lokale centre" på andres profil */
  sectionTitle?: string;
  /** Aktive brugere på centeret lige nu (fx fra gymStore) */
  activeCountForId?: (centerId: string) => number;
  /** Egen profil: åbn redigerings-sheet */
  onEditPress?: () => void;
};

export const ProfileCentersList: React.FC<ProfileCentersListProps> = ({
  centers,
  sectionTitle = 'Dine centre',
  activeCountForId,
  onEditPress,
}) => {
  if (centers.length === 0) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{sectionTitle}</Text>
        {onEditPress ? (
          <TouchableOpacity
            onPress={onEditPress}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}
            style={styles.editBtn}>
            <Icon name="pencil" size={14} color={colors.primary} />
            <Text style={styles.editBtnText}>Rediger</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {centers.map((c, i) => {
        const active =
          c.centerId && activeCountForId ? activeCountForId(c.centerId) : 0;
        return (
          <View
            key={`${c.centerId ?? 'noid'}_${c.name}_${i}`}
            style={[styles.row, i > 0 && styles.rowDivider]}>
            <GymLogoView
              gymName={c.name}
              brand={c.brand}
              size={40}
              unknownFallback="gymly-only"
              surface="lavender"
              style={styles.rowLogo}
            />
            <View style={styles.textCol}>
              {i === 0 ? (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Primært center</Text>
                </View>
              ) : null}
              <Text style={styles.name} numberOfLines={2}>
                {formatGymNameWithBrand(c.name, c.brand)}
              </Text>
              {c.city ? (
                <Text style={styles.city} numberOfLines={1}>
                  {c.city}
                </Text>
              ) : null}
              {active > 0 ? (
                <Text style={styles.activeLine} numberOfLines={1}>
                  👥 {active} aktiv{active > 1 ? 'e' : ''} nu
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editBtnText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  rowLogo: {
    marginRight: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 2,
  },
  textCol: {flex: 1},
  primaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '18',
    borderWidth: 1,
    borderColor: colors.primary + '35',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  primaryBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  city: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activeLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
});
