import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import HomeScreen from '../screens/HomeScreen';
import Community from '../screens/Community';
import ChatListScreen from '../screens/ChatListScreen';
import GoodListScreen from '../screens/GoodListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  /** 底部系统导航栏（三键导航等）与 Home 指示条由 safe area 提供 */
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 52 + bottomPad;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 8,
          backgroundColor: colors.surface,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: '发现',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={Community}
        options={{
          title: '社区',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{
          title: '聊天',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Market"
        component={GoodListScreen}
        options={{
          title: '市集',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bag-handle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
