/**
 * Root Navigator
 * Gates: loading → auth → post-auth onboarding → main
 *
 * Auth / onboarding / main are lazy so splash does not evaluate
 * the register flow (danishGyms / gym catalog) during module load.
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import {startupMark} from '@/i18n/startupMark';

import LazyAuthNavigator from './LazyAuthNavigator';
import LazyOnboardingNavigator from './LazyOnboardingNavigator';
import LazyMainNavigator from './LazyMainNavigator';
import LoadingScreen from '@/screens/LoadingScreen';
import ReferralInviteRuntime from '@/components/referral/ReferralInviteRuntime';

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  Loading: undefined;
  ResetPassword: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

let didMarkFirstScreen = false;

const RootNavigator = () => {
  const {isAuthenticated, isLoading, onboardingComplete} = useAppStore();

  if (isLoading || (isAuthenticated && onboardingComplete === null)) {
    if (!didMarkFirstScreen) {
      didMarkFirstScreen = true;
      startupMark('first screen decision → LoadingScreen');
    }
    return <LoadingScreen />;
  }

  const showMain = isAuthenticated && onboardingComplete === true;
  const showOnboarding = isAuthenticated && onboardingComplete === false;
  if (!didMarkFirstScreen) {
    didMarkFirstScreen = true;
    startupMark('first screen decision', {
      showMain,
      showOnboarding,
      signedOut: !showMain && !showOnboarding,
    });
  }

  return (
    <>
    <ReferralInviteRuntime />
    <Stack.Navigator
      key={
        showMain
          ? 'root-main'
          : showOnboarding
            ? 'root-onboarding'
            : 'root-signed-out'
      }
      screenOptions={{
        headerShown: false,
        cardStyle: {flex: 1, backgroundColor: colors.background},
      }}>
      {showMain ? (
        <Stack.Screen name="Main" component={LazyMainNavigator} />
      ) : showOnboarding ? (
        <Stack.Screen name="Onboarding" component={LazyOnboardingNavigator} />
      ) : (
        <>
          <Stack.Screen name="Auth" component={LazyAuthNavigator} />
          <Stack.Screen
            name="ResetPassword"
            getComponent={() =>
              require('@/screens/auth/ResetPasswordScreen').default
            }
          />
        </>
      )}
    </Stack.Navigator>
    </>
  );
};

export default RootNavigator;
