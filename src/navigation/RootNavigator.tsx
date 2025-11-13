/**
 * Root Navigator
 * Manages navigation flow based on authentication and consent state
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {usePrivacyStore} from '@/store/privacyStore';

// Screens
import PrivacyConsentScreen from '@/screens/PrivacyConsentScreen';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import LoadingScreen from '@/screens/LoadingScreen';

export type RootStackParamList = {
  PrivacyConsent: undefined;
  Auth: undefined;
  Main: undefined;
  Loading: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const {isAuthenticated, isLoading} = useAppStore();
  const {hasAcceptedConsent} = usePrivacyStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {!hasAcceptedConsent ? (
        <Stack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
      ) : !isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <Stack.Screen name="Main" component={MainNavigator} />
      )}
    </Stack.Navigator>
  );
};

export default RootNavigator;

