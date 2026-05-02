import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import TabTransitionContainer from '../components/TabTransitionContainer';
import HomeScreen from '../screens/HomeScreen';
import Community from '../screens/Community';
import HelpFeedScreen from '../screens/HelpFeedScreen';
import GoodListScreen from '../screens/GoodListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme/colors';
import { useMessagesUnread } from '../context/MessagesUnreadContext';
import { useNotifSettings } from '../utils/notifSettings';

const Tab = createBottomTabNavigator();

/**
 * 未读数 + 偏好 → 「我的」tab badge：
 * - 关闭「显示数字」：>0 返回空格，容器画红点
 * - 开启「显示数字」：真实数字或 99+
 */
function useMessagesBadge(): string | number | undefined {
  const { total } = useMessagesUnread();
  const { showBadgeCount } = useNotifSettings();
  if (total <= 0) {
    return undefined;
  }
  if (!showBadgeCount) {
    return ' ';
  }
  return total > 99 ? '99+' : total;
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 52 + bottomPad;
  const profileBadge = useMessagesBadge();

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
        name="Help"
        options={{
          title: '求助',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-buoy-outline" color={color} size={size} />
          ),
        }}>
        {() => (
          <TabTransitionContainer>
            <HelpFeedScreen />
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
          tabBarBadge: profileBadge,
          tabBarBadgeStyle: {
            backgroundColor: '#FF3B30',
            color: '#fff',
            fontSize: 11,
            minWidth: 16,
            height: 16,
            lineHeight: 14,
          },
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
