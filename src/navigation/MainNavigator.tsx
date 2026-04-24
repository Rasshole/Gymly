/**
 * Main Navigator
 * Main app screens after authentication
 */

import React from 'react';
import {TouchableOpacity, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {
  useNavigation,
  CompositeNavigationProp,
  NavigatorScreenParams,
} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';

import HomeScreen from '@/screens/main/HomeScreen';
import ProfileScreen from '@/screens/main/ProfileScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';
import MessagesScreen from '@/screens/main/MessagesScreen';
import BadgesScreen from '@/screens/main/BadgesScreen';
import FriendsNavigator from '@/screens/main/FriendsNavigator';
import CheckInScreen from '@/screens/main/CheckInScreen';
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
import UpcomingWorkoutsScreen from '@/screens/main/UpcomingWorkoutsScreen';
import WorkoutScheduleScreen from '@/screens/main/WorkoutScheduleScreen';
import FriendProfileScreen from '@/screens/main/FriendProfileScreen';
import EditProfileScreen from '@/screens/main/EditProfileScreen';
import PushNotificationsScreen from '@/screens/main/PushNotificationsScreen';
import FeedSortingScreen from '@/screens/main/FeedSortingScreen';
import ActivityFeedScreen from '@/screens/main/ActivityFeedScreen';
import GymPresenceScreen from '@/screens/main/GymPresenceScreen';
import AddFriendScreen from '@/screens/main/AddFriendScreen';
import {useInAppNotifications} from '@/hooks/useInAppNotifications';
import {InAppNotificationBootstrap} from '@/components/inApp/InAppNotificationBootstrap';
import {useAppStore} from '@/store/appStore';
import CustomTabBar from '@/components/CustomTabBar';
import NotificationBadge from '@/components/ui/Badge';
import {DmRealtimeSync} from '@/components/DmRealtimeSync';
import {FriendRequestRealtimeSync} from '@/components/FriendRequestRealtimeSync';
import ActiveCheckinGeofenceMonitor from '@/components/checkin/ActiveCheckinGeofenceMonitor';
import {PushNotificationBootstrap} from '@/components/push/PushNotificationBootstrap';
export type CheckInStackParamList = {
  CheckInMain: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Friends: {screen?: 'Online' | 'Grupper' | 'Centre' | 'Kort'};
  Badges: {highlightBadgeId?: string} | undefined;
  Messages: undefined;
  Profile: undefined;
  CheckIn: NavigatorScreenParams<CheckInStackParamList> | undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
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
  };
  EditProfile: undefined;
  PushNotifications: undefined;
  FeedSorting: undefined;
  ActivityFeed: undefined;
  GymPresence: {gym?: any} | undefined;
  AddFriend: undefined;
};

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
  </CheckInStackNav.Navigator>
);

// Settings button component for header
const SettingsButton = () => {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => {
        navigation.navigate('Settings');
      }}
      style={{marginRight: spacing.lg}}>
      <Icon name="settings-outline" size={29} color={colors.text} />
    </TouchableOpacity>
  );
};

const UpcomingButton = () => {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'})}
      style={{marginRight: spacing.lg}}>
      <Icon name="calendar-outline" size={29} color={colors.text} />
    </TouchableOpacity>
  );
};

const LeaderboardButton = () => {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Leaderboard')}
      style={{marginRight: spacing.lg}}>
      <Icon name="trophy" size={29} color={colors.text} />
    </TouchableOpacity>
  );
};

// Notifications button component for header
const NotificationsButton = () => {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  const {dbUnread: bellTotal} = useInAppNotifications();

  return (
    <TouchableOpacity
      onPress={() => {
        navigation.navigate('Notifications');
      }}
      style={{marginLeft: spacing.lg, position: 'relative'}}>
      <Icon name="notifications-outline" size={29} color={colors.text} />
      {bellTotal > 0 && (
        <View style={{position: 'absolute', top: -4, right: -4}}>
          <NotificationBadge count={bellTotal} variant="error" maxCount={99} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      sceneContainerStyle={{flex: 1, overflow: 'hidden'}}
      screenOptions={{
        tabBarHideOnKeyboard: true,
        headerStyle: {
          backgroundColor: colors.backgroundCard,
        },
        headerTintColor: colors.text,
        headerShown: true,
        headerLeft: () => <NotificationsButton />,
        headerRight: () => (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <LeaderboardButton />
            <UpcomingButton />
            <SettingsButton />
          </View>
        ),
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{title: 'Hjem'}}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsNavigator}
        options={{title: 'Online'}}
      />
      <Tab.Screen
        name="CheckIn"
        component={CheckInStack}
        options={{title: 'Tjek ind'}}
      />
      <Tab.Screen
        name="Badges"
        component={BadgesScreen}
        options={{title: 'Badges'}}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{title: 'Beskeder'}}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{title: 'Profil'}}
      />
    </Tab.Navigator>
  );
};

const MainNavigator = () => {
  return (
    <>
      <InAppNotificationBootstrap />
      <PushNotificationBootstrap />
      <FriendRequestRealtimeSync />
      <DmRealtimeSync />
      <ActiveCheckinGeofenceMonitor />
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
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Indstillinger',
          headerBackTitle: 'Tilbage',
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifikationer',
          headerBackTitle: 'Tilbage',
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
                title: 'Træningsinvitationer',
                headerBackTitle: 'Tilbage',
              }}
            />
            <Stack.Screen
              name="GymDetail"
              component={GymDetailScreen}
              options={{
                headerShown: false,
              }}
            />
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
          title: 'Tidligere workouts',
          headerBackTitle: 'Tilbage',
        }}
      />
      <Stack.Screen
        name="UpcomingWorkouts"
        component={UpcomingWorkoutsScreen}
        options={{
          title: 'Kommende træninger',
          headerBackTitle: 'Tilbage',
        }}
      />
      <Stack.Screen
        name="WorkoutSchedule"
        component={WorkoutScheduleScreen}
        options={{
          title: 'Træningsplan',
          headerBackTitle: 'Tilbage',
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
          title: 'Push Notifikationer',
          headerBackTitle: 'Tilbage',
        }}
      />
      <Stack.Screen
        name="FeedSorting"
        component={FeedSortingScreen}
        options={{
          title: 'Feed Sortering',
          headerBackTitle: 'Tilbage',
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
    </Stack.Navigator>
    </>
  );
};

export default MainNavigator;

