import React from 'react';
import { StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { NavigationProp } from '@react-navigation/native';
import Screen from '../components/Screen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootStack';
import UserArticleManageTab from './UserArticleManageTab';
import UserGoodsManageTab from './UserGoodsManageTab';

const Tab = createMaterialTopTabNavigator();

type Props = {
  navigation: NavigationProp<RootStackParamList>;
};

export default function MyContentScreen({ navigation }: Props) {
  return (
    <Screen scroll={false} edges={['bottom']}>
      <Tab.Navigator
        screenOptions={{
          tabBarLabelStyle: styles.tabLabel,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIndicatorStyle: styles.tabIndicator,
          tabBarScrollEnabled: true,
          tabBarItemStyle: styles.tabItem,
          swipeEnabled: true,
          lazy: true,
          lazyPreloadDistance: 1,
          animationEnabled: true,
        }}>
        <Tab.Screen
          name="MUserPosts"
          options={{ title: '帖子' }}>
          {() => (
            <UserArticleManageTab kind="posts" stackNavigation={navigation} />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="MUserQuestions"
          options={{ title: '求助' }}>
          {() => (
            <UserArticleManageTab
              kind="questions"
              stackNavigation={navigation}
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="MUserAnswers"
          options={{ title: '回答' }}>
          {() => (
            <UserArticleManageTab
              kind="answers"
              stackNavigation={navigation}
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="MUserGoods"
          options={{ title: '商品' }}>
          {() => <UserGoodsManageTab stackNavigation={navigation} />}
        </Tab.Screen>
      </Tab.Navigator>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 13, fontWeight: '600' },
  tabIndicator: { backgroundColor: colors.primary },
  tabItem: { width: 'auto', minWidth: 56, paddingHorizontal: 4 },
});
