/**
 * Push-indstillinger — synkes til `notification_preferences` (påvirker udsendelse fra Edge Function).
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {useAppStore} from '@/store/appStore';
import {
  fetchNotificationPreferences,
  upsertNotificationPreferences,
} from '@/services/push/notificationPreferencesService';
import {spacing, typography, radius} from '@/theme/designTokens';
import {
  requestUserPermission,
  getFcmToken,
  getPushPermissionStatus,
  savePushTokenToSupabase,
  setPushTokenEnabledForUser,
} from '@/services/push/pushTokenService';

const PushNotificationsScreen = () => {
  const userId = useAppStore(s => s.user?.id);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [messages, setMessages] = useState(true);
  const [friendReq, setFriendReq] = useState(true);
  const [checkins, setCheckins] = useState(true);
  const [badges, setBadges] = useState(true);
  const [planned, setPlanned] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    setLoading(true);
    try {
      const p = await fetchNotificationPreferences(userId);
      setPushEnabled(p.push_enabled);
      setMessages(p.messages_enabled);
      setFriendReq(p.friend_requests_enabled);
      setCheckins(p.check_ins_enabled);
      setBadges(p.badges_streaks_enabled);
      setPlanned(p.planned_workouts_enabled);
      setReminders(p.workout_reminders_enabled);
    } catch (e) {
      Alert.alert('Fejl', 'Kunne ikke hente notifikationsindstillinger');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const persist = async (patch: Parameters<typeof upsertNotificationPreferences>[1]) => {
    if (!userId) {
      return;
    }
    try {
      await upsertNotificationPreferences(userId, patch);
    } catch {
      Alert.alert('Fejl', 'Kunne ikke gemme');
      load().catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Icon name="notifications-outline" size={48} color={colors.primary} />
          <Text style={styles.headerTitle}>Push-notifikationer</Text>
          <Text style={styles.headerDescription}>
            Styring af hvilke telefon-notifikationer du vil modtage. Hvis du afviser
            systemtilladelsen, kan du slå det til senere i enhedsindstillinger.
          </Text>
          <Text style={styles.linkHint} onPress={() => Linking.openSettings()}>
            Åbn indstillinger for Gymly
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hovedkontakt</Text>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Push-notifikationer</Text>
            <Switch
              value={pushEnabled}
              disabled={loading}
              onValueChange={async v => {
                setPushEnabled(v);
                if (v) {
                  const ok = await requestUserPermission();
                  const status = await getPushPermissionStatus();
                  if (__DEV__) {
                    console.log('[push] settings permission status:', status);
                  }
                  if (!ok) {
                    Alert.alert(
                      'Notifikationer er slået fra',
                      'Du kan slå notifikationer til i enhedsindstillinger for Gymly.',
                      [
                        {text: 'Ikke nu'},
                        {text: 'Åbn indstillinger', onPress: () => Linking.openSettings()},
                      ],
                    );
                  }
                  if (ok && userId) {
                    const t = await getFcmToken();
                    if (__DEV__) {
                      console.log('[push] settings token generated:', Boolean(t));
                    }
                    if (t) {
                      await savePushTokenToSupabase(userId, t);
                      if (__DEV__) {
                        console.log('[push] settings token saved:', true);
                      }
                    }
                  }
                }
                if (userId) {
                  await setPushTokenEnabledForUser(userId, v);
                }
                await persist({push_enabled: v});
              }}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Kategorier</Text>
          {[
            {label: 'Beskeder (DM)', value: messages, on: setMessages, key: 'messages_enabled' as const},
            {label: 'Venneanmodninger & accept', value: friendReq, on: setFriendReq, key: 'friend_requests_enabled' as const},
            {label: 'Når venner tjekker ind', value: checkins, on: setCheckins, key: 'check_ins_enabled' as const},
            {label: 'Badges & streaks', value: badges, on: setBadges, key: 'badges_streaks_enabled' as const},
            {label: 'Planlagte sessions (invitationer)', value: planned, on: setPlanned, key: 'planned_workouts_enabled' as const},
            {label: 'Træningspåmindelser', value: reminders, on: setReminders, key: 'workout_reminders_enabled' as const},
          ].map(r => (
            <View key={r.key} style={styles.row}>
              <Text style={styles.rowTitle}>{r.label}</Text>
              <Switch
                value={r.value}
                disabled={loading || !pushEnabled}
                onValueChange={async v => {
                  r.on(v);
                  await persist({[r.key]: v});
                }}
                trackColor={{false: '#E5E5EA', true: '#34C759'}}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  scroll: {flex: 1},
  content: {padding: 16, paddingBottom: 40},
  headerSection: {alignItems: 'center', paddingVertical: 24, marginBottom: 8},
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  linkHint: {marginTop: 10, color: colors.primary, fontSize: 15, fontWeight: '600'},
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: {...typography.body, flex: 1, marginRight: 12, color: colors.text},
});

export default PushNotificationsScreen;
