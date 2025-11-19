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
import {useNotificationStore} from '@/store/notificationStore';

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
      style={{marginRight: 8}}>
      <Icon name="settings-outline" size={24} color="#000" />
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
      <Icon name="notifications-outline" size={24} color="#000" />
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
            iconName = focused ? 'people' : 'people-outline';
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
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
        headerRight: () => (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <NotificationsButton />
            <SettingsButton />
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
        options={{title: 'Venner'}}
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
    <Stack.Navigator>
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
          </Stack.Navigator>
        );
      };

      export default MainNavigator;

