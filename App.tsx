/**
 * Gymly - GDPR Compliant Fitness Social Media App
 * Root Application Component
 */

import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import {useAppStore} from './src/store/appStore';
import {usePrivacyStore} from './src/store/privacyStore';

const App = () => {
  const initializeApp = useAppStore(state => state.initialize);
  const loadPrivacyConsent = usePrivacyStore(state => state.loadConsent);

  useEffect(() => {
    // Initialize app state and check authentication
    initializeApp();
    loadPrivacyConsent();
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
};

export default App;

