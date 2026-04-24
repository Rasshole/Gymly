/**
 * Gymly - GDPR Compliant Fitness Social Media App
 * Root Application Component
 */

// Must run before other app imports: MainNavigator eagerly loads many screens whose
// StyleSheets use `colors.background`; a require cycle can leave `colors` undefined otherwise.
import './src/theme/colors';

import React, {useEffect} from 'react';
import {StatusBar, StyleSheet} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import safeArea from '@/safeAreaContext';
import RootNavigator from './src/navigation/RootNavigator';
import {navigationRef} from './src/navigation/navigationRef';
import {useAppStore} from './src/store/appStore';
import {BadgeUnlockModalHost} from './src/components/badges/BadgeUnlockModalHost';
import {usePrivacyStore} from './src/store/privacyStore';
import {StartupErrorBoundary} from './src/components/StartupErrorBoundary';

const {SafeAreaProvider} = safeArea;

const App = () => {
  const initializeApp = useAppStore(state => state.initialize);
  const loadPrivacyConsent = usePrivacyStore(state => state.loadConsent);

  useEffect(() => {
    initializeApp();
    loadPrivacyConsent();
  }, [initializeApp, loadPrivacyConsent]);

  return (
    <StartupErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer ref={navigationRef} theme={DefaultTheme}>
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
