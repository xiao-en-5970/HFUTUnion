import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listOrdersBuyer, listOrdersSold, OrderRow } from '../api/orders';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import LoadingMask from './LoadingMask';

const CACHE_BUY = 'orders:buyer:v1';
const CACHE_SELL = 'orders:seller:v1';

type Props = {
  navigation: { navigate: (name: string, params?: object) => void };
};

export default function OrderListContent({ navigation }: Props) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [list, setList] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const cacheKey = tab === 'buy' ? CACHE_BUY : CACHE_SELL;
    let hadCache = false;
    try {
      const cached = await cacheGet<{ list: OrderRow[] }>(cacheKey);
      if (cached?.list?.length) {
        hadCache = true;
        setList(cached.list);
        setLoading(false);
      }
    } catch {
      /* noop */
    }
    if (!hadCache) {
      setLoading(true);
    }
    try {
      const res =
        tab === 'buy'
          ? await listOrdersBuyer(1, 40)
          : await listOrdersSold(1, 40);
      const rows = res.list || [];
      setList(rows);
      await cacheSet(cacheKey, { list: rows });
    } catch {
      if (!hadCache) {
        setList([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.wrap}>
      <LoadingMask visible={loading && list.length === 0} hint="正在加载订单…" />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'buy' && styles.tabOn]}
          onPress={() => setTab('buy')}>
          <Text style={[styles.tabText, tab === 'buy' && styles.tabTextOn]}>我买到的</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sell' && styles.tabOn]}
          onPress={() => setTab('sell')}>
          <Text style={[styles.tabText, tab === 'sell' && styles.tabTextOn]}>我卖出的</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>查看订单状态；需要沟通时从底部「聊天」进入会话</Text>
      <FlatList
        style={styles.flex}
        data={list}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>暂无订单</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('OrderDetail', { id: item.id })}>
            <View style={styles.row}>
              {item.good?.images?.[0] ? (
                <Image source={{ uri: item.good.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.ph]} />
              )}
              <View style={styles.info}>
                <Text numberOfLines={2} style={styles.title}>
                  {item.good?.title || '订单'}
                </Text>
                <Text style={styles.status}>{item.order_status_label}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: space.md,
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabOn: { backgroundColor: colors.primaryLight },
  tabText: { fontSize: 15, color: colors.textSecondary },
  tabTextOn: { fontWeight: '700', color: colors.primary },
  sub: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  list: { paddingHorizontal: space.md, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.border },
  ph: { backgroundColor: colors.bg },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  status: { marginTop: 8, fontSize: 13, color: colors.accent },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 32, paddingBottom: 16 },
});
