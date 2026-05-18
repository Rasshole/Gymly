/**
 * Root Navigator
 * Manages navigation flow based on authentication and consent state
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';

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
    <Stack.Navigator
      key={isAuthenticated ? 'root-signed-in' : 'root-signed-out'}
      initialRouteName={isAuthenticated ? 'Main' : 'Auth'}
      screenOptions={{
        headerShown: false,
        cardStyle: {flex: 1, backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Main" component={MainNavigator} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
};

export default RootNavigator;

