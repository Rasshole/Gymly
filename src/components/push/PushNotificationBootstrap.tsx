import React, {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAppStore} from '@/store/appStore';
import {
  getFcmToken,
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
  const userId = useAppStore(s => s.user?.id);
  const [showPrompt, setShowPrompt] = useState(false);

  const registerToken = useCallback(
    async (uid: string) => {
      const token = await getFcmToken();
      if (token) {
        await savePushTokenToSupabase(uid, token);
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
      savePushTokenToSupabase(userId, t).catch(() => {});
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
    await requestUserPermission();
    if (userId) {
      await registerToken(userId);
    }
  }, [userId, registerToken]);

  const onLater = useCallback(async () => {
    setShowPrompt(false);
    await AsyncStorage.setItem(PROMPT_KEY, '1');
  }, []);

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
