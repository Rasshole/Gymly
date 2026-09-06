/**
 * Defers MainNavigator bundle until the user is authenticated.
 * Avoids loading MapScreen / 12k catalog work during splash + auth restore.
 */
import React, {useEffect, useState} from 'react';
import LoadingScreen from '@/screens/LoadingScreen';

type MainNavigatorComponent = React.ComponentType;

const LazyMainNavigator = () => {
  const [Navigator, setNavigator] = useState<MainNavigatorComponent | null>(null);

  useEffect(() => {
    setNavigator(() => require('./MainNavigator').default);
  }, []);

  if (!Navigator) {
    return <LoadingScreen />;
  }

  return <Navigator />;
};

export default LazyMainNavigator;
