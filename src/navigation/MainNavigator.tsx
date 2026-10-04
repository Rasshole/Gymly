/**
 * Main Navigator
 * Main app screens after authentication
 */

import React, {useEffect, useRef} from 'react';
import {TouchableOpacity, View, StyleSheet} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {
  useNavigation,
  CompositeNavigationProp,
  NavigatorScreenParams,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';

const HEADER_ICON = 24;
/** Right/left header padding — avoid fixed wide slots that clip icons on compact phones */
const HEADER_SIDE_PAD = spacing.sm;

const tabHeaderStyles = StyleSheet.create({
  headerSideLeft: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: HEADER_SIDE_PAD,
  },
  headerSideRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: HEADER_SIDE_PAD,
    gap: 2,
  },
  iconTap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellWrap: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
  },
});

import HomeScreen from '@/screens/main/HomeScreen';
import ProfileScreen from '@/screens/main/ProfileScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';
import MessagesScreen from '@/screens/main/MessagesScreen';
import BadgesScreen from '@/screens/main/BadgesScreen';
import FriendsNavigator from '@/screens/main/FriendsNavigator';
import CheckInScreen from '@/screens/main/CheckInScreen';
import LiveWorkoutScreen from '@/screens/main/LiveWorkoutScreen';
import NotificationsScreen from '@/screens/main/NotificationsScreen';
import NewMessageScreen from '@/screens/main/NewMessageScreen';
import ChatScreen from '@/screens/main/ChatScreen';
import InviteToWorkoutScreen from '@/screens/main/InviteToWorkoutScreen';
import WorkoutInvitationsScreen from '@/screens/main/WorkoutInvitationsScreen';
import GymDetailScreen from '@/screens/main/GymDetailScreen';
import GymLeaderboardScreen from '@/screens/main/GymLeaderboardScreen';
import LeaderboardScreen from '@/screens/main/LeaderboardScreen';
import RateGymScreen from '@/screens/main/RateGymScreen';
import FriendWorkoutDetailScreen from '@/screens/main/FriendWorkoutDetailScreen';
import AddGoalScreen from '@/screens/main/AddGoalScreen';
import AddPRScreen from '@/screens/main/AddPRScreen';
import AddRepScreen from '@/screens/main/AddRepScreen';
import GroupDetailScreen from '@/screens/main/GroupDetailScreen';
import EditGroupScreen from '@/screens/main/EditGroupScreen';
import CreateGroupScreen from '@/screens/main/CreateGroupScreen';
import PlannedWorkoutsScreen from '@/screens/main/PlannedWorkoutsScreen';
import PersonalPRsRepsScreen from '@/screens/main/PersonalPRsRepsScreen';
import ConnectDeviceScreen from '@/screens/main/ConnectDeviceScreen';
import ChangeEmailScreen from '@/screens/main/ChangeEmailScreen';
import HelpScreen from '@/screens/main/HelpScreen';
import SupportScreen from '@/screens/main/SupportScreen';
import AboutGymlyScreen from '@/screens/main/AboutGymlyScreen';
import TermsScreen from '@/screens/main/TermsScreen';
import PrivacyPolicyScreen from '@/screens/main/PrivacyPolicyScreen';
import WorkoutHistoryScreen from '@/screens/main/WorkoutHistoryScreen';
import WorkoutHistoryDetailScreen from '@/screens/main/WorkoutHistoryDetailScreen';
import ShareWorkoutScreen from '@/screens/main/ShareWorkoutScreen';
import SharedWorkoutDetailScreen from '@/screens/main/SharedWorkoutDetailScreen';
import ExercisePrDetailScreen from '@/screens/main/ExercisePrDetailScreen';
import AllTrainingsScreen from '@/screens/main/AllTrainingsScreen';
import UpcomingWorkoutsScreen from '@/screens/main/UpcomingWorkoutsScreen';
import WorkoutScheduleScreen from '@/screens/main/WorkoutScheduleScreen';
import FriendProfileScreen from '@/screens/main/FriendProfileScreen';
import EditProfileScreen from '@/screens/main/EditProfileScreen';
import PushNotificationsScreen from '@/screens/main/PushNotificationsScreen';
import FeedSortingScreen from '@/screens/main/FeedSortingScreen';
import ActivityFeedScreen from '@/screens/main/ActivityFeedScreen';
import GymPresenceScreen from '@/screens/main/GymPresenceScreen';
import AddFriendScreen from '@/screens/main/AddFriendScreen';
import InviteFiveFriendsScreen from '@/screens/main/InviteFiveFriendsScreen';
import {InAppNotificationBootstrap} from '@/components/inApp/InAppNotificationBootstrap';
import {PendingFriendRequestBootstrap} from '@/components/friends/PendingFriendRequestBootstrap';
import {FriendRequestsSheet} from '@/components/friends/FriendRequestsSheet';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import CustomTabBar from '@/components/CustomTabBar';
import {useAppStore} from '@/store/appStore';
import NotificationBadge from '@/components/ui/Badge';
import {CheckInSessionController} from '@/components/checkin/CheckInSessionController';
import {DemoContentOrchestrator} from '@/demo/DemoContentOrchestrator';
import {PushNotificationBootstrap} from '@/components/push/PushNotificationBootstrap';
import {UserBadgesRealtimeSync} from '@/components/badges/UserBadgesRealtimeSync';
import {GymlyRealtimeHub} from '@/realtime/gymlyRealtimeHub';
import {SURFACE_LEADERBOARD_IN_MAIN_CHROME, SURFACE_SHOP_IN_TABS} from '@/config/launchSurfaceConfig';
import {useTranslation} from '@/i18n';
import {LanguageSettingsScreen} from '@/screens/settings/LanguageScreen';
import {MessagesHeaderButton} from '@/components/navigation/MessagesHeaderButton';
import LazyShopNavigator from '@/navigation/LazyShopNavigator';
import {
  getMainHeaderActions,
  type MainTabHeaderKey,
} from '@/navigation/mainHeaderActions';
import {shouldHideMainTabBarForShopRoute} from '@/shop/utils/shopGridLayout';
import type {ActiveCenter} from '@/types/activeCenter.types';
import type {GymPresence} from '@/types/gymPresence.types';
export type CheckInStackParamList = {
  CheckInMain: {preselectedGroupId?: string} | undefined;
  LiveWorkout: undefined;
};

export type MainTabParamList = {
  Home: {highlightPostId?: string} | undefined;
  Friends: {
    screen?: 'Venner' | 'Grupper' | 'Centre' | 'Kort';
    /** Changes on each Find-friends tap so the search field focuses again. */
    focusSearch?: number;
  };
  /** Present when SURFACE_SHOP_IN_TABS is false (safe five-tab fallback). */
  Messages?: undefined;
  /** Present when SURFACE_SHOP_IN_TABS is true. */
  Shop?: undefined;
  Profile: undefined;
  CheckIn: NavigatorScreenParams<CheckInStackParamList> | undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  /** Always available from header — not only as a tab. */
  Messages: undefined;
  Settings: undefined;
  Notifications: {highlightNotificationId?: string} | undefined;
  NewMessage: undefined;
  Chat: {
    chatId?: string;
    friendId: string;
    friendName: string;
    initialMessage?: string;
    participants?: Array<{id: string; name: string}>;
  };
  InviteToWorkout: {
    friendId: string;
    friendName: string;
  };
  WorkoutInvitations: undefined;
  GymDetail: {
    gymId: string;
    gym: any;
  };
  GymLeaderboard: {
    gymId: string;
    gym: any;
  };
  Leaderboard: undefined;
  RateGym: {
    gymId: string;
    gym: any;
  };
  FriendWorkoutDetail: {
    friendId: string;
    friendName: string;
    activeTime?: string;
    gymName?: string;
    muscleGroup?: string;
  };
  AddGoal: undefined;
  AddPR: {
    exercise: string;
    existingPR?: any;
  };
  AddRep: {
    exercise: string;
    existingRep?: any;
  };
  GroupDetail: {
    group: any;
  };
  EditGroup: {
    group: any;
  };
  CreateGroup: undefined;
  PlannedWorkouts: undefined;
  PersonalPRsReps: undefined;
  ConnectDevice: undefined;
  ChangeEmail: undefined;
  Help: undefined;
  Support: undefined;
  AboutGymly: undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
  WorkoutHistory: undefined;
  WorkoutHistoryDetail: {sessionId: string};
  ShareWorkout: {sessionId: string};
  SharedWorkoutDetail: {
    authorName: string;
    gymName?: string;
    snapshot: import('@/types/personalRecord.types').SharedWorkoutSnapshot;
  };
  ExercisePrDetail: {
    exerciseName: string;
    exerciseId?: string | null;
  };
  AllTrainings: undefined;
  Badges: {highlightBadgeId?: string} | undefined;
  UpcomingWorkouts: undefined;
  WorkoutSchedule: {
    initialTab?: 'upcoming' | 'history';
    openPlannedId?: string;
  };
  FriendProfile: {
    friendId: string;
    friendName?: string;
    userId?: string;
    mutualFriends?: number;
    gyms?: string[];
    friendAvatarUrl?: string;
    activeCenterName?: string;
  };
  EditProfile: {forceUsernameChange?: boolean} | undefined;
  PushNotifications: undefined;
  FeedSorting: undefined;
  LanguageSettings: undefined;
  ActivityFeed: undefined;
  GymPresence:
    | {activeCenter?: ActiveCenter; gym?: GymPresence}
    | undefined;
  AddFriend: undefined;
  InviteFiveFriends: undefined;
};

function UsernameChangeGate() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const usernameRequiresChange = useAppStore(s => s.user?.usernameRequiresChange);
  const gateOpened = useRef(false);
  useEffect(() => {
    if (usernameRequiresChange && !gateOpened.current) {
      gateOpened.current = true;
      navigation.navigate('EditProfile', {forceUsernameChange: true});
    }
    if (!usernameRequiresChange) {
      gateOpened.current = false;
    }
  }, [usernameRequiresChange, navigation]);
  return null;
}

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<MainStackParamList>();
const CheckInStackNav = createStackNavigator<CheckInStackParamList>();

// Wrapper så Tab viser CheckIn uden React Navigation header
const CheckInStack = () => (
  <CheckInStackNav.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'stretch',
      },
    }}>
    <CheckInStackNav.Screen name="CheckInMain" component={CheckInScreen} />
    <CheckInStackNav.Screen name="LiveWorkout" component={LiveWorkoutScreen} />
  </CheckInStackNav.Navigator>
);

// Settings button component for header
const SettingsButton = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => {
        navigation.navigate('Settings');
      }}
      style={tabHeaderStyles.iconTap}
      activeOpacity={0.75}
      accessibilityLabel={t('a11y.settings')}>
      <Icon name="settings-outline" size={HEADER_ICON} color={colors.text} />
    </TouchableOpacity>
  );
};

const UpcomingButton = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'})}
      style={tabHeaderStyles.iconTap}
      activeOpacity={0.75}
      accessibilityLabel={t('plannedSessions.title')}>
      <Icon name="calendar-outline" size={HEADER_ICON} color={colors.text} />
    </TouchableOpacity>
  );
};

/** Reserved for future competitive/social systems — gated by launchSurfaceConfig. */
const LeaderboardHeaderButton = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Leaderboard')}
      style={tabHeaderStyles.iconTap}
      activeOpacity={0.75}
      accessibilityLabel={t('a11y.leaderboards')}>
      <Icon name="trophy-outline" size={HEADER_ICON} color={colors.text} />
    </TouchableOpacity>
  );
};

// Notifications button component for header
const NotificationsButton = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const bellUnread = useInAppNotificationStore(s => s.dbUnread);

  return (
    <View style={tabHeaderStyles.headerSideLeft}>
      <TouchableOpacity
        onPress={() => navigation.navigate('Notifications')}
        style={tabHeaderStyles.iconTap}
        activeOpacity={0.75}
        accessibilityLabel={t('notifications.title')}>
        <View style={tabHeaderStyles.bellWrap}>
          <Icon name="notifications-outline" size={HEADER_ICON} color={colors.text} />
          {bellUnread > 0 ? (
            <View style={tabHeaderStyles.notifBadge} pointerEvents="none">
              <NotificationBadge
                count={bellUnread}
                variant="error"
                maxCount={99}
                compact
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const MainTabHeaderRight = ({tab}: {tab: MainTabHeaderKey}) => {
  const actions = getMainHeaderActions(tab);
  return (
    <View style={tabHeaderStyles.headerSideRight}>
      {actions.messages ? <MessagesHeaderButton /> : null}
      {SURFACE_LEADERBOARD_IN_MAIN_CHROME && tab === 'Home' ? (
        <LeaderboardHeaderButton />
      ) : null}
      {actions.calendar ? <UpcomingButton /> : null}
      {actions.settings ? <SettingsButton /> : null}
    </View>
  );
};

const MainTabs = () => {
  const {t} = useTranslation();
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      sceneContainerStyle={{flex: 1, overflow: 'hidden'}}
      screenOptions={{
        tabBarHideOnKeyboard: true,
        headerStyle: {
          backgroundColor: colors.backgroundCard,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          paddingVertical: 8,
        },
        headerTitleAlign: 'center',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
          color: colors.text,
          letterSpacing: -0.3,
        },
        headerTintColor: colors.text,
        headerShown: true,
        headerLeft: () => <NotificationsButton />,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t('tabs.home'),
          headerRight: () => <MainTabHeaderRight tab="Home" />,
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsNavigator}
        options={{
          title: t('tabs.friends'),
          headerRight: () => <MainTabHeaderRight tab="Friends" />,
        }}
      />
      <Tab.Screen
        name="CheckIn"
        component={CheckInStack}
        options={{
          title: t('tabs.checkIn'),
          headerRight: () => <MainTabHeaderRight tab="CheckIn" />,
        }}
      />
      {SURFACE_SHOP_IN_TABS ? (
        <Tab.Screen
          name="Shop"
          component={LazyShopNavigator}
          options={({route}) => {
            const nested =
              getFocusedRouteNameFromRoute(route) ?? 'ShopHome';
            return {
              title: t('tabs.shop'),
              headerShown: false,
              tabBarStyle: shouldHideMainTabBarForShopRoute(nested)
                ? {display: 'none'}
                : undefined,
            };
          }}
        />
      ) : (
        <Tab.Screen
          name="Messages"
          component={MessagesScreen}
          options={{
            title: t('tabs.messages'),
            headerRight: () => <MainTabHeaderRight tab="Messages" />,
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('tabs.profile'),
          headerRight: () => <MainTabHeaderRight tab="Profile" />,
        }}
      />
    </Tab.Navigator>
  );
};

const MainNavigator = () => {
  const {t} = useTranslation();
  return (
    <>
      <UsernameChangeGate />
      <GymlyRealtimeHub />
      <InAppNotificationBootstrap />
      <PendingFriendRequestBootstrap />
      <FriendRequestsSheet />
      <PushNotificationBootstrap />
      <UserBadgesRealtimeSync />
      <CheckInSessionController />
      <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.backgroundCard,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: t('tabs.messages'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('settings.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="LanguageSettings"
        component={LanguageSettingsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: t('notifications.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="NewMessage"
        component={NewMessageScreen}
        options={{
          headerShown: false,
        }}
      />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="InviteToWorkout"
              component={InviteToWorkoutScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="WorkoutInvitations"
              component={WorkoutInvitationsScreen}
              options={{
                title: t('nav.workoutInvitations'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="GymDetail"
              component={GymDetailScreen}
              options={{
                headerShown: false,
              }}
            />
            {/* Reserved for future competitive/social systems — screens stay registered. */}
            <Stack.Screen
              name="GymLeaderboard"
              component={GymLeaderboardScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Leaderboard"
              component={LeaderboardScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="RateGym"
              component={RateGymScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="FriendWorkoutDetail"
              component={FriendWorkoutDetailScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="AddGoal"
              component={AddGoalScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="AddPR"
              component={AddPRScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="AddRep"
              component={AddRepScreen}
              options={{
                headerShown: false,
              }}
            />
            {/* Grupper: skærme registreret; primær UI styres af launchSurfaceConfig */}
            <Stack.Screen
              name="GroupDetail"
              component={GroupDetailScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="EditGroup"
              component={EditGroupScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="PlannedWorkouts"
              component={PlannedWorkoutsScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="PersonalPRsReps"
              component={PersonalPRsRepsScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="ConnectDevice"
              component={ConnectDeviceScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="ChangeEmail"
              component={ChangeEmailScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Help"
              component={HelpScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Support"
              component={SupportScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="AboutGymly"
              component={AboutGymlyScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Terms"
              component={TermsScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{
                headerShown: false,
              }}
            />
      <Stack.Screen
        name="WorkoutHistory"
        component={WorkoutHistoryScreen}
        options={{
          title: t('workoutHistory.listTitle'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="WorkoutHistoryDetail"
        component={WorkoutHistoryDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ShareWorkout"
        component={ShareWorkoutScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SharedWorkoutDetail"
        component={SharedWorkoutDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ExercisePrDetail"
        component={ExercisePrDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AllTrainings"
        component={AllTrainingsScreen}
        options={{
          title: t('workoutHistory.listTitle'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="Badges"
        component={BadgesScreen}
        options={{
          title: t('tabs.badges'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="UpcomingWorkouts"
        component={UpcomingWorkoutsScreen}
        options={{
          title: t('plannedSessions.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="WorkoutSchedule"
        component={WorkoutScheduleScreen}
        options={{
          title: t('plannedSessions.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="FriendProfile"
        component={FriendProfileScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="PushNotifications"
        component={PushNotificationsScreen}
        options={{
          title: t('nav.pushNotifications'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="FeedSorting"
        component={FeedSortingScreen}
        options={{
          title: t('nav.feedSorting'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="ActivityFeed"
        component={ActivityFeedScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="GymPresence"
        component={GymPresenceScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AddFriend"
        component={AddFriendScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="InviteFiveFriends"
        component={InviteFiveFriendsScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
      <DemoContentOrchestrator />
    </>
  );
};

export default MainNavigator;

