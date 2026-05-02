import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  listPosts,
  listAnswers,
  type ArticleRow,
  type AnswerRow,
} from '../api/article';
import ArticleListTags from '../components/ArticleListTags';
import CreateFab from '../components/CreateFab';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import { useCommunityFeedMode } from '../context/CommunityFeedContext';
import { PAGE_SIZE, mergeById, hasMorePages } from '../utils/pagination';
import { markViewed, useViewedSet } from '../utils/viewedTracker';

type FeedRow =
  | { k: 'post'; item: ArticleRow }
  | { k: 'answer'; item: AnswerRow };

/**
 * 1:1 交织：尽量让两类内容轮流露出，保证滚动过程中帖子和回答都能被看到。
 * 两侧顺序在各自接口侧已排好（按 feedMode），这里只管穿插。
 */
function interleave(posts: ArticleRow[], answers: AnswerRow[]): FeedRow[] {
  const out: FeedRow[] = [];
  const n = Math.max(posts.length, answers.length);
  for (let i = 0; i < n; i++) {
    if (i < posts.length) {
      out.push({ k: 'post', item: posts[i] });
    }
    if (i < answers.length) {
      out.push({ k: 'answer', item: answers[i] });
    }
  }
  return out;
}

function thumbUri(item: ArticleRow): string | undefined {
  const u = item.images?.[0];
  return typeof u === 'string' && u.length > 0 ? u : undefined;
}

function FeedThumb({ uri }: { uri?: string }) {
  if (!uri) {
    return <View style={styles.thumbPlaceholder} />;
  }
  return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />;
}

export default function CommunityFeedScreen({ navigation }: any) {
  const { feedMode } = useCommunityFeedMode();
  const tabBarHeight = useBottomTabBarHeight();
  /** 已看过的 ID 集合：点击卡片时打标，列表再次渲染即变灰字 */
  const viewedPosts = useViewedSet('post');
  const viewedAnswers = useViewedSet('answer');

  const [posts, setPosts] = useState<ArticleRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const postPageRef = useRef(1);
  const answerPageRef = useRef(1);
  /** 推荐模式：后端会回显 refresh_token；翻页复用同一 token，保持顺序稳定 */
  const postTokenRef = useRef<string | undefined>(undefined);
  const answerTokenRef = useRef<string | undefined>(undefined);
  const hasMorePostRef = useRef(true);
  const hasMoreAnswerRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const cacheKey = `community:feed:v10:${feedMode}`;

  useEffect(() => {
    // feedMode 切换时让 token 走最新值；load 里会重置
    postTokenRef.current = undefined;
    answerTokenRef.current = undefined;
  }, [feedMode]);

  const loadInitial = useCallback(async () => {
    const useLocalCache = feedMode !== 'recommend';
    let hadCache = false;
    if (useLocalCache) {
      try {
        const cached = await cacheGet<{
          posts: ArticleRow[];
          answers: AnswerRow[];
        }>(cacheKey);
        if (cached?.posts?.length || cached?.answers?.length) {
          hadCache = true;
          setPosts(cached.posts || []);
          setAnswers(cached.answers || []);
          setLoading(false);
        }
      } catch {
        /* noop */
      }
    }
    if (!hadCache) {
      setLoading(true);
    }
    postPageRef.current = 1;
    answerPageRef.current = 1;
    postTokenRef.current = undefined;
    answerTokenRef.current = undefined;
    hasMorePostRef.current = true;
    hasMoreAnswerRef.current = true;
    loadingMoreRef.current = false;

    try {
      const [pRes, aRes] = await Promise.all([
        listPosts(1, PAGE_SIZE, { mode: feedMode }),
        listAnswers(1, PAGE_SIZE, { mode: feedMode }),
      ]);
      const pl = pRes.list ?? [];
      const al = aRes.list ?? [];
      postTokenRef.current = pRes.refresh_token;
      answerTokenRef.current = aRes.refresh_token;
      setPosts(pl);
      setAnswers(al);
      hasMorePostRef.current = hasMorePages(pl.length, PAGE_SIZE, pRes.total, pl.length);
      hasMoreAnswerRef.current = hasMorePages(al.length, PAGE_SIZE, aRes.total, al.length);
      if (useLocalCache) {
        await cacheSet(cacheKey, { posts: pl, answers: al });
      }
    } catch {
      if (!hadCache) {
        setPosts([]);
        setAnswers([]);
      }
      hasMorePostRef.current = false;
      hasMoreAnswerRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey, feedMode]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) {
      return;
    }
    if (!hasMorePostRef.current && !hasMoreAnswerRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const tasks: Promise<void>[] = [];
      if (hasMorePostRef.current) {
        const next = postPageRef.current + 1;
        tasks.push(
          (async () => {
            const r = await listPosts(next, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: postTokenRef.current,
            });
            if (r.refresh_token) {
              postTokenRef.current = r.refresh_token;
            }
            const rows = r.list ?? [];
            setPosts((prev) => {
              const merged = mergeById(prev, rows);
              hasMorePostRef.current = hasMorePages(
                rows.length,
                PAGE_SIZE,
                r.total,
                merged.length,
              );
              return merged;
            });
            if (rows.length > 0) {
              postPageRef.current = next;
            }
          })(),
        );
      }
      if (hasMoreAnswerRef.current) {
        const next = answerPageRef.current + 1;
        tasks.push(
          (async () => {
            const r = await listAnswers(next, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: answerTokenRef.current,
            });
            if (r.refresh_token) {
              answerTokenRef.current = r.refresh_token;
            }
            const rows = r.list ?? [];
            setAnswers((prev) => {
              const merged = mergeById(prev, rows);
              hasMoreAnswerRef.current = hasMorePages(
                rows.length,
                PAGE_SIZE,
                r.total,
                merged.length,
              );
              return merged;
            });
            if (rows.length > 0) {
              answerPageRef.current = next;
            }
          })(),
        );
      }
      await Promise.all(tasks);
    } catch {
      /* keep */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedMode]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
    }, [loadInitial]),
  );

  const rows = interleave(posts, answers);
  const fabBottom = tabBarHeight + 12;

  const renderItem = ({ item: row }: { item: FeedRow }) => {
    if (row.k === 'post') {
      const item = row.item;
      const viewed = viewedPosts.has(item.id) || !!item.is_viewed;
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => {
            markViewed('post', item.id);
            navigation.navigate('PostDetail', { id: item.id });
          }}>
          <View style={styles.cardRow}>
            <FeedThumb uri={thumbUri(item)} />
            <View style={styles.cardBody}>
              <ArticleListTags kind="post" schoolId={item.school_id} compact />
              <Text
                style={[styles.cardTitle, viewed && styles.viewedText]}
                numberOfLines={2}>
                {item.title || item.content?.slice(0, 60)}
              </Text>
              {item.content?.trim() ? (
                <Text
                  style={[styles.preview, viewed && styles.viewedSubText]}
                  numberOfLines={3}>
                  {item.content.trim()}
                </Text>
              ) : null}
              <Text style={[styles.cardMeta, viewed && styles.viewedSubText]}>
                {item.author?.username} · {item.like_count ?? 0} 赞
                {item.view_count != null ? ` · ${item.view_count} 浏览` : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const item = row.item;
    const qTitle = item.parent_question?.title?.trim() || '求助';
    const viewed = viewedAnswers.has(item.id) || !!item.is_viewed;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          markViewed('answer', item.id);
          navigation.navigate('AnswerDetail', { id: item.id });
        }}>
        <View style={styles.cardRow}>
          <FeedThumb uri={thumbUri(item)} />
          <View style={styles.cardBody}>
            <ArticleListTags
              kind="answer"
              schoolId={item.school_id ?? item.parent_question?.school_id}
              compact
            />
            <Text
              style={[styles.qTitle, viewed && styles.viewedText]}
              numberOfLines={2}>
              {qTitle}
            </Text>
            <Text
              style={[styles.preview, viewed && styles.viewedSubText]}
              numberOfLines={4}>
              {item.content?.trim() || '（无正文）'}
            </Text>
            <Text style={[styles.cardMeta, viewed && styles.viewedSubText]}>
              {item.author?.username ?? '用户'} · {item.like_count ?? 0} 赞
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <LoadingMask
          visible={loading && rows.length === 0}
          hint="正在加载社区…"
        />
        <FlatList
          style={styles.flex}
          data={rows}
          keyExtractor={(row) =>
            row.k === 'post' ? `p-${row.item.id}` : `a-${row.item.id}`
          }
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
          contentContainerStyle={[
            styles.list,
            { paddingBottom: fabBottom + 56 },
          ]}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSp} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>暂无内容</Text> : null
          }
          renderItem={renderItem}
        />

        <CreateFab
          onPress={() => navigation.navigate('CreateDraft')}
          accessibilityLabel="发帖"
        />
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
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  thumbPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  qTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cardMeta: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  viewedText: { color: colors.textMuted, fontWeight: '500' },
  viewedSubText: { color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
