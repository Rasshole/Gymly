/**
 * Defers AuthNavigator until signed-out stack is needed.
 * AuthNavigator → RegisterScreen → danishGyms → centers.json (~4MB) must NOT
 * run during splash / LoadingScreen module evaluation.
 */
import React, {useEffect, useState} from 'react';
import LoadingScreen from '@/screens/LoadingScreen';
import {startupMark} from '@/i18n/startupMark';

type NavComponent = React.ComponentType;

const LazyAuthNavigator = () => {
  const [Navigator, setNavigator] = useState<NavComponent | null>(null);

  useEffect(() => {
    startupMark('LazyAuthNavigator require START');
    setNavigator(() => require('./AuthNavigator').default);
    startupMark('LazyAuthNavigator require END');
  }, []);

  if (!Navigator) {
    return <LoadingScreen />;
  }

  return <Navigator />;
};

export default LazyAuthNavigator;
