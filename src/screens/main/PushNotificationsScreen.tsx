/**
 * Push notification preferences — synced to `notification_preferences`.
 */

import React, {useState, useEffect, useCallback, useMemo} from 'react';
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
import {useTranslation} from '@/i18n';

const PushNotificationsScreen = () => {
  const {t} = useTranslation();
  const userId = useAppStore(s => s.user?.id);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [messages, setMessages] = useState(true);
  const [friendReq, setFriendReq] = useState(true);
  const [checkins, setCheckins] = useState(true);
  const [badges, setBadges] = useState(true);
  const [planned, setPlanned] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [loading, setLoading] = useState(true);

  const categoryRows = useMemo(
    () =>
      [
        {
          label: t('pushSettings.catMessages'),
          value: messages,
          on: setMessages,
          key: 'messages_enabled' as const,
        },
        {
          label: t('pushSettings.catFriendRequests'),
          value: friendReq,
          on: setFriendReq,
          key: 'friend_requests_enabled' as const,
        },
        {
          label: t('pushSettings.catCheckIns'),
          value: checkins,
          on: setCheckins,
          key: 'check_ins_enabled' as const,
        },
        {
          label: t('pushSettings.catBadges'),
          value: badges,
          on: setBadges,
          key: 'badges_streaks_enabled' as const,
        },
        {
          label: t('pushSettings.catPlanned'),
          value: planned,
          on: setPlanned,
          key: 'planned_workouts_enabled' as const,
        },
        {
          label: t('pushSettings.catReminders'),
          value: reminders,
          on: setReminders,
          key: 'workout_reminders_enabled' as const,
        },
      ],
    [t, messages, friendReq, checkins, badges, planned, reminders],
  );

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
    } catch {
      Alert.alert(t('common.error'), t('pushSettings.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

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
      Alert.alert(t('common.error'), t('pushSettings.errorSave'));
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
          <Text style={styles.headerTitle}>{t('pushSettings.title')}</Text>
          <Text style={styles.headerDescription}>{t('pushSettings.description')}</Text>
          <Text style={styles.linkHint} onPress={() => Linking.openSettings()}>
            {t('pushSettings.openSettings')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('pushSettings.mainSection')}</Text>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{t('pushSettings.masterToggle')}</Text>
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
                      t('pushSettings.disabledTitle'),
                      t('pushSettings.disabledBody'),
                      [
                        {text: t('pushSettings.notNow')},
                        {
                          text: t('pushSettings.openSettingsBtn'),
                          onPress: () => Linking.openSettings(),
                        },
                      ],
                    );
                  }
                  if (ok && userId) {
                    const token = await getFcmToken();
                    if (__DEV__) {
                      console.log('[push] settings token generated:', Boolean(token));
                    }
                    if (token) {
                      await savePushTokenToSupabase(userId, token);
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
          <Text style={styles.sectionLabel}>{t('pushSettings.categoriesSection')}</Text>
          {categoryRows.map(r => (
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
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  linkHint: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  section: {marginBottom: 24},
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    marginBottom: 8,
  },
  rowTitle: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
});

export default PushNotificationsScreen;
