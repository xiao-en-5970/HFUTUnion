import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { NavigationProp } from '@react-navigation/native';
import type { GoodRow } from '../api/goods';
import {
  listUserGoods,
  offShelfGood,
  publishGood,
} from '../api/goods';
import { fetchUserInfo } from '../api/user';
import { colors, radius, space } from '../theme/colors';
import { readCachedUserInfo } from '../utils/userCache';
import { resolveCurrentUserId } from '../utils/userId';
import {
  PAGE_SIZE,
  hasMorePages,
  mergeById,
} from '../utils/pagination';
import type { RootStackParamList } from '../navigation/RootStack';

const GOOD_ON = 1;
const GOOD_OFF = 2;
const GOOD_SOLD = 3;

type Props = {
  stackNavigation: NavigationProp<RootStackParamList>;
};

function statusLabel(g: GoodRow) {
  const s = g.good_status;
  if (s == null) {
    return { text: '—', color: colors.textMuted };
  }
  if (s === GOOD_ON) {
    return { text: '在售', color: '#047857' };
  }
  if (s === GOOD_OFF) {
    return { text: '已下架', color: colors.textMuted };
  }
  if (s === GOOD_SOLD) {
    return { text: '已售出', color: colors.accent };
  }
  return { text: '—', color: colors.textMuted };
}

function yuanFromCents(cents: number) {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export default function UserGoodsManageTab({ stackNavigation }: Props) {
  const [rows, setRows] = useState<GoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [_hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const userIdRef = useRef<number | null>(null);

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    const uid = userIdRef.current;
    if (uid == null) {
      return;
    }
    const res = await listUserGoods(uid, page, PAGE_SIZE);
    const list = res.list || [];
    const total = res.total;
    if (append) {
      setRows((prev) => {
        const merged = mergeById(prev, list);
        const more = hasMorePages(
          list.length,
          PAGE_SIZE,
          total,
          merged.length,
        );
        setHasMore(more);
        hasMoreRef.current = more;
        return merged;
      });
    } else {
      setRows(list);
      const more = hasMorePages(
        list.length,
        PAGE_SIZE,
        total,
        list.length,
      );
      setHasMore(more);
      hasMoreRef.current = more;
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const me = await fetchUserInfo();
      let uid = resolveCurrentUserId(me);
      if (uid == null) {
        const cached = await readCachedUserInfo();
        uid = resolveCurrentUserId(cached);
      }
      if (uid == null) {
        userIdRef.current = null;
        setRows([]);
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }
      userIdRef.current = uid;
      pageRef.current = 1;
      loadingMoreRef.current = false;
      try {
        await fetchPage(1, false);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : String(e ?? '');
        Alert.alert('加载失败', message);
        setRows([]);
      }
    } catch {
      setRows([]);
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    pageRef.current = 1;
    await loadInitial();
  };

  const loadMore = async () => {
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      await fetchPage(next, true);
      if (hasMoreRef.current) {
        pageRef.current = next;
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  const toggleShelf = (g: GoodRow) => {
    const st = g.good_status ?? GOOD_ON;
    const goingOff = st === GOOD_ON;
    Alert.alert(
      goingOff ? '下架商品' : '上架商品',
      goingOff
        ? '下架后买家将无法在市集看到该商品，可随时再上架。'
        : '确定重新上架吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: goingOff ? '下架' : '上架',
          onPress: async () => {
            try {
              if (goingOff) {
                await offShelfGood(g.id);
              } else {
                await publishGood(g.id);
              }
              await loadInitial();
            } catch (e: any) {
              Alert.alert('操作失败', e?.message || '');
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: GoodRow }) => {
    const st = statusLabel(item);
    const thumb = item.images?.[0];
    const gs = item.good_status ?? GOOD_ON;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => stackNavigation.navigate('GoodDetail', { id: item.id })}
        activeOpacity={0.88}>
        <View style={styles.row}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.price}>
              ¥{yuanFromCents(item.price ?? 0)}
              <Text style={styles.stock}> · 库存 {item.stock ?? 0}</Text>
            </Text>
            <View style={styles.stats}>
              <Text style={styles.statText}>浏览 {item.view_count ?? 0}</Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.statText}>赞 {item.like_count ?? 0}</Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.statText}>收藏 {item.collect_count ?? 0}</Text>
            </View>
            <Text style={[styles.badge, { color: st.color }]}>{st.text}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              stackNavigation.navigate('GoodCreate', { goodId: item.id })
            }>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>编辑</Text>
          </TouchableOpacity>
          {gs === GOOD_SOLD ? null : (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => toggleShelf(item)}>
              <Ionicons
                name={gs === GOOD_ON ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.actionText}>
                {gs === GOOD_ON ? '下架' : '上架'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.35}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.empty}>暂无商品</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: space.md, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  price: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  stock: { fontWeight: '500', color: colors.textSecondary, fontSize: 13 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  statText: { fontSize: 12, color: colors.textSecondary },
  statDot: { fontSize: 12, color: colors.textMuted },
  badge: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 20,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    color: colors.textMuted,
    fontSize: 15,
  },
});
