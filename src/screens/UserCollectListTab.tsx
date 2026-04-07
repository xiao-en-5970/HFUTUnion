import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { NavigationProp } from '@react-navigation/native';
import type { ArticleRow } from '../api/article';
import type { GoodRow } from '../api/goods';
import {
  listUserCollects,
  EXT_TYPE_POST,
  EXT_TYPE_QUESTION,
  EXT_TYPE_ANSWER,
  EXT_TYPE_GOODS,
} from '../api/social';
import ArticleListTags from '../components/ArticleListTags';
import { colors, radius, space } from '../theme/colors';
import {
  PAGE_SIZE,
  hasMorePages,
  mergeById,
} from '../utils/pagination';
import type { RootStackParamList } from '../navigation/RootStack';

export type CollectVariant = 'post' | 'question' | 'answer' | 'good';

type Props = {
  variant: CollectVariant;
  stackNavigation: NavigationProp<RootStackParamList>;
};

function extTypeFor(v: CollectVariant): number {
  switch (v) {
    case 'post':
      return EXT_TYPE_POST;
    case 'question':
      return EXT_TYPE_QUESTION;
    case 'answer':
      return EXT_TYPE_ANSWER;
    case 'good':
      return EXT_TYPE_GOODS;
    default:
      return EXT_TYPE_POST;
  }
}

function formatTime(iso?: string) {
  if (!iso) {
    return '';
  }
  return iso.slice(0, 16).replace('T', ' ');
}

export default function UserCollectListTab({
  variant,
  stackNavigation,
}: Props) {
  const [rows, setRows] = useState<(ArticleRow | GoodRow)[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [_hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const extType = extTypeFor(variant);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const res = await listUserCollects(extType, page, PAGE_SIZE);
      const list = (res.list || []) as (ArticleRow | GoodRow)[];
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
    [extType],
  );

  const loadInitial = useCallback(async () => {
    try {
      setLoadError(null);
      pageRef.current = 1;
      await fetchPage(1, false);
    } catch (e: any) {
      setRows([]);
      setHasMore(false);
      hasMoreRef.current = false;
      setLoadError(
        e?.message ??
          '无法加载收藏（需后端 GET /user/collects?ext_type=&page=&page_size=）',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) {
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

  const openArticle = (item: ArticleRow) => {
    if (variant === 'post') {
      stackNavigation.navigate('PostDetail', { id: item.id });
    } else if (variant === 'question') {
      stackNavigation.navigate('QuestionDetail', { id: item.id });
    } else {
      stackNavigation.navigate('AnswerDetail', { id: item.id });
    }
  };

  const openGood = (item: GoodRow) => {
    stackNavigation.navigate('GoodDetail', { id: item.id });
  };

  const renderArticle = (item: ArticleRow) => {
    const listKind =
      variant === 'post'
        ? ('post' as const)
        : variant === 'question'
          ? ('question' as const)
          : ('answer' as const);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openArticle(item)}
        activeOpacity={0.88}>
        <ArticleListTags kind={listKind} schoolId={item.school_id} compact />
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title?.trim() ||
            (variant === 'answer' ? item.content?.slice(0, 80) : '无标题')}
        </Text>
        <Text style={styles.meta}>{formatTime(item.created_at)}</Text>
        <View style={styles.stats}>
          <Text style={styles.statText}>赞 {item.like_count ?? 0}</Text>
          <Text style={styles.statDot}>·</Text>
          <Text style={styles.statText}>收藏 {item.collect_count ?? 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGood = (item: GoodRow) => {
    const img = item.images?.[0];
    return (
      <TouchableOpacity
        style={styles.goodCard}
        onPress={() => openGood(item)}
        activeOpacity={0.88}>
        {img ? (
          <Image source={{ uri: img }} style={styles.goodImg} resizeMode="cover" />
        ) : (
          <View style={[styles.goodImg, styles.goodImgPh]}>
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.goodBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.goodPrice}>
            ¥{((item.price ?? 0) / 100).toFixed((item.price ?? 0) % 100 === 0 ? 0 : 2)}
          </Text>
          <Text style={styles.meta}>{formatTime(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: ArticleRow | GoodRow }) =>
    variant === 'good'
      ? renderGood(item as GoodRow)
      : renderArticle(item as ArticleRow);

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
        <Text style={styles.empty}>
          {loadError ?? '暂无收藏'}
        </Text>
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
    marginTop: 6,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  statText: { fontSize: 12, color: colors.textSecondary },
  statDot: { fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  goodCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: space.md,
    gap: 12,
  },
  goodImg: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  goodImgPh: { alignItems: 'center', justifyContent: 'center' },
  goodBody: { flex: 1, minWidth: 0 },
  goodPrice: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '700',
    color: colors.accent,
  },
});
