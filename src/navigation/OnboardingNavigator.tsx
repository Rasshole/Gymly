/**
 * Post-auth Gymly onboarding stack (shared by Apple / Google / incomplete email sessions).
 * RegisterScreen is deferred — it pulls centers.json via danishGyms.
 */

import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import colors from '@/theme/colors';

export type OnboardingStackParamList = {
  CompleteProfile: {mode: 'postAuth'};
};

const Stack = createStackNavigator<OnboardingStackParamList>();

const OnboardingNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {flex: 1, backgroundColor: colors.background},
      }}>
      <Stack.Screen
        name="CompleteProfile"
        getComponent={() => require('@/screens/auth/RegisterScreen').default}
        initialParams={{mode: 'postAuth'}}
      />
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
