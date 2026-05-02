/**
 * Gymly - GDPR Compliant Fitness Social Media App
 * Root Application Component
 */

// Must run before other app imports: MainNavigator eagerly loads many screens whose
// StyleSheets use `colors.background`; a require cycle can leave `colors` undefined otherwise.
import './src/theme/colors';

import React, {useCallback, useEffect, useMemo} from 'react';
import {StatusBar, StyleSheet, Linking} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import safeArea from '@/safeAreaContext';
import RootNavigator from './src/navigation/RootNavigator';
import {navigationRef} from './src/navigation/navigationRef';
import {useAppStore} from './src/store/appStore';
import {BadgeUnlockModalHost} from './src/components/badges/BadgeUnlockModalHost';
import {usePrivacyStore} from './src/store/privacyStore';
import {StartupErrorBoundary} from './src/components/StartupErrorBoundary';
import {supabase} from './src/services/supabase/supabaseClient';
import AuthService from './src/services/auth/AuthService';

const {SafeAreaProvider} = safeArea;

const App = () => {
  const initializeApp = useAppStore(state => state.initialize);
  const loadPrivacyConsent = usePrivacyStore(state => state.loadConsent);
  const setUser = useAppStore(state => state.setUser);
  const login = useAppStore(state => state.login);
  const logout = useAppStore(state => state.logout);

  const linking = useMemo(
    () => ({
      prefixes: ['gymlyapp://'],
      config: {
        screens: {
          ResetPassword: 'reset-password',
        },
      },
    }),
    [],
  );

  const consumeRecoveryUrl = useCallback(async (url: string) => {
    if (!url.includes('reset-password')) {
      return;
    }
    const hash = url.split('#')[1] ?? '';
    const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
    const raw = [hash, query].filter(Boolean).join('&');
    if (!raw) {
      return;
    }
    const params = new URLSearchParams(raw);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    if (type !== 'recovery' || !accessToken || !refreshToken) {
      return;
    }
    const {error} = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return;
    }
    const {
      data: {session},
    } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(AuthService.getMappedUser(session.user));
    }
  }, [setUser]);

  const handleHomeDeepLink = useCallback(async () => {
    try {
      const {
        data: {session},
      } = await supabase.auth.getSession();
      if (session?.user && session.access_token && session.refresh_token) {
        login(AuthService.getMappedUser(session.user), {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
        });
        return;
      }
      await logout();
    } catch {
      await logout();
    }
  }, [login, logout]);

  useEffect(() => {
    initializeApp();
    loadPrivacyConsent();
  }, [initializeApp, loadPrivacyConsent]);

  useEffect(() => {
    const handleUrl = ({url}: {url: string}) => {
      if (url.includes('gymlyapp://home')) {
        handleHomeDeepLink().catch(() => {});
        return;
      }
      consumeRecoveryUrl(url).catch(() => {});
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL()
      .then(url => {
        if (url) {
          if (url.includes('gymlyapp://home')) {
            handleHomeDeepLink().catch(() => {});
            return;
          }
          consumeRecoveryUrl(url).catch(() => {});
        }
      })
      .catch(() => {});
    return () => sub.remove();
  }, [consumeRecoveryUrl, handleHomeDeepLink]);

  return (
    <StartupErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer ref={navigationRef} theme={DefaultTheme} linking={linking}>
            <RootNavigator />
            <BadgeUnlockModalHost />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </StartupErrorBoundary>
  );
};

export default App;

const styles = StyleSheet.create({
  root: {flex: 1},
});
