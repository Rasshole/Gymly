/**
 * Main Navigator
 * Main app screens after authentication
 */

import React from 'react';
import {TouchableOpacity, View, Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {useNavigation, CompositeNavigationProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import HomeScreen from '@/screens/main/HomeScreen';
import ProfileScreen from '@/screens/main/ProfileScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';
import MessagesScreen from '@/screens/main/MessagesScreen';
import FriendsNavigator from '@/screens/main/FriendsNavigator';
import CheckInScreen from '@/screens/main/CheckInScreen';
import NotificationsScreen from '@/screens/main/NotificationsScreen';
import NewMessageScreen from '@/screens/main/NewMessageScreen';
import ChatScreen from '@/screens/main/ChatScreen';
import InviteToWorkoutScreen from '@/screens/main/InviteToWorkoutScreen';
import WorkoutInvitationsScreen from '@/screens/main/WorkoutInvitationsScreen';
import GymDetailScreen from '@/screens/main/GymDetailScreen';
import RateGymScreen from '@/screens/main/RateGymScreen';
import FriendWorkoutDetailScreen from '@/screens/main/FriendWorkoutDetailScreen';
import AddGoalScreen from '@/screens/main/AddGoalScreen';
import AddPRScreen from '@/screens/main/AddPRScreen';
import AddRepScreen from '@/screens/main/AddRepScreen';
import GroupDetailScreen from '@/screens/main/GroupDetailScreen';
import EditGroupScreen from '@/screens/main/EditGroupScreen';
import PlannedWorkoutsScreen from '@/screens/main/PlannedWorkoutsScreen';
import PersonalPRsRepsScreen from '@/screens/main/PersonalPRsRepsScreen';
import ConnectDeviceScreen from '@/screens/main/ConnectDeviceScreen';
import ChangeEmailScreen from '@/screens/main/ChangeEmailScreen';
import HelpScreen from '@/screens/main/HelpScreen';
import SupportScreen from '@/screens/main/SupportScreen';
import AboutGymlyScreen from '@/screens/main/AboutGymlyScreen';
import WorkoutHistoryScreen from '@/screens/main/WorkoutHistoryScreen';
import UpcomingWorkoutsScreen from '@/screens/main/UpcomingWorkoutsScreen';
import WorkoutScheduleScreen from '@/screens/main/WorkoutScheduleScreen';
import FriendProfileScreen from '@/screens/main/FriendProfileScreen';
import EditProfileScreen from '@/screens/main/EditProfileScreen';
import {useNotificationStore} from '@/store/notificationStore';
import {colors} from '@/theme/colors';

export type MainTabParamList = {
  Home: undefined;
  Friends: undefined;
  Messages: undefined;
  Profile: undefined;
  CheckIn: undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  Settings: undefined;
  Notifications: undefined;
  NewMessage: undefined;
  Chat: {
    friendId: string;
    friendName: string;
    initialMessage?: string;
  };
  InviteToWorkout: {
    friendId: string;
    friendName: string;
  };
  WorkoutInvitations: undefined;
  GymDetail: {
    gymId: number;
    gym: any;
  };
  RateGym: {
    gymId: number;
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
  PlannedWorkouts: undefined;
  PersonalPRsReps: undefined;
  ConnectDevice: undefined;
  ChangeEmail: undefined;
  Help: undefined;
  Support: undefined;
  AboutGymly: undefined;
  WorkoutHistory: undefined;
  UpcomingWorkouts: undefined;
  WorkoutSchedule: {
    initialTab?: 'upcoming' | 'history';
  };
  FriendProfile: {
    friendId: string;
    friendName: string;
    mutualFriends: number;
    gyms: string[];
  };
  EditProfile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<MainStackParamList>();

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
      style={{marginLeft: 16}}>
      <Icon name="settings-outline" size={24} color="#FFFFFF" />
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
      style={{marginRight: 16}}>
      <Icon name="calendar-outline" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  );
};

// Notifications button component for header
const NotificationsButton = () => {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    StackNavigationProp<MainStackParamList>
  >>();
  const {unreadCount} = useNotificationStore();

  return (
    <TouchableOpacity
      onPress={() => {
        navigation.navigate('Notifications');
      }}
      style={{marginRight: 16, position: 'relative'}}>
      <Icon name="notifications-outline" size={24} color="#FFFFFF" />
      {unreadCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            backgroundColor: '#FF3B30',
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 6,
          }}>
          <Text
            style={{
              color: '#fff',
              fontSize: 12,
              fontWeight: 'bold',
            }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({focused, color, size}) => {
          let iconName: string;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Friends') {
            iconName = focused ? 'radio' : 'radio-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'CheckIn') {
            iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.backgroundCard,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.backgroundCard,
        },
        headerTintColor: colors.text,
        headerShown: true,
        headerLeft: () => <SettingsButton />,
        headerRight: () => (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <UpcomingButton />
            <NotificationsButton />
          </View>
        ),
      })}>
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
        component={CheckInScreen}
        options={{title: 'Tjek ind'}}
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
          </Stack.Navigator>
        );
      };

      export default MainNavigator;

