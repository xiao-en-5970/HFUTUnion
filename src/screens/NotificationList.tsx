import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  listNotifications,
  markNotificationsRead,
  NOTIFY_TYPE,
  TARGET_EXT,
  type NotificationFilter,
  type NotificationItem,
} from '../api/notification';
import { colors, radius, space } from '../theme/colors';
import { useMessagesUnread } from '../context/MessagesUnreadContext';

const PAGE_SIZE = 20;

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'like', label: '赞' },
  // 评论 tab 同时包含「评论你」和「回复你」两类
  { key: 'comment', label: '评论' },
  { key: 'official', label: '官方' },
];

const defaultAvatar = require('../assets/default-avatar.png');

function verbOf(n: NotificationItem): string {
  switch (n.type) {
    case NOTIFY_TYPE.LikeArticle:
      return ' 赞了你的作品';
    case NOTIFY_TYPE.LikeComment:
      return ' 赞了你的评论';
    case NOTIFY_TYPE.Comment:
      return ' 评论了你';
    case NOTIFY_TYPE.Reply:
      return ' 回复了你';
    case NOTIFY_TYPE.Official:
      return '';
    default:
      return '';
  }
}

/**
 * 聚合点赞的第一行文案：count>1 时展示为「N 等 X 人」，否则回退到单人。
 * 顶层评论与回复不聚合，count 恒为 1。
 */
function formatActorPrefix(n: NotificationItem): string {
  const fromName = n.from?.username || (n.type === NOTIFY_TYPE.Official ? '官方' : '');
  const count = n.count && n.count > 1 ? n.count : 1;
  if (count > 1) {
    return fromName ? `${fromName} 等 ${count} 人` : `${count} 人`;
  }
  return fromName;
}

/**
 * 「在哪个帖子/回答下」的文案前缀。
 * - 赞作品 / 顶层评论 → 看 target_type
 * - 赞评论 / 回复 → 看 ref_ext_type（因为 target_type=评论，真正的内容在 ref_*）
 */
function kindLabelOf(n: NotificationItem): string {
  let ext = 0;
  if (n.type === NOTIFY_TYPE.LikeArticle || n.type === NOTIFY_TYPE.Comment) {
    ext = n.target_type;
  } else if (n.type === NOTIFY_TYPE.LikeComment || n.type === NOTIFY_TYPE.Reply) {
    ext = n.ref_ext_type;
  }
  switch (ext) {
    case TARGET_EXT.Post:
      return '帖子';
    case TARGET_EXT.Question:
      return '提问';
    case TARGET_EXT.Answer:
      return '回答';
    case TARGET_EXT.Goods:
      return '商品';
    default:
      return '';
  }
}

function displayTime(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) {
    return iso;
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
 * 点击一条通知时，根据 type / target 跳到对应页面。
 * 做了最大限度的兜底：某些目标可能被删了导致详情接口 404，但跳转动作不会崩。
 */
function useNotifNavigate() {
  const navigation = useNavigation<any>();
  return useCallback(
    (n: NotificationItem) => {
      // 官方通知无明确跳转目标，点一下只是标记已读
      if (n.type === NOTIFY_TYPE.Official) {
        return;
      }
      const target = n.target_type;
      const ref = n.ref_ext_type;
      // 评论/回复 target_type=5：跳到评论所属的文章/商品详情
      if (target === TARGET_EXT.Comment) {
        routeToExtDetail(navigation, ref, n.ref_id);
        return;
      }
      // 点赞/评论（顶层）直接跳文章或商品详情
      routeToExtDetail(navigation, target, n.target_id);
    },
    [navigation],
  );
}

function routeToExtDetail(navigation: any, ext: number, id: number) {
  if (!ext || !id) {
    return;
  }
  switch (ext) {
    case TARGET_EXT.Post:
      navigation.navigate('PostDetail', { id });
      break;
    case TARGET_EXT.Question:
      navigation.navigate('QuestionDetail', { id });
      break;
    case TARGET_EXT.Answer:
      navigation.navigate('AnswerDetail', { id });
      break;
    case TARGET_EXT.Goods:
      navigation.navigate('GoodDetail', { id });
      break;
    default:
      break;
  }
}

export default function NotificationList() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const gotoDetail = useNotifNavigate();
  const { refresh: refreshUnread, notifByType, notifTotal } = useMessagesUnread();

  const loadPage = useCallback(
    async (opts: { replace?: boolean; page?: number; filter?: NotificationFilter } = {}) => {
      const p = opts.page ?? 1;
      const f = opts.filter ?? filter;
      try {
        if (opts.replace) {
          setLoading(items.length === 0);
        } else {
          setLoadingMore(true);
        }
        const res = await listNotifications({ page: p, pageSize: PAGE_SIZE, filter: f });
        setItems((prev) => {
          if (opts.replace) {
            return res.list;
          }
          // 合并去重：后续页追加到末尾
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...res.list.filter((n) => !seen.has(n.id))];
        });
        setPage(p);
        setHasMore(res.list.length >= PAGE_SIZE);
      } catch {
        if (opts.replace) {
          setItems([]);
        }
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter, items.length],
  );

  const loadRef = useRef(loadPage);
  loadRef.current = loadPage;

  useFocusEffect(
    useCallback(() => {
      loadRef.current({ replace: true, page: 1, filter });
    }, [filter]),
  );

  const badgeCountFor = useCallback(
    (f: NotificationFilter): number => {
      const get = (k: number) => Number(notifByType?.[String(k)] ?? 0);
      switch (f) {
        case 'all':
          return notifTotal;
        case 'like':
          return get(NOTIFY_TYPE.LikeArticle) + get(NOTIFY_TYPE.LikeComment);
        case 'comment':
          // 「评论」tab 合并评论 + 回复
          return get(NOTIFY_TYPE.Comment) + get(NOTIFY_TYPE.Reply);
        case 'official':
          return get(NOTIFY_TYPE.Official);
      }
    },
    [notifByType, notifTotal],
  );

  const handleItemPress = useCallback(
    async (n: NotificationItem) => {
      if (!n.is_read) {
        try {
          await markNotificationsRead({ ids: [n.id] });
          setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
          refreshUnread().catch(() => {});
        } catch {
          /* 接口失败不阻塞跳转 */
        }
      }
      gotoDetail(n);
    },
    [gotoDetail, refreshUnread],
  );

  const renderedFilter = useMemo(
    () => (
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          const count = badgeCountFor(f.key);
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, on && styles.filterChipOn]}
              onPress={() => {
                setFilter(f.key);
                setItems([]);
                setHasMore(true);
                loadRef.current({ replace: true, page: 1, filter: f.key });
              }}
              activeOpacity={0.8}>
              <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
              {count > 0 ? (
                <View style={[styles.dot, on && styles.dotOn]}>
                  <Text style={styles.dotText}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    ),
    [filter, badgeCountFor],
  );

  return (
    <View style={styles.flex}>
      {renderedFilter}
      <FlatList
        style={styles.flex}
        data={items}
        keyExtractor={(it) => String(it.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadRef.current({ replace: true, page: 1, filter });
            }}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (!loadingMore && hasMore && !loading && items.length > 0) {
            loadRef.current({ page: page + 1, filter });
          }
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>暂无消息</Text>
              <Text style={styles.emptySub}>有人赞你、评论你、官方有通告时会出现在这里</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const actorPrefix = formatActorPrefix(item);
          const avatar =
            item.from?.avatar ? { uri: item.from.avatar } : defaultAvatar;
          const isOfficial = item.type === NOTIFY_TYPE.Official;
          const timeISO = item.updated_at || item.created_at;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() => handleItemPress(item)}>
              <View style={styles.avatarWrap}>
                {isOfficial ? (
                  <View style={[styles.avatar, styles.avatarOfficial]}>
                    <Ionicons name="megaphone" size={22} color="#B45309" />
                  </View>
                ) : (
                  <Image source={avatar} style={styles.avatar} />
                )}
                {!item.is_read ? <View style={styles.unreadDot} /> : null}
              </View>
              <View style={styles.mid}>
                <Text style={styles.titleLine} numberOfLines={1}>
                  <Text style={styles.name}>{actorPrefix}</Text>
                  <Text style={styles.verb}>{verbOf(item)}</Text>
                </Text>
                {item.summary ? (
                  <Text style={styles.summary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
                {item.title ? (
                  <Text style={styles.refTitle} numberOfLines={1}>
                    ⟶ {kindLabelOf(item) ? `${kindLabelOf(item)}《${item.title}》` : item.title}
                  </Text>
                ) : null}
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.time}>{displayTime(timeISO)}</Text>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.thumb} />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipOn: { backgroundColor: colors.primaryLight },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  filterTextOn: { color: colors.primary },
  dot: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: '#FF3B30' },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sep: {
    marginLeft: 16 + 48 + 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    paddingVertical: 12,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
  },
  avatarWrap: { marginRight: 12, position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  avatarOfficial: {
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface,
  },
  mid: { flex: 1, minWidth: 0 },
  titleLine: { fontSize: 15, lineHeight: 20 },
  name: { fontWeight: '700', color: colors.text },
  verb: { color: colors.textSecondary },
  summary: {
    marginTop: 4,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  refTitle: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  rightCol: { marginLeft: 8, alignItems: 'flex-end' },
  time: { fontSize: 12, color: colors.textMuted },
  thumb: {
    marginTop: 6,
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  emptyWrap: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: space.xl,
  },
  emptyTitle: {
    marginTop: space.md,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySub: {
    marginTop: space.sm,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: { paddingVertical: 18, alignItems: 'center' },
});
