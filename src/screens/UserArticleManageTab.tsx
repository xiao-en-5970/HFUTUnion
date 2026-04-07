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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ArticleListTags from '../components/ArticleListTags';
import type { NavigationProp } from '@react-navigation/native';
import {
  type ArticleRow,
  deleteAnswer,
  deletePost,
  deleteQuestion,
  listUserAnswers,
  listUserPosts,
  listUserQuestions,
} from '../api/article';
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

export type ArticleManageKind = 'posts' | 'questions' | 'answers';

type Props = {
  kind: ArticleManageKind;
  stackNavigation: NavigationProp<RootStackParamList>;
};

function formatTime(iso?: string) {
  if (!iso) {
    return '';
  }
  return iso.slice(0, 16).replace('T', ' ');
}

export default function UserArticleManageTab({
  kind,
  stackNavigation,
}: Props) {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [_hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const userIdRef = useRef<number | null>(null);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const uid = userIdRef.current;
      if (uid == null) {
        return;
      }
      let res;
      if (kind === 'posts') {
        res = await listUserPosts(uid, page, PAGE_SIZE);
      } else if (kind === 'questions') {
        res = await listUserQuestions(uid, page, PAGE_SIZE);
      } else {
        res = await listUserAnswers(uid, page, PAGE_SIZE);
      }
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
    },
    [kind],
  );

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

  const confirmDelete = (item: ArticleRow) => {
    const title = item.title?.trim() || '这条内容';
    Alert.alert('确认删除', `确定删除「${title.slice(0, 40)}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            if (kind === 'posts') {
              await deletePost(item.id);
            } else if (kind === 'questions') {
              await deleteQuestion(item.id);
            } else {
              await deleteAnswer(item.id);
            }
            setRows((prev) => prev.filter((r) => r.id !== item.id));
          } catch (e: any) {
            Alert.alert('删除失败', e?.message || '');
          }
        },
      },
    ]);
  };

  const openEdit = (item: ArticleRow) => {
    if (kind === 'posts') {
      stackNavigation.navigate('EditPost', { id: item.id });
    } else if (kind === 'questions') {
      stackNavigation.navigate('EditQuestion', { id: item.id });
    } else {
      stackNavigation.navigate('EditAnswer', { id: item.id });
    }
  };

  const openDetail = (item: ArticleRow) => {
    if (kind === 'posts') {
      stackNavigation.navigate('PostDetail', { id: item.id });
    } else if (kind === 'questions') {
      stackNavigation.navigate('QuestionDetail', { id: item.id });
    } else {
      stackNavigation.navigate('AnswerDetail', { id: item.id });
    }
  };

  const listKind =
    kind === 'posts'
      ? ('post' as const)
      : kind === 'questions'
        ? ('question' as const)
        : ('answer' as const);

  const renderItem = ({ item }: { item: ArticleRow }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => openDetail(item)}
      activeOpacity={0.88}>
      <ArticleListTags
        kind={listKind}
        schoolId={item.school_id}
        compact
      />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title?.trim() ||
          (kind === 'answers' ? item.content?.slice(0, 80) : '无标题')}
      </Text>
      <Text style={styles.meta}>{formatTime(item.created_at)}</Text>
      <View style={styles.stats}>
        <Text style={styles.statText}>浏览 {item.view_count ?? 0}</Text>
        <Text style={styles.statDot}>·</Text>
        <Text style={styles.statText}>
          {kind === 'questions' ? '同问' : '赞'} {item.like_count ?? 0}
        </Text>
        <Text style={styles.statDot}>·</Text>
        <Text style={styles.statText}>收藏 {item.collect_count ?? 0}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => openEdit(item)}
          hitSlop={{ top: 8, bottom: 8 }}>
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={styles.actionText}>编辑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => confirmDelete(item)}
          hitSlop={{ top: 8, bottom: 8 }}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.actionText, { color: colors.danger }]}>删除</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={styles.empty}>暂无内容</Text>
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  statText: { fontSize: 12, color: colors.textSecondary },
  statDot: { fontSize: 12, color: colors.textMuted },
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
