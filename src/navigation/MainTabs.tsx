import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import TabTransitionContainer from '../components/TabTransitionContainer';
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
        tabBarHideOnKeyboard: true,
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
        options={{
          title: '发现',
          /**
           * 发现页有搜索框；若全局 tabBarHideOnKeyboard 为 true，从其它 Tab 带键盘切回时
           * isKeyboardShown 仍为 true，底栏会一直隐藏。此 Tab 固定显示底栏。
           */
          tabBarHideOnKeyboard: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <HomeScreen />
          </TabTransitionContainer>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Community"
        options={{
          title: '社区',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <Community />
          </TabTransitionContainer>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Chat"
        options={{
          title: '聊天',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <ChatListScreen />
          </TabTransitionContainer>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Market"
        options={{
          title: '市集',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bag-handle-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <GoodListScreen />
          </TabTransitionContainer>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <ProfileScreen />
          </TabTransitionContainer>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
