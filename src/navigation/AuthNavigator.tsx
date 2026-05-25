/**
 * Auth Navigator
 * Authentication flow screens
 */

import React from 'react';
import {createStackNavigator, TransitionPresets} from '@react-navigation/stack';

import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import LanguageOnboardingScreen from '@/screens/settings/LanguageScreen';
import TermsScreen from '@/screens/main/TermsScreen';
import PrivacyPolicyScreen from '@/screens/main/PrivacyPolicyScreen';
import {useTranslation} from '@/i18n';
import type {AuthStackParamList} from './authStackParamList';

export type {AuthStackParamList};

const Stack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  const {hasUserChosenLanguage} = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: '#FFFFFF'},
        ...TransitionPresets.SlideFromRightIOS,
        gestureEnabled: true,
      }}
      initialRouteName={hasUserChosenLanguage ? 'Login' : 'Language'}>
      <Stack.Screen name="Language" component={LanguageOnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
