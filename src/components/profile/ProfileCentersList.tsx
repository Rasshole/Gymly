/**
 * Home gyms on profile — premium cards with logo, name, primary badge.
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {useTranslation} from '@/i18n';

export type ProfileCenterRow = {
  centerId?: string;
  name: string;
  city?: string;
  brand?: string;
};

type ProfileCentersListProps = {
  centers: ProfileCenterRow[];
  sectionTitle?: string;
  activeCountForId?: (centerId: string) => number;
  onEditPress?: () => void;
};

export const ProfileCentersList: React.FC<ProfileCentersListProps> = ({
  centers,
  sectionTitle,
  activeCountForId,
  onEditPress,
}) => {
  const {t} = useTranslation();
  const title = sectionTitle ?? t('profile.homeGyms');

  if (centers.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {onEditPress ? (
          <TouchableOpacity
            onPress={onEditPress}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}
            style={styles.editBtn}>
            <Icon name="pencil" size={14} color={colors.primary} />
            <Text style={styles.editBtnText}>{t('profile.editGyms')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.cardsCol}>
        {centers.map((c, i) => {
          const active =
            c.centerId && activeCountForId ? activeCountForId(c.centerId) : 0;
          const isPrimary = i === 0;
          return (
            <View
              key={`${c.centerId ?? 'noid'}_${c.name}_${i}`}
              style={[styles.gymCard, isPrimary && styles.gymCardPrimary]}>
              <GymLogoView
                gymName={c.name}
                brand={c.brand}
                size={48}
                unknownFallback="gymly-only"
                surface="lavender"
                style={styles.rowLogo}
              />
              <View style={styles.textCol}>
                {isPrimary ? (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>
                      {t('profile.primaryGym')}
                    </Text>
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
                  <View style={styles.activePill}>
                    <Text style={styles.activeLine} numberOfLines={1}>
                      {t(active === 1 ? 'profile.activeNow_one' : 'profile.activeNow_other', {
                        count: String(active),
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  title: {
    ...typography.small,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '10',
  },
  editBtnText: {
    ...typography.small,
    fontWeight: '700',
    color: colors.primary,
  },
  cardsCol: {
    gap: spacing.sm,
  },
  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.sm,
  },
  gymCardPrimary: {
    borderColor: colors.primary + '35',
    backgroundColor: colors.primary + '06',
    ...shadows.card,
  },
  rowLogo: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  primaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '18',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '40',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  primaryBadgeText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  city: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  activePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  activeLine: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
