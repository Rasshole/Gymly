/**
 * Auth Navigator
 * Authentication flow screens
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import TermsScreen from '@/screens/main/TermsScreen';
import PrivacyPolicyScreen from '@/screens/main/PrivacyPolicyScreen';
import type {AuthStackParamList} from './authStackParamList';

export type {AuthStackParamList};

const Stack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        /** Undgå standard grå stack-baggrund (gør logo-PNG og hvid UI synlig som tænkt) */
        cardStyle: {backgroundColor: '#FFFFFF'},
        contentStyle: {backgroundColor: '#FFFFFF'},
      }}
      initialRouteName="Register">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;

