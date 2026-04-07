import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listQuestions } from '../api/article';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import {
  PAGE_SIZE,
  mergeById,
  hasMorePages,
} from '../utils/pagination';

const QUESTIONS_CACHE_KEY = 'community:questions:v1';

export default function QuestionListScreen({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const loadInitial = useCallback(async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{ list: any[] }>(QUESTIONS_CACHE_KEY);
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
    pageRef.current = 1;
    loadingMoreRef.current = false;
    try {
      const res = await listQuestions(1, PAGE_SIZE);
      const rows = res.list || [];
      const total = res.total;
      setList(rows);
      const more = hasMorePages(rows.length, PAGE_SIZE, total, rows.length);
      setHasMore(more);
      hasMoreRef.current = more;
      await cacheSet(QUESTIONS_CACHE_KEY, { list: rows });
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
    try {
      const nextPage = pageRef.current + 1;
      const res = await listQuestions(nextPage, PAGE_SIZE);
      const rows = res.list || [];
      const total = res.total;
      setList((prev) => {
        const merged = mergeById(prev, rows);
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
      loadInitial();
    }, [loadInitial]),
  );

  const fabBottom = tabBarHeight + 12;

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <LoadingMask visible={loading && list.length === 0} hint="正在加载问答…" />
        <FlatList
          style={styles.flex}
          data={list}
          keyExtractor={(item) => String(item.id)}
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
          contentContainerStyle={[styles.list, { paddingBottom: fabBottom + 56 }]}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSp} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>暂无提问，点击下方加号提问</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('QuestionDetail', { id: item.id })}>
              <Text style={styles.badge}>问</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title || item.content?.slice(0, 80)}
              </Text>
              <Text style={styles.cardMeta}>{item.author?.username}</Text>
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom }]}
          activeOpacity={0.88}
          onPress={() => navigation.navigate('CreateQuestion')}
          accessibilityLabel="提问">
          <Ionicons name="add" size={34} color="#fff" />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  list: { paddingHorizontal: space.md, paddingTop: space.sm },
  footerSp: { marginVertical: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardMeta: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
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
