import React from 'react';
import { StyleSheet, View } from 'react-native';
import Screen from '../components/Screen';
import OrderListContent from '../components/OrderListContent';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootStack';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MyOrders'>;
};

/**
 * 独立「我的订单」页：FlatList 为根滚动容器，避免嵌在 ScrollView 内触发 RN 警告。
 */
export default function MyOrdersScreen({ navigation }: Props) {
  return (
    <Screen scroll={false} edges={['bottom']}>
      <View style={styles.fill}>
        <OrderListContent navigation={navigation} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
