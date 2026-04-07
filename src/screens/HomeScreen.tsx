import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { searchArticles, SearchArticleItem } from '../api/search';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import {
  PAGE_SIZE,
  mergeSearchItems,
  hasMorePages,
} from '../utils/pagination';

const HOME_SEARCH_CACHE = 'home:search:combined:v1';

export default function HomeScreen({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const [q, setQ] = useState('');
  const [list, setList] = useState<SearchArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const qRef = useRef('');

  useEffect(() => {
    qRef.current = q;
  }, [q]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const cacheKeyFor = (kw: string) => `${HOME_SEARCH_CACHE}:${kw || '__empty__'}`;

  const loadInitial = useCallback(async (keyword?: string) => {
    const kw = keyword !== undefined ? keyword : qRef.current;
    const cacheKey = cacheKeyFor(kw);
    let hadCache = false;
    try {
      const cached = await cacheGet<{ list: SearchArticleItem[] }>(cacheKey);
      if (cached?.list) {
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
    pageRef.current = 1;
    loadingMoreRef.current = false;
    try {
      const res = await searchArticles({
        q: kw,
        page: 1,
        page_size: PAGE_SIZE,
        sort: 'combined',
      });
      const rows = res.list || [];
      const total = res.total;
      setList(rows);
      const more = hasMorePages(rows.length, PAGE_SIZE, total, rows.length);
      setHasMore(more);
      hasMoreRef.current = more;
      await cacheSet(cacheKey, { list: rows });
    } catch {
      if (!hadCache) {
        setList([]);
      }
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const kw = qRef.current;
    try {
      const nextPage = pageRef.current + 1;
      const res = await searchArticles({
        q: kw,
        page: nextPage,
        page_size: PAGE_SIZE,
        sort: 'combined',
      });
      const rows = res.list || [];
      const total = res.total;
      setList((prev) => {
        const merged = mergeSearchItems(prev, rows);
        const more = hasMorePages(rows.length, PAGE_SIZE, total, merged.length);
        setHasMore(more);
        hasMoreRef.current = more;
        return merged;
      });
      if (rows.length > 0) {
        pageRef.current = nextPage;
      }
    } catch {
      /* keep list */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInitial('');
    }, [loadInitial]),
  );

  const onSubmit = () => loadInitial(q);

  const openCreateMenu = () => {
    Alert.alert('发布', undefined, [
      { text: '发帖', onPress: () => navigation.navigate('CreateDraft') },
      { text: '提问', onPress: () => navigation.navigate('CreateQuestion') },
      { text: '发布闲置', onPress: () => navigation.navigate('GoodCreate') },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const openItem = (item: SearchArticleItem) => {
    if (item.type === 2) {
      navigation.navigate('QuestionDetail', { id: item.id });
    } else if (item.type === 3) {
      navigation.navigate('AnswerDetail', { id: item.id });
    } else {
      navigation.navigate('PostDetail', { id: item.id });
    }
  };

  const fabBottom = tabBarHeight + 12;

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <LoadingMask visible={loading && list.length === 0} hint="正在加载发现…" />
        <View style={styles.top}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索帖子、提问、回答"
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={onSubmit}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={onSubmit} hitSlop={8}>
              <Text style={styles.searchBtn}>搜索</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            聚合搜索 · 支持筛选排序（与知乎、小红书类似的发现流）
          </Text>
        </View>

        <FlatList
          style={styles.flex}
          data={list}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadInitial();
              }}
              tintColor={colors.primary}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSp} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                {q ? '暂无结果，换个关键词试试' : '输入关键词并点击搜索'}
              </Text>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: fabBottom + 56 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => openItem(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.badge}>
                  {item.type === 2 ? '问' : item.type === 3 ? '答' : '帖'}
                </Text>
                <Text style={styles.author} numberOfLines={1}>
                  {item.author?.username || '用户'}
                </Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title || item.content?.slice(0, 80) || '(无标题)'}
              </Text>
              <Text style={styles.meta}>
                {item.like_count != null ? `赞 ${item.like_count}` : ''}
                {item.collect_count != null
                  ? ` · 藏 ${item.collect_count}`
                  : ''}
              </Text>
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom }]}
          activeOpacity={0.88}
          onPress={openCreateMenu}
          accessibilityLabel="发布">
          <Ionicons name="add" size={34} color="#fff" />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  top: { paddingHorizontal: space.md, paddingTop: space.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  searchBtn: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  hint: {
    marginTop: space.sm,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: space.md,
  },
  listContent: { paddingHorizontal: space.md, paddingBottom: 24 },
  footerSp: { marginVertical: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  author: { flex: 1, fontSize: 13, color: colors.textSecondary },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
