/**
 * Friends Navigator
 * Tab navigator for Friends, Centres, and Map screens
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import FriendsScreen from './FriendsScreen';
import CentresScreen from './CentresScreen';
import MapScreen from './MapScreen';

export type FriendsTabParamList = {
  Venner: undefined;
  Centre: undefined;
  Kort: undefined;
};

const Tab = createMaterialTopTabNavigator<FriendsTabParamList>();

// Custom Tab Bar Component
const CustomTabBar = ({state, descriptors, navigation}: any) => {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route: any, index: number) => {
        const {options} = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? {selected: true} : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={styles.tabItem}>
            <Text
              style={[
                styles.tabLabel,
                isFocused && styles.tabLabelActive,
              ]}>
              {label}
            </Text>
            {isFocused && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const FriendsNavigator = () => {
  return (
    <View style={styles.container}>
      <Tab.Navigator
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          swipeEnabled: true,
        }}>
        <Tab.Screen
          name="Venner"
          component={FriendsScreen}
          options={{
            title: 'Venner',
            tabBarLabel: 'Venner',
          }}
        />
        <Tab.Screen
          name="Centre"
          component={CentresScreen}
          options={{
            title: 'Centre',
            tabBarLabel: 'Centre',
          }}
        />
        <Tab.Screen
          name="Kort"
          component={MapScreen}
          options={{
            title: 'Kort',
            tabBarLabel: 'Kort',
          }}
        />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'none',
  },
  tabLabelActive: {
    color: '#000',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#000',
  },
});

export default FriendsNavigator;
