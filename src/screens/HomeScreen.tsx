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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { searchArticles, SearchArticleItem } from '../api/search';
import ArticleListTags from '../components/ArticleListTags';
import CreateFab from '../components/CreateFab';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import {
  PAGE_SIZE,
  mergeSearchItems,
  hasMorePages,
} from '../utils/pagination';

const HOME_SEARCH_CACHE_PREFIX = 'home:search:v2';

type HomeSearchSort = 'combined' | 'latest';

export default function HomeScreen({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const [q, setQ] = useState('');
  /** 未搜索前为落地页（仅搜索框）；搜索后为结果页（顶栏 + 列表） */
  const [hasSearched, setHasSearched] = useState(false);
  /** 推荐=相关度+热度加权；最新=按发布时间 */
  const [sortMode, setSortMode] = useState<HomeSearchSort>('combined');
  const [list, setList] = useState<SearchArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  /** 服务端总命中条数（用于底部「已加载全部」提示） */
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const qRef = useRef('');
  const sortModeRef = useRef<HomeSearchSort>('combined');

  useEffect(() => {
    qRef.current = q;
  }, [q]);

  useEffect(() => {
    sortModeRef.current = sortMode;
  }, [sortMode]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const cacheKeyFor = (kw: string, sort: HomeSearchSort) =>
    `${HOME_SEARCH_CACHE_PREFIX}:${sort}:${kw || '__empty__'}`;

  const loadInitial = useCallback(async (keyword?: string, sort?: HomeSearchSort) => {
    const kw = keyword !== undefined ? keyword : qRef.current;
    const s = sort ?? sortModeRef.current;
    const cacheKey = cacheKeyFor(kw, s);
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
    hasMoreRef.current = false;
    try {
      const res = await searchArticles({
        q: kw,
        page: 1,
        page_size: PAGE_SIZE,
        sort: s,
      });
      const rows = res.list || [];
      const total =
        res.total != null && !Number.isNaN(Number(res.total))
          ? Number(res.total)
          : undefined;
      setTotalCount(total);
      setList(rows);
      const more = hasMorePages(rows.length, PAGE_SIZE, total, rows.length);
      setHasMore(more);
      hasMoreRef.current = more;
      await cacheSet(cacheKey, { list: rows });
    } catch {
      if (!hadCache) {
        setList([]);
      }
      setTotalCount(undefined);
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasSearched) {
      return;
    }
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const kw = qRef.current;
    const sort = sortModeRef.current;
    try {
      const nextPage = pageRef.current + 1;
      const res = await searchArticles({
        q: kw,
        page: nextPage,
        page_size: PAGE_SIZE,
        sort,
      });
      const rows = res.list || [];
      const total =
        res.total != null && !Number.isNaN(Number(res.total))
          ? Number(res.total)
          : undefined;
      if (total !== undefined) {
        setTotalCount(total);
      }
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
  }, [hasSearched]);

  const runSearch = useCallback(() => {
    setHasSearched(true);
    loadInitial(q, sortModeRef.current);
  }, [q, loadInitial]);

  const onChangeSort = useCallback(
    (next: HomeSearchSort) => {
      if (next === sortMode) {
        return;
      }
      setSortMode(next);
      sortModeRef.current = next;
      if (hasSearched) {
        loadInitial(qRef.current, next);
      }
    },
    [hasSearched, loadInitial, sortMode],
  );

  const openCreateMenu = () => {
    Alert.alert('发布', undefined, [
      { text: '发帖', onPress: () => navigation.navigate('CreateDraft') },
      { text: '求助', onPress: () => navigation.navigate('CreateQuestion') },
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

  const searchBoxInner = (
    <>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder="搜索帖子、求助、回答"
        placeholderTextColor={colors.textMuted}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={runSearch}
        returnKeyType="search"
      />
      <TouchableOpacity onPress={runSearch} hitSlop={8}>
        <Text style={styles.searchBtn}>搜索</Text>
      </TouchableOpacity>
    </>
  );

  if (!hasSearched) {
    return (
      <Screen scroll={false}>
        <View style={styles.landingWrap}>
          <View style={styles.landingCenter}>
            <Text style={styles.landingTitle}>发现</Text>
            <Text style={styles.landingSub}>搜索校园里的帖子、求助与回答</Text>
            <View style={styles.searchBoxLanding}>{searchBoxInner}</View>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <LoadingMask visible={loading && list.length === 0} hint="正在搜索…" />
        <View style={styles.topBar}>
          <View style={styles.searchBox}>{searchBoxInner}</View>
          <View style={styles.sortRow}>
            <TouchableOpacity
              style={[styles.sortChip, sortMode === 'combined' && styles.sortChipOn]}
              onPress={() => onChangeSort('combined')}
              activeOpacity={0.75}>
              <Text
                style={[styles.sortChipText, sortMode === 'combined' && styles.sortChipTextOn]}>
                推荐
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortChip, sortMode === 'latest' && styles.sortChipOn]}
              onPress={() => onChangeSort('latest')}
              activeOpacity={0.75}>
              <Text
                style={[styles.sortChipText, sortMode === 'latest' && styles.sortChipTextOn]}>
                最新
              </Text>
            </TouchableOpacity>
          </View>
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
          onEndReachedThreshold={0.15}
          ListFooterComponent={
            list.length === 0 ? null : (
              <View style={styles.footerBox}>
                {loadingMore ? (
                  <ActivityIndicator style={styles.footerSp} color={colors.primary} />
                ) : hasMore ? (
                  <Text style={styles.footerHint}>上拉加载更多</Text>
                ) : (
                  <Text style={styles.footerHint}>
                    {totalCount != null
                      ? `已加载全部 · 共 ${totalCount} 条`
                      : '已加载全部'}
                  </Text>
                )}
              </View>
            )
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                {q.trim() ? '暂无结果，换个关键词试试' : '暂无内容'}
              </Text>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: fabBottom + 56 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => openItem(item)}>
              <ArticleListTags
                articleType={item.type}
                schoolId={item.school_id}
                compact
              />
              <View style={styles.cardTop}>
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

        <CreateFab onPress={openCreateMenu} accessibilityLabel="发布" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  landingWrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  landingCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: 80,
  },
  landingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  landingSub: {
    marginTop: space.sm,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: space.lg,
  },
  searchBoxLanding: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrap: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  topBar: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipOn: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortChipTextOn: {
    color: colors.primary,
  },
  searchInput: {
    flex: 1,
    marginLeft: space.sm,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  searchBtn: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  listContent: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: 24 },
  footerSp: { marginVertical: 16 },
  footerBox: { paddingVertical: 20, alignItems: 'center' },
  footerHint: { fontSize: 13, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  author: { flex: 1, fontSize: 13, color: colors.textSecondary },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
    fontSize: 14,
  },
});
