/**
 * Auth Navigator
 * Authentication flow screens
 *
 * RegisterScreen pulls danishGyms → centers.json (~4MB). Use getComponent so
 * the Language / Login path can paint without parsing the gym catalog.
 */

import React from 'react';
import {createStackNavigator, TransitionPresets} from '@react-navigation/stack';

import LoginScreen from '@/screens/auth/LoginScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import {LanguageSettingsScreen} from '@/screens/settings/LanguageScreen';
import type {AuthStackParamList} from './authStackParamList';

export type {AuthStackParamList};

const Stack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: '#FFFFFF'},
        ...TransitionPresets.SlideFromRightIOS,
        gestureEnabled: true,
      }}
      initialRouteName="Login">
      <Stack.Screen name="Language" component={LanguageSettingsScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="Register"
        getComponent={() => require('@/screens/auth/RegisterScreen').default}
      />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen
        name="Terms"
        getComponent={() => require('@/screens/main/TermsScreen').default}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        getComponent={() =>
          require('@/screens/main/PrivacyPolicyScreen').default
        }
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
