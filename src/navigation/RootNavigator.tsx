/**
 * Root Navigator
 * Manages navigation flow based on authentication and consent state
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import LoadingScreen from '@/screens/LoadingScreen';
import ResetPasswordScreen from '@/screens/auth/ResetPasswordScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Loading: undefined;
  ResetPassword: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const {isAuthenticated, isLoading} = useAppStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <Stack.Screen name="Main" component={MainNavigator} />
      )}
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
};

export default RootNavigator;

