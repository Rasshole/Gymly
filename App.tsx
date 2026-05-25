/**
 * Gymly - GDPR Compliant Fitness Social Media App
 * Root Application Component
 */

// Must run before other app imports: MainNavigator eagerly loads many screens whose
// StyleSheets use `colors.background`; a require cycle can leave `colors` undefined otherwise.
import './src/theme/colors';

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {StatusBar, StyleSheet, Linking, Alert} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import safeArea from '@/safeAreaContext';
import RootNavigator from './src/navigation/RootNavigator';
import {LanguageProvider} from './src/i18n';
import {navigationRef} from './src/navigation/navigationRef';
import {useAppStore} from './src/store/appStore';
import {BadgeUnlockModalHost} from './src/components/badges/BadgeUnlockModalHost';
import {usePrivacyStore} from './src/store/privacyStore';
import {StartupErrorBoundary} from './src/components/StartupErrorBoundary';
import {supabase} from './src/services/supabase/supabaseClient';
import AuthService from './src/services/auth/AuthService';
import {configureGeolocationForPermissionSafety} from './src/services/location/locationPermission';
import {clearLocalUserSession} from './src/services/auth/sessionCleanup';
import {
  AUTH_LINK_PREFIXES,
  handleAuthDeepLink,
  isAuthDeepLinkUrl,
  isPasswordRecoveryActive,
  logAuthDeepLinkEvent,
  sessionToAuthTokens,
  setPasswordRecoveryActive,
} from './src/services/auth/authDeepLink';
import {
  applySignedInFromDeepLink,
  navigateToLogin,
  navigateToResetPassword,
} from './src/services/auth/authDeepLinkNavigation';

try {
  configureGeolocationForPermissionSafety();
} catch (e) {
  if (__DEV__) {
    console.warn('[App] configureGeolocationForPermissionSafety failed', e);
  }
}

const {SafeAreaProvider} = safeArea;

const App = () => {
  const initializeApp = useAppStore(state => state.initialize);
  const loadPrivacyConsent = usePrivacyStore(state => state.loadConsent);
  const login = useAppStore(state => state.login);
  const logout = useAppStore(state => state.logout);
  const setLoading = useAppStore(state => state.setLoading);
  const initialUrlHandled = useRef(false);

  const linking = useMemo(
    () => ({
      prefixes: [...AUTH_LINK_PREFIXES],
      config: {
        screens: {
          ResetPassword: 'reset-password',
        },
      },
    }),
    [],
  );

  const showPasswordResetSuccess = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    await logout().catch(() => {});
    Alert.alert('Gymly', 'Din adgangskode er ændret', [
      {text: 'OK', onPress: () => navigateToLogin()},
    ]);
    setTimeout(() => navigateToLogin(), 2000);
  }, [logout]);

  const processAuthUrl = useCallback(
    async (url: string) => {
      if (!isAuthDeepLinkUrl(url)) {
        return;
      }
      const result = await handleAuthDeepLink(url);
      switch (result.kind) {
        case 'recovery':
          navigateToResetPassword();
          break;
        case 'signed_in':
          await applySignedInFromDeepLink(result.user, result.tokens);
          break;
        case 'password_reset_success':
          await showPasswordResetSuccess();
          break;
        case 'session_restore': {
          try {
            const {
              data: {session},
            } = await supabase.auth.getSession();
            if (session?.user && session.access_token && session.refresh_token) {
              await applySignedInFromDeepLink(
                AuthService.getMappedUser(session.user),
                sessionToAuthTokens(session),
              );
            } else {
              await logout();
              setLoading(false);
            }
          } catch {
            await logout();
            setLoading(false);
          }
          break;
        }
        case 'error':
          logAuthDeepLinkEvent('callback failed', result.message);
          setLoading(false);
          break;
        case 'ignored':
        default:
          break;
      }
    },
    [logout, setLoading, showPasswordResetSuccess],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initialUrl = await Linking.getInitialURL().catch(() => null);
      if (initialUrl && isAuthDeepLinkUrl(initialUrl)) {
        initialUrlHandled.current = true;
        await processAuthUrl(initialUrl);
      }
      if (!cancelled) {
        await initializeApp();
        await loadPrivacyConsent();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializeApp, loadPrivacyConsent, processAuthUrl]);

  useEffect(() => {
    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logAuthDeepLinkEvent('auth state', event, session?.user?.id ?? 'none');

      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        if (!useAppStore.getState().isAuthenticated) {
          setPasswordRecoveryActive(true);
          navigateToResetPassword();
        }
        return;
      }

      if (
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
        session?.user &&
        session.access_token &&
        session.refresh_token &&
        !useAppStore.getState().isAuthenticated &&
        !isPasswordRecoveryActive()
      ) {
        const mapped = AuthService.getMappedUser(session.user);
        await applySignedInFromDeepLink(mapped, sessionToAuthTokens(session));
      }

      if (
        (event === 'SIGNED_OUT' || String(event) === 'USER_DELETED') &&
        !session &&
        useAppStore.getState().isAuthenticated
      ) {
        clearLocalUserSession({navigate: true});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onUrl = ({url}: {url: string}) => {
      if (!url) {
        return;
      }
      void processAuthUrl(url);
    };
    const sub = Linking.addEventListener('url', onUrl);
    return () => sub.remove();
  }, [processAuthUrl]);

  return (
    <StartupErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <LanguageProvider>
            <StatusBar barStyle="dark-content" />
            <NavigationContainer ref={navigationRef} theme={DefaultTheme} linking={linking}>
              <RootNavigator />
              <BadgeUnlockModalHost />
            </NavigationContainer>
          </LanguageProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </StartupErrorBoundary>
  );
};

export default App;

const styles = StyleSheet.create({
  root: {flex: 1},
});
