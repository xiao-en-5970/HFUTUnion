import React from 'react';
import { StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { NavigationProp } from '@react-navigation/native';
import Screen from '../components/Screen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootStack';
import UserCollectListTab from './UserCollectListTab';

const Tab = createMaterialTopTabNavigator();

type Props = {
  navigation: NavigationProp<RootStackParamList>;
};

export default function MyCollectsScreen({ navigation }: Props) {
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
        <Tab.Screen name="CPosts" options={{ title: '帖子' }}>
          {() => (
            <UserCollectListTab variant="post" stackNavigation={navigation} />
          )}
        </Tab.Screen>
        <Tab.Screen name="CQuestions" options={{ title: '求助' }}>
          {() => (
            <UserCollectListTab variant="question" stackNavigation={navigation} />
          )}
        </Tab.Screen>
        <Tab.Screen name="CAnswers" options={{ title: '回答' }}>
          {() => (
            <UserCollectListTab variant="answer" stackNavigation={navigation} />
          )}
        </Tab.Screen>
        <Tab.Screen name="CGoods" options={{ title: '商品' }}>
          {() => (
            <UserCollectListTab variant="good" stackNavigation={navigation} />
          )}
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
