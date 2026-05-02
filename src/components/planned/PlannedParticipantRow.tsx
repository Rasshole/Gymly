import React from 'react';
import {View, Text, Image, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type {PublicProfile} from '@/services/supabase/friendService';
import colors from '@/theme/colors';

const UNKNOWN = 'Ukendt bruger';

export function getPublicProfileInitials(p: PublicProfile | undefined): string {
  const name = p?.displayName?.trim() || p?.username?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return 'U';
}

function displayNameFor(p: PublicProfile | undefined): string {
  if (p?.displayName?.trim()) {
    return p.displayName.trim();
  }
  if (p?.username?.trim()) {
    return p.username.trim();
  }
  return UNKNOWN;
}

export type PlannedRowRight =
  | {mode: 'plan_status'; status: 'pending' | 'accepted' | 'declined'}
  | {mode: 'completed_joined'}
  | {mode: 'completed_no_show'};

type Props = {
  profile: PublicProfile | undefined;
  right: PlannedRowRight;
  style?: StyleProp<ViewStyle>;
};

export function PlannedParticipantRow({profile, right, style}: Props) {
  const name = displayNameFor(profile);
  const uname = profile?.username?.trim();

  return (
    <View style={[styles.row, style]}>
      {profile?.avatarUrl ? (
        <Image source={{uri: profile.avatarUrl}} style={styles.avatarImg} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getPublicProfileInitials(profile)}</Text>
        </View>
      )}
      <View style={styles.nameBlock}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {uname ? (
          <Text style={styles.username} numberOfLines={1}>
            @{uname}
          </Text>
        ) : null}
      </View>
      <PlannedRowRightContent right={right} />
    </View>
  );
}

function PlannedRowRightContent({right}: {right: PlannedRowRight}) {
  if (right.mode === 'plan_status') {
    if (right.status === 'accepted') {
      return (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.statusAccepted}>Accepteret</Text>
        </View>
      );
    }
    if (right.status === 'declined') {
      return (
        <View style={styles.statusRow}>
          <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          <Text style={styles.statusDeclined}>Afvist</Text>
        </View>
      );
    }
    return (
      <View style={styles.statusRow}>
        <Ionicons name="time-outline" size={16} color={colors.warning} />
        <Text style={styles.statusPending}>Venter</Text>
      </View>
    );
  }
  if (right.mode === 'completed_joined') {
    return (
      <View style={styles.statusRow}>
        <Ionicons name="fitness" size={16} color={colors.error} />
        <Text style={styles.statusCompleted}>Trænede med</Text>
      </View>
    );
  }
  return (
    <View style={styles.statusRow}>
      <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
      <Text style={styles.statusDeclined}>Deltog ikke</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  username: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '38%',
  },
  statusAccepted: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  statusPending: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
  },
  statusDeclined: {
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  statusCompleted: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
});
