/**
 * Liste over brugerens lokale centre (1–3) under profilheader
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import GymLogoView from '@/components/ui/GymLogoView';

export type ProfileCenterRow = {
  name: string;
  city?: string;
  brand?: string;
};

type ProfileCentersListProps = {
  centers: ProfileCenterRow[];
  /** Default: "Dine centre" — brug fx "Lokale centre" på andres profil */
  sectionTitle?: string;
};

export const ProfileCentersList: React.FC<ProfileCentersListProps> = ({
  centers,
  sectionTitle = 'Dine centre',
}) => {
  if (centers.length === 0) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{sectionTitle}</Text>
      {centers.map((c, i) => (
        <View
          key={`${c.name}_${i}`}
          style={[styles.row, i > 0 && styles.rowDivider]}>
          <Text style={styles.badge}>{i + 1}</Text>
          <GymLogoView
            gymName={c.name}
            brand={c.brand}
            size={40}
            style={styles.rowLogo}
          />
          <View style={styles.textCol}>
            <Text style={styles.name} numberOfLines={2}>
              {c.name}
            </Text>
            {c.city ? (
              <Text style={styles.city} numberOfLines={1}>
                {c.city}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  badge: {
    ...typography.small,
    fontWeight: '700',
    color: colors.primary,
    width: 18,
  },
  rowLogo: {marginRight: 4},
  textCol: {flex: 1},
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
});
