/**
 * Friends Navigator — top tabs (Venner, [Online], [Grupper], Centre, Kort).
 * Online + Grupper styres via `launchSurfaceConfig` — bevarer modulær genaktivering.
 */

import React, {useCallback, useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import {
  SURFACE_ONLINE_SUBTAB_IN_FRIENDS,
  SURFACE_GROUPS_IN_APP,
} from '@/config/launchSurfaceConfig';
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

const ALL_FRIENDS_TABS: {name: FriendsSubRouteName; label: string}[] = [
  {name: 'Venner', label: 'Venner'},
  {name: 'Online', label: 'Online'},
  {name: 'Grupper', label: 'Grupper'},
  {name: 'Centre', label: 'Centre'},
  {name: 'Kort', label: 'Kort'},
];

function visibleFriendsTabs(): {name: FriendsSubRouteName; label: string}[] {
  return ALL_FRIENDS_TABS.filter(t => {
    if (!SURFACE_ONLINE_SUBTAB_IN_FRIENDS && t.name === 'Online') {
      return false;
    }
    if (!SURFACE_GROUPS_IN_APP && t.name === 'Grupper') {
      return false;
    }
    return true;
  });
}

function isKnownFriendsParam(s: string): s is FriendsSubRouteName {
  return ALL_FRIENDS_TABS.some(t => t.name === s);
}

function normalizeFriendsSubRoute(screen: string | undefined): FriendsSubRouteName {
  if (!screen || !isKnownFriendsParam(screen)) {
    return 'Venner';
  }
  if (!SURFACE_ONLINE_SUBTAB_IN_FRIENDS && screen === 'Online') {
    return 'Venner';
  }
  if (!SURFACE_GROUPS_IN_APP && screen === 'Grupper') {
    return 'Venner';
  }
  const allowed = visibleFriendsTabs().map(t => t.name);
  if (!allowed.includes(screen)) {
    return 'Venner';
  }
  return screen;
}

const FriendsNavigator = () => {
  const route = useRoute();
  const tabs = visibleFriendsTabs();
  const tabBarPadH = tabs.length <= 3 ? spacing.md : spacing.sm;
  const [active, setActive] = useState<FriendsSubRouteName>('Venner');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const syncFromParams = useCallback(() => {
    const screen = (route.params as {screen?: string} | undefined)?.screen;
    setActive(normalizeFriendsSubRoute(screen));
  }, [route.params]);

  useEffect(() => {
    syncFromParams();
  }, [syncFromParams]);

  useFocusEffect(
    useCallback(() => {
      syncFromParams();
    }, [syncFromParams]),
  );

  const activeIndex = tabs.findIndex(t => t.name === active);

  useEffect(() => {
    if (tabBarWidth <= 0 || tabs.length === 0) {
      return;
    }
    const segment = tabBarWidth / tabs.length;
    const idx = activeIndex >= 0 ? activeIndex : 0;
    Animated.spring(indicatorX, {
      toValue: idx * segment,
      useNativeDriver: true,
      friction: 9,
      tension: 68,
    }).start();
  }, [activeIndex, indicatorX, tabBarWidth, tabs.length]);

  const onTabRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTabBarWidth(w);
    const idx = tabs.findIndex(t => t.name === active);
    if (w > 0 && tabs.length > 0) {
      indicatorX.setValue(Math.max(0, idx) * (w / tabs.length));
    }
  };

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
        return <FriendsScreen />;
    }
  };

  const segmentW = tabBarWidth > 0 && tabs.length > 0 ? tabBarWidth / tabs.length : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.tabBarOuter, {paddingHorizontal: tabBarPadH}]}>
        <View style={styles.tabRow} onLayout={onTabRowLayout}>
          {tabs.map(tab => {
            const isFocused = active === tab.name;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={isFocused ? {selected: true} : {}}
                accessibilityLabel={tab.label}
                onPress={() => setActive(tab.name)}
                style={styles.tabItem}>
                <Text
                  style={[
                    styles.tabLabel,
                    !isFocused && styles.tabLabelInactive,
                    isFocused && styles.tabLabelActive,
                  ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          {segmentW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                {
                  width: segmentW,
                  transform: [{translateX: indicatorX}],
                },
              ]}
            />
          ) : null}
        </View>
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
  tabBarOuter: {
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 6,
  },
  tabRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: -0.15,
  },
  tabLabelInactive: {
    opacity: 0.5,
  },
  tabLabelActive: {
    color: colors.primaryDark,
    opacity: 1,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  scene: {
    flex: 1,
  },
});

export default FriendsNavigator;
