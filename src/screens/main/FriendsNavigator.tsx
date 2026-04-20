/**
 * Friends Navigator — top tabs (Online, Grupper, Centre, Kort)
 * Custom tabs (no @react-navigation/material-top-tabs) to avoid useTheme/TabView
 * crash: "Cannot read property 'background' of undefined".
 */

import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import FriendsScreen from './FriendsScreen';
import OnlineScreen from './OnlineScreen';
import GroupsScreen from './GroupsScreen';
import CentresScreen from './CentresScreen';
import MapScreen from './MapScreen';

export type FriendsTabParamList = {
  Venner: undefined;
  Online: undefined;
  Grupper: undefined;
  Centre: undefined;
  Kort: undefined;
};

export type FriendsSubRouteName = keyof FriendsTabParamList;

const TABS: {name: FriendsSubRouteName; label: string}[] = [
  {name: 'Venner', label: 'Venner'},
  {name: 'Online', label: 'Online'},
  {name: 'Grupper', label: 'Grupper'},
  {name: 'Centre', label: 'Centre'},
  {name: 'Kort', label: 'Kort'},
];

function isSubRoute(s: string): s is FriendsSubRouteName {
  return TABS.some(t => t.name === s);
}

const FriendsNavigator = () => {
  const route = useRoute();
  const [active, setActive] = useState<FriendsSubRouteName>('Online');

  const syncFromParams = useCallback(() => {
    const screen = (route.params as {screen?: string} | undefined)?.screen;
    if (screen && isSubRoute(screen)) {
      setActive(screen);
    }
  }, [route.params]);

  useEffect(() => {
    syncFromParams();
  }, [syncFromParams]);

  useFocusEffect(
    useCallback(() => {
      syncFromParams();
    }, [syncFromParams]),
  );

  const renderScene = () => {
    switch (active) {
      case 'Venner':
        return <FriendsScreen />;
      case 'Online':
        return <OnlineScreen />;
      case 'Grupper':
        return <GroupsScreen />;
      case 'Centre':
        return <CentresScreen />;
      case 'Kort':
        return <MapScreen />;
      default:
        return <OnlineScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBarContainer}>
        {TABS.map(tab => {
          const isFocused = active === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              accessibilityRole="button"
              accessibilityState={isFocused ? {selected: true} : {}}
              accessibilityLabel={tab.label}
              onPress={() => setActive(tab.name)}
              style={styles.tabItem}>
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {isFocused && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.scene}>{renderScene()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'none',
  },
  tabLabelActive: {
    color: colors.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  scene: {
    flex: 1,
  },
});

export default FriendsNavigator;
