/**
 * Friends Navigator — Venner, Grupper, Centre, Kort.
 */

import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';
import FriendsScreen from './FriendsScreen';
import GroupsScreen from './GroupsScreen';
import CentresScreen from './CentresScreen';
import {perfPhase, perfStart} from '@/utils/perfMark';
import {useAppStore} from '@/store/appStore';
import {prefetchActiveCenters} from '@/hooks/useActiveCentersRealtime';
import {prefetchMapGymBadges} from '@/services/supabase/presenceService';

type MapScreenComponent = React.ComponentType<{isActive?: boolean}>;

/** Loads MapScreen bundle only when the Kort tab is first opened. */
function LazyMapScreen({isActive}: {isActive: boolean}) {
  const [Screen, setScreen] = useState<MapScreenComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const requireStarted = Date.now();
    const Screen = require('./MapScreen').default as MapScreenComponent;
    perfPhase('map', 'module_loaded', `requireMs=${Date.now() - requireStarted}`);
    if (!cancelled) {
      setScreen(() => Screen);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Screen) {
    return (
      <View style={styles.sceneLoading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Screen isActive={isActive} />;
}

export type FriendsTabParamList = {
  Venner: undefined;
  Grupper: undefined;
  Centre: undefined;
  Kort: undefined;
};

export type FriendsSubRouteName = keyof FriendsTabParamList;

const BASE_TAB_NAMES: FriendsSubRouteName[] = ['Venner', 'Centre', 'Kort'];

const FRIENDS_TAB_LABEL_KEYS: Record<FriendsSubRouteName, string> = {
  Venner: 'friendsTabs.friends',
  Grupper: 'friendsTabs.groups',
  Centre: 'friendsTabs.centres',
  Kort: 'friendsTabs.map',
};

function isKnownFriendsParam(
  s: string,
  tabs: FriendsSubRouteName[],
): s is FriendsSubRouteName {
  return tabs.includes(s as FriendsSubRouteName);
}

function normalizeFriendsSubRoute(
  screen: string | undefined,
  tabs: FriendsSubRouteName[],
): FriendsSubRouteName {
  if (!screen || !isKnownFriendsParam(screen, tabs)) {
    return 'Venner';
  }
  return screen;
}

const FriendsNavigator = () => {
  const route = useRoute();
  const {t} = useTranslation();
  const tabNames = useMemo((): FriendsSubRouteName[] => {
    if (!SURFACE_GROUPS_IN_APP) {
      return BASE_TAB_NAMES;
    }
    return ['Venner', 'Grupper', 'Centre', 'Kort'];
  }, []);
  const tabs = tabNames.map(name => ({
    name,
    label: t(FRIENDS_TAB_LABEL_KEYS[name]),
  }));
  const [active, setActive] = useState<FriendsSubRouteName>('Venner');
  const [mountedTabs, setMountedTabs] = useState<
    Partial<Record<FriendsSubRouteName, boolean>>
  >({
    Venner: true,
    Centre: false,
    Kort: false,
    Grupper: false,
  });
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const friendsParams = route.params as
    | {screen?: string; focusSearch?: number}
    | undefined;
  const focusSearchToken = friendsParams?.focusSearch;

  // Apply an explicit Friends sub-route once, when navigation asks for it.
  // Do not re-apply on focus: GymDetail sits on the parent stack, and coming
  // back would otherwise reset Centre/Kort to Venner and drop the list or map.
  useEffect(() => {
    const screen = friendsParams?.screen;
    if (!screen) {
      return;
    }
    const next = normalizeFriendsSubRoute(screen, tabNames);
    setActive(next);
    setMountedTabs(prev => (prev[next] ? prev : {...prev, [next]: true}));
  }, [friendsParams?.screen, tabNames]);

  // Find friends from Home opens the Venner search, even if another sub-tab was last.
  useEffect(() => {
    if (!focusSearchToken) {
      return;
    }
    setActive('Venner');
    setMountedTabs(prev => (prev.Venner ? prev : {...prev, Venner: true}));
  }, [focusSearchToken]);

  const activeIndex = tabs.findIndex(tab => tab.name === active);

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
    const idx = tabs.findIndex(tab => tab.name === active);
    if (w > 0 && tabs.length > 0) {
      indicatorX.setValue(Math.max(0, idx) * (w / tabs.length));
    }
  };

  const handleTabPress = (name: FriendsSubRouteName) => {
    const userId = useAppStore.getState().user?.id;
    if (name === 'Centre') {
      perfStart('centres', 'tap');
      if (userId) {
        void prefetchActiveCenters(userId);
      }
    } else if (name === 'Kort') {
      perfStart('map', 'tap');
      if (userId) {
        void prefetchMapGymBadges(userId);
      }
    }
    setActive(name);
    setMountedTabs(prev => (prev[name] ? prev : {...prev, [name]: true}));
  };

  const renderScene = () => (
    <>
      {mountedTabs.Venner ? (
        <View
          pointerEvents={active === 'Venner' ? 'auto' : 'none'}
          style={[styles.sceneLayer, active === 'Venner' ? styles.sceneVisible : styles.sceneHidden]}>
          <FriendsScreen
            isActive={active === 'Venner'}
            focusSearchToken={focusSearchToken}
          />
        </View>
      ) : null}
      {SURFACE_GROUPS_IN_APP && mountedTabs.Grupper ? (
        <View style={[styles.sceneLayer, active !== 'Grupper' && styles.sceneHidden]}>
          <GroupsScreen />
        </View>
      ) : null}
      {mountedTabs.Centre ? (
        <View
          pointerEvents={active === 'Centre' ? 'auto' : 'none'}
          style={[styles.sceneLayer, active === 'Centre' ? styles.sceneVisible : styles.sceneHidden]}>
          <CentresScreen isActive={active === 'Centre'} />
        </View>
      ) : active === 'Centre' ? (
        <View style={styles.sceneLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {mountedTabs.Kort ? (
        <View
          pointerEvents={active === 'Kort' ? 'auto' : 'none'}
          style={[styles.sceneLayer, active === 'Kort' ? styles.sceneVisible : styles.sceneHidden]}>
          <LazyMapScreen isActive={active === 'Kort'} />
        </View>
      ) : active === 'Kort' ? (
        <View style={styles.sceneLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </>
  );

  const segmentW = tabBarWidth > 0 && tabs.length > 0 ? tabBarWidth / tabs.length : 0;

  return (
    <View style={styles.container}>
      <View style={styles.tabBarOuter}>
        <View style={styles.tabRow} onLayout={onTabRowLayout}>
          {tabs.map(tab => {
            const isFocused = active === tab.name;
            return (
              <Pressable
                key={tab.name}
                testID={`friends-tab-${tab.name}`}
                accessibilityRole="button"
                accessibilityState={isFocused ? {selected: true} : {}}
                accessibilityLabel={tab.label}
                onPress={() => handleTabPress(tab.name)}
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
    backgroundColor: colors.background,
  },
  tabBarOuter: {
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 6,
    paddingHorizontal: spacing.lg,
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
    color: colors.primary,
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
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneVisible: {
    zIndex: 1,
    opacity: 1,
  },
  // Keep the native map mounted. display:none detaches AIRMap and the next
  // show inserts a marker past the end of its subview array, which aborts.
  sceneHidden: {
    zIndex: 0,
    opacity: 0,
  },
  sceneLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

export default FriendsNavigator;
