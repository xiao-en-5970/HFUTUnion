import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import Messages from '../screens/Messages.tsx';
import ProfileScreen from '../screens/ProfileScreen';
import Community from '../screens/Community.tsx';
import Library from '../screens/Library.tsx';

const Tab = createBottomTabNavigator();

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarIcon: () => null,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 55,
          backgroundColor: '#fff',
          paddingBottom: 10,
        },
        tabBarActiveTintColor: '#0058A2',
        tabBarInactiveTintColor: '#999999',
        tabBarLabelStyle: {
          fontSize: 18,
          fontWeight: '500',
          margin: 0,
          ...Platform.select({
            ios: {
              marginTop: -20,
            },
            android: {
              marginTop: -15,
            },
          }),
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
        },
      }}
    >
      <Tab.Screen name="Search" options={{ title: '搜索' }} component={HomeScreen}/>
      <Tab.Screen name="社区" component={Community} />
      <Tab.Screen name="消息" component={Messages} />
      <Tab.Screen name="念书" component={Library}/>
      <Tab.Screen name="我" component={ProfileScreen} />      
    </Tab.Navigator>
  );
}