import React, {useCallback, useEffect, useState} from 'react';
import {Alert, AppState, Linking} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTranslation} from '@/i18n';
import {useAppStore} from '@/store/appStore';
import {
  getFcmToken,
  getPushPermissionStatus,
  getMessaging,
  requestUserPermission,
  savePushTokenToSupabase,
  subscribeToTokenRefresh,
} from '@/services/push/pushTokenService';
import {ensureDefaultNotificationPreferences} from '@/services/push/notificationPreferencesService';
import {navigateFromPushData} from '@/services/push/handleNotificationOpen';
import NotificationPermissionPrompt from '@/components/push/NotificationPermissionPrompt';

const PROMPT_KEY = '@gymly/push_prompt_completed_v1';

/**
 * Efter login: token + refresh, tilladelses-prompt (iOS) før system-popup, FCM-åbninger.
 */
export function PushNotificationBootstrap() {
  const {t} = useTranslation();
  const userId = useAppStore(s => s.user?.id);
  const [showPrompt, setShowPrompt] = useState(false);

  const registerToken = useCallback(
    async (uid: string) => {
      try {
        const permission = await getPushPermissionStatus();
        if (__DEV__) {
          console.log('[push] permission status on register:', permission);
        }
        if (permission === 'denied' || permission === 'unavailable') {
          if (__DEV__) {
            console.log('[push] skip token registration', {permission});
          }
          return;
        }
        const token = await getFcmToken();
        if (__DEV__) {
          console.log('[push] token generated:', Boolean(token));
        }
        if (token) {
          await savePushTokenToSupabase(uid, token);
          if (__DEV__) {
            console.log('[push] token saved to user_push_tokens:', true);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.log('[push] registerToken failed:', error);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    ensureDefaultNotificationPreferences(userId).catch(() => {});
    const msg = getMessaging();
    if (!msg) {
      return;
    }

    registerToken(userId).catch(() => {});
    const unsub = subscribeToTokenRefresh(t => {
      if (__DEV__) {
        console.log('[push] token refresh received');
      }
      savePushTokenToSupabase(userId, t).catch(error => {
        if (__DEV__) {
          console.log('[push] token refresh save failed:', error);
        }
      });
    });

    const unsubOpen = msg.onNotificationOpenedApp(remote => {
      const d = remote?.data as Record<string, string> | undefined;
      navigateFromPushData(d);
    });

    msg
      .getInitialNotification()
      .then(remote => {
        if (remote?.data) {
          navigateFromPushData(remote.data as Record<string, string>);
        }
      })
      .catch(() => {});

    return () => {
      unsub();
      unsubOpen();
    };
  }, [userId, registerToken]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(PROMPT_KEY).then(done => {
      if (done !== '1' && !cancelled) {
        setShowPrompt(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onAllow = useCallback(async () => {
    setShowPrompt(false);
    await AsyncStorage.setItem(PROMPT_KEY, '1');
    const granted = await requestUserPermission();
    if (__DEV__) {
      console.log('[push] request permission result:', granted);
    }
    if (!granted) {
      Alert.alert(
        t('pushBootstrap.disabledTitle'),
        t('pushBootstrap.disabledBody'),
        [
          {text: t('pushNotifications.notNow')},
          {text: t('pushBootstrap.openSettings'), onPress: () => Linking.openSettings()},
        ],
      );
    }
    if (userId) {
      await registerToken(userId);
    }
  }, [userId, registerToken]);

  const onLater = useCallback(async () => {
    setShowPrompt(false);
    await AsyncStorage.setItem(PROMPT_KEY, '1');
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    getPushPermissionStatus()
      .then(status => {
        if (__DEV__) {
          console.log('[push] app start permission status:', status);
        }
        if (status === 'denied') {
          Alert.alert(
            t('pushBootstrap.pushDisabledTitle'),
            t('pushBootstrap.pushDisabledBody'),
            [
              {text: t('pushNotifications.notNow')},
              {text: t('pushBootstrap.openSettings'), onPress: () => Linking.openSettings()},
            ],
          );
        }
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && userId) {
        registerToken(userId).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [userId, registerToken]);

  return <NotificationPermissionPrompt visible={showPrompt} onAllow={onAllow} onLater={onLater} />;
}
