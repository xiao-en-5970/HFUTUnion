import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  fetchChatConversationsWithUnread,
  fetchChatUnreadSummary,
  type ChatConversation,
  type ChatUnreadSummary,
} from '../api/chat';
import LoadingMask from '../components/LoadingMask';
import { colors, space } from '../theme/colors';
import { chatListStatusLabel } from '../utils/orderChatUi';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import { useMessagesUnread } from '../context/MessagesUnreadContext';

export type OrderChatTab = 'withSellers' | 'withBuyers';

type Props = {
  tab: OrderChatTab;
};

const CHAT_LIST_CACHE_KEY = 'chat:conversations:v1';
const UNREAD_POLL_MS = 35_000;

function formatListTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 订单聊天会话列表（只负责内容，不含顶部 tab；由 MessagesScreen 提供 tab 切换）。
 * tab 指定当前是「我是买家 / 看卖家会话」还是「我是卖家 / 看买家会话」。
 */
export default function OrderChatList({ tab }: Props) {
  const navigation = useNavigation<any>();
  const { refresh: refreshUnread } = useMessagesUnread();
  const [list, setList] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const applyUnreadSummary = useCallback((sum: ChatUnreadSummary) => {
    setList((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const by = sum.by_order || {};
      return prev.map((c) => ({
        ...c,
        unreadCount: by[String(c.orderId)] ?? 0,
      }));
    });
  }, []);

  const load = useCallback(async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{ list: ChatConversation[]; total: number }>(
        CHAT_LIST_CACHE_KEY,
      );
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
      const { list: rows, total } = await fetchChatConversationsWithUnread();
      setList(rows);
      await cacheSet(CHAT_LIST_CACHE_KEY, { list: rows, total });
      // 主动触发全局 unread 汇总刷新，让底栏角标尽快响应
      refreshUnread().catch(() => {});
    } catch {
      if (!hadCache) {
        setList([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUnread]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      loadRef.current();
    }, []),
  );

  useEffect(() => {
    const id = setInterval(() => {
      fetchChatUnreadSummary()
        .then(applyUnreadSummary)
        .catch(() => {});
    }, UNREAD_POLL_MS);
    return () => clearInterval(id);
  }, [applyUnreadSummary]);

  const filtered = useMemo(() => {
    if (tab === 'withSellers') {
      return list.filter((c) => c.counterpartRole === 'seller');
    }
    return list.filter((c) => c.counterpartRole === 'buyer');
  }, [list, tab]);

  return (
    <View style={styles.flex}>
      <LoadingMask visible={loading && list.length === 0} hint="正在加载会话…" />
      {!(loading && list.length === 0) ? (
        <FlatList
          style={styles.flex}
          data={filtered}
          keyExtractor={(item) => String(item.orderId)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadRef.current();
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.list}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Ionicons name="chatbubble-ellipses-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>暂无会话</Text>
              <Text style={styles.emptySub}>
                {tab === 'withSellers'
                  ? '在市集下单后，可与卖家在此协商发货与收货'
                  : '有买家下单后，可与买家在此沟通'}
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const perspective = item.counterpartRole === 'seller' ? 'buyer' : 'seller';
            const statusChip =
              item.orderStatus != null
                ? chatListStatusLabel(
                    perspective,
                    item.orderStatus,
                    item.goodsType,
                    item.goodsCategory,
                  )
                : item.orderStatusLabel || '';
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate('OrderChat', {
                    orderId: item.orderId,
                    goodTitle: item.goodTitle,
                    counterpartRole: item.counterpartRole,
                  })
                }>
                <View style={styles.avatarCol}>
                  <View style={styles.avatarWrap}>
                    {item.goodThumb ? (
                      <Image source={{ uri: item.goodThumb }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPh]}>
                        <Ionicons name="person" size={22} color={colors.textMuted} />
                      </View>
                    )}
                    {(item.unreadCount ?? 0) > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {(item.unreadCount ?? 0) > 99 ? '99+' : item.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {statusChip ? (
                    <Text style={styles.statusChip} numberOfLines={1}>
                      {statusChip}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.mid}>
                  <View style={styles.titleRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      用户 {item.counterpartUserId}
                    </Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {item.goodTitle}
                  </Text>
                </View>
                <Text style={styles.time}>{formatListTime(item.createdAt)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { flex: 1, paddingBottom: 24, backgroundColor: colors.surface },
  avatarCol: { width: 56, alignItems: 'center' },
  statusChip: {
    marginTop: 4,
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 56,
  },
  sep: {
    marginLeft: 16 + 56 + 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  avatarWrap: { marginRight: 12, position: 'relative' },
  unreadBadge: {
    position: 'absolute',
    right: -4,
    top: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
  },
  avatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F2F5',
  },
  mid: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  preview: {
    fontSize: 13,
    color: colors.textMuted,
  },
  time: {
    marginLeft: 8,
    fontSize: 12,
    color: colors.textMuted,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  emptyWrap: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyInner: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: {
    marginTop: space.md,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySub: {
    marginTop: space.sm,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
