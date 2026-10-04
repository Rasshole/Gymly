/**
 * Defers OnboardingNavigator (RegisterScreen → centers.json) until post-auth.
 */
import React, {useEffect, useState} from 'react';
import LoadingScreen from '@/screens/LoadingScreen';
import {startupMark} from '@/i18n/startupMark';

type NavComponent = React.ComponentType;

const LazyOnboardingNavigator = () => {
  const [Navigator, setNavigator] = useState<NavComponent | null>(null);

  useEffect(() => {
    startupMark('LazyOnboardingNavigator require START');
    setNavigator(() => require('./OnboardingNavigator').default);
    startupMark('LazyOnboardingNavigator require END');
  }, []);

  if (!Navigator) {
    return <LoadingScreen />;
  }

  return <Navigator />;
};

export default LazyOnboardingNavigator;
