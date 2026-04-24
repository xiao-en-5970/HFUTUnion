import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  listPosts,
  listAnswers,
  listQuestions,
  type ArticleRow,
  type AnswerRow,
  type PostFeedMode,
} from '../api/article';
import ArticleListTags from '../components/ArticleListTags';
import CreateFab from '../components/CreateFab';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import { useCommunityFeedMode } from '../context/CommunityFeedContext';
import {
  PAGE_SIZE,
  mergeById,
  hasMorePages,
} from '../utils/pagination';
import { markViewed, useViewedSet } from '../utils/viewedTracker';

type FeedRow =
  | { k: 'post'; item: ArticleRow }
  | { k: 'answer'; item: AnswerRow }
  | { k: 'question'; item: ArticleRow };

function rowTime(row: ArticleRow): number {
  const s = row.updated_at || row.created_at || '';
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function feedItem(row: FeedRow): ArticleRow {
  return row.item;
}

/** 与后端 AggregateSearch 默认权重一致：收藏 10、点赞 5、浏览 1 */
const POP_W_COLLECT = 10;
const POP_W_LIKE = 5;
const POP_W_VIEW = 1;

/**
 * 综合区对「0 回答求助」的加权策略（三个模式各自补偿一次）：
 * - latest：给 7 天的时间提前，让一周内的求助稳定出现在首屏
 * - hot：给一个等效 ~300 浏览 + 10 点赞的基础分，避免 0 互动沉底
 * - recommend：不走分数，走 interleave 槽位权重（见 COMBINED_SLOT_PATTERN）
 */
const LATEST_QUESTION_TIME_BOOST_MS = 7 * 24 * 60 * 60 * 1000;
const HOT_QUESTION_SCORE_FLOOR = 350; // ≈ 300 浏览 + 10 点赞

/**
 * 推荐模式综合区槽位：7 槽 = 3 帖 + 2 求助 + 2 回答 ≈ 43/29/29。
 * 关键设计：
 *   - 第 2 个卡片就是「求助」，首屏必有求助露出，避免被折叠线挡住
 *   - 帖子仍占最大比重（43%），保持综合区的「帖子为主」阅读感
 *   - 后端三路各自已按个性化排序返回，这里只负责类型交织，不再二次重排
 */
const COMBINED_SLOT_PATTERN: readonly ('post' | 'question' | 'answer')[] = [
  'post',
  'question',
  'post',
  'answer',
  'post',
  'question',
  'answer',
];

/** 仅当接口明确返回 answer_count===0 时进综合区，避免有回答仍显示「0 回答」 */
function filterZeroAnswerQuestions(list: ArticleRow[]): ArticleRow[] {
  return list.filter(
    (q) => typeof q.answer_count === 'number' && q.answer_count === 0,
  );
}

/**
 * latest 模式的"有效时间"：0 回答求助会被提前 7 天，以此与新帖竞争首屏位置。
 * combined 区内的 question 已经被 filterZeroAnswerQuestions 筛过一遍，
 * 所以这里无需再判 answer_count。
 */
function combinedSortTime(row: FeedRow): number {
  const t = rowTime(feedItem(row));
  if (row.k === 'question') {
    return t + LATEST_QUESTION_TIME_BOOST_MS;
  }
  return t;
}

function popScore(item: ArticleRow): number {
  const lc = Number(item.like_count) || 0;
  const cc = Number(item.collect_count) || 0;
  const vc = Number(item.view_count) || 0;
  return cc * POP_W_COLLECT + lc * POP_W_LIKE + vc * POP_W_VIEW;
}

/** 综合区合并排序：latest=时间降序（求助 +7 天加权）；hot=热度降序（求助额外基础分） */
function feedMergeSortKey(row: FeedRow, feedMode: PostFeedMode): number {
  if (feedMode === 'latest') {
    return combinedSortTime(row);
  }
  let s = popScore(feedItem(row));
  if (row.k === 'question') {
    s += HOT_QUESTION_SCORE_FLOOR;
  }
  return s;
}

/**
 * 推荐模式下，三路（post/answer/question）已各自按后端个性化排序返回；
 * 再用热度/时间重排会毁掉个性化。这里保留各路内部顺序，按 COMBINED_SLOT_PATTERN
 * 做权重交织：每 7 槽 ≈ 3 帖 + 2 求助 + 2 回答，且求助率先在第 2 个位置露出。
 */
function interleavePersonalizedCombined(
  posts: ArticleRow[],
  answers: AnswerRow[],
  questions: ArticleRow[],
): FeedRow[] {
  const out: FeedRow[] = [];
  let pi = 0;
  let ai = 0;
  let qi = 0;
  const total = posts.length + answers.length + questions.length;
  let turn = 0;
  while (out.length < total) {
    const want = COMBINED_SLOT_PATTERN[turn % COMBINED_SLOT_PATTERN.length];
    turn += 1;
    let picked = false;
    if (want === 'post' && pi < posts.length) {
      out.push({ k: 'post', item: posts[pi] });
      pi += 1;
      picked = true;
    } else if (want === 'question' && qi < questions.length) {
      out.push({ k: 'question', item: questions[qi] });
      qi += 1;
      picked = true;
    } else if (want === 'answer' && ai < answers.length) {
      out.push({ k: 'answer', item: answers[ai] });
      ai += 1;
      picked = true;
    }
    if (picked) {
      continue;
    }
    // 当前槽位对应类别已空：优先补帖子（维持综合区帖子为主），其次求助，最后回答
    if (pi < posts.length) {
      out.push({ k: 'post', item: posts[pi] });
      pi += 1;
    } else if (qi < questions.length) {
      out.push({ k: 'question', item: questions[qi] });
      qi += 1;
    } else if (ai < answers.length) {
      out.push({ k: 'answer', item: answers[ai] });
      ai += 1;
    }
  }
  return out;
}

function mergeFeedCombined(
  posts: ArticleRow[],
  answers: AnswerRow[],
  questions: ArticleRow[],
  feedMode: PostFeedMode,
): FeedRow[] {
  if (feedMode === 'recommend') {
    return interleavePersonalizedCombined(posts, answers, questions);
  }
  const rows: FeedRow[] = [
    ...posts.map((item) => ({ k: 'post' as const, item })),
    ...answers.map((item) => ({ k: 'answer' as const, item })),
    ...questions.map((item) => ({ k: 'question' as const, item })),
  ];
  rows.sort((a, b) => {
    const diff = feedMergeSortKey(b, feedMode) - feedMergeSortKey(a, feedMode);
    if (diff !== 0) {
      return diff;
    }
    return combinedSortTime(b) - combinedSortTime(a);
  });
  return rows;
}

function thumbUri(item: ArticleRow): string | undefined {
  const u = item.images?.[0];
  return typeof u === 'string' && u.length > 0 ? u : undefined;
}

function FeedThumb({ uri }: { uri?: string }) {
  if (!uri) {
    return <View style={styles.thumbPlaceholder} />;
  }
  return (
    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
  );
}

export default function CommunityFeedScreen({ navigation }: any) {
  const { feedMode, communityTab } = useCommunityFeedMode();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  /** 已看过的 ID 集合：点击卡片时打标，列表再次渲染即变灰字；三类内容各维护一份 */
  const viewedPosts = useViewedSet('post');
  const viewedQuestions = useViewedSet('question');
  const viewedAnswers = useViewedSet('answer');
  const [posts, setPosts] = useState<ArticleRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePost, setHasMorePost] = useState(true);
  const [hasMoreAnswer, setHasMoreAnswer] = useState(true);
  const [hasMoreQuestion, setHasMoreQuestion] = useState(true);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const postPageRef = useRef(1);
  const answerPageRef = useRef(1);
  const questionPageRef = useRef(1);
  /** 综合区：求助接口累计拉取条数（未过滤），用于 hasMore */
  const questionCumulativeRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMorePostRef = useRef(true);
  const hasMoreAnswerRef = useRef(true);
  const hasMoreQuestionRef = useRef(true);
  /**
   * 推荐模式下，后端会回显/生成 refresh_token；
   * 下拉刷新清空 → 获得新流；翻页复用同一 token → 顺序稳定、去重不撞页。
   * 三个 ref 分别对应三类内容，互不干扰。
   */
  const postTokenRef = useRef<string | undefined>(undefined);
  const answerTokenRef = useRef<string | undefined>(undefined);
  const questionTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    hasMorePostRef.current = hasMorePost;
  }, [hasMorePost]);
  useEffect(() => {
    hasMoreAnswerRef.current = hasMoreAnswer;
  }, [hasMoreAnswer]);
  useEffect(() => {
    hasMoreQuestionRef.current = hasMoreQuestion;
  }, [hasMoreQuestion]);

  const cacheKey = `community:feed:v9:${feedMode}:${communityTab}`;

  const displayRows = useMemo((): FeedRow[] => {
    switch (communityTab) {
      case 'combined':
        return mergeFeedCombined(posts, answers, questions, feedMode);
      case 'post':
        return posts.map((item) => ({ k: 'post' as const, item }));
      case 'help':
        return questions.map((item) => ({ k: 'question' as const, item }));
      case 'answer':
        return answers.map((item) => ({ k: 'answer' as const, item }));
      default:
        return [];
    }
  }, [communityTab, posts, answers, questions, feedMode]);

  const emptyHint = useMemo(() => {
    switch (communityTab) {
      case 'combined':
        return '暂无内容';
      case 'post':
        return '暂无帖子';
      case 'help':
        return '暂无求助';
      case 'answer':
        return '暂无回答';
      default:
        return '暂无内容';
    }
  }, [communityTab]);

  const loadInitial = useCallback(async () => {
    // 推荐模式每次刷新都应该是"新的个性化流"，不读也不写本地缓存；
    // 缓存只对 latest/hot（确定性排序）有意义。
    const useLocalCache = feedMode !== 'recommend';
    let hadCache = false;
    if (useLocalCache) {
      try {
        const cached = await cacheGet<{
          posts: ArticleRow[];
          answers: AnswerRow[];
          questions: ArticleRow[];
          /** 综合区求助列表接口累计拉取条数 */
          questionCumulativeRaw?: number;
        }>(cacheKey);
        if (
          cached?.posts?.length ||
          cached?.answers?.length ||
          cached?.questions?.length
        ) {
          hadCache = true;
          setPosts(cached.posts || []);
          setAnswers(cached.answers || []);
          setQuestions(cached.questions || []);
          questionCumulativeRef.current = cached.questionCumulativeRaw ?? 0;
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
    questionPageRef.current = 1;
    // 下拉刷新 / 首次加载：清空 token，让后端返回新 token 开启新一条推荐流
    postTokenRef.current = undefined;
    answerTokenRef.current = undefined;
    questionTokenRef.current = undefined;
    loadingMoreRef.current = false;

    const tab = communityTab;

    try {
      if (tab === 'combined') {
        const [postRes, answerRes, questionRes] = await Promise.allSettled([
          listPosts(1, PAGE_SIZE, { mode: feedMode }),
          listAnswers(1, PAGE_SIZE, { mode: feedMode }),
          listQuestions(1, PAGE_SIZE, { mode: feedMode }),
        ]);
        let pl: ArticleRow[] = [];
        let prTotal: number | undefined;
        if (postRes.status === 'fulfilled') {
          const pr = postRes.value;
          pl = pr.list ?? [];
          prTotal = pr.total;
          postTokenRef.current = pr.refresh_token;
        }
        let al: AnswerRow[] = [];
        let arTotal: number | undefined;
        if (answerRes.status === 'fulfilled') {
          const ar = answerRes.value;
          al = ar.list ?? [];
          arTotal = ar.total;
          answerTokenRef.current = ar.refresh_token;
        }
        let ql: ArticleRow[] = [];
        let qrTotal: number | undefined;
        let rawQLen = 0;
        if (questionRes.status === 'fulfilled') {
          const qr = questionRes.value;
          const raw = qr.list ?? [];
          rawQLen = raw.length;
          questionCumulativeRef.current = raw.length;
          ql = filterZeroAnswerQuestions(raw);
          qrTotal = qr.total;
          questionTokenRef.current = qr.refresh_token;
        }
        setPosts(pl);
        setAnswers(al);
        setQuestions(ql);
        const mp = hasMorePages(pl.length, PAGE_SIZE, prTotal, pl.length);
        const ma = hasMorePages(al.length, PAGE_SIZE, arTotal, al.length);
        const mq = hasMorePages(
          rawQLen,
          PAGE_SIZE,
          qrTotal,
          questionCumulativeRef.current,
        );
        setHasMorePost(mp);
        setHasMoreAnswer(ma);
        setHasMoreQuestion(mq);
        hasMorePostRef.current = mp;
        hasMoreAnswerRef.current = ma;
        hasMoreQuestionRef.current = mq;
        if (useLocalCache) {
          await cacheSet(cacheKey, {
            posts: pl,
            answers: al,
            questions: ql,
            questionCumulativeRaw: questionCumulativeRef.current,
          });
        }
      } else if (tab === 'post') {
        const pr = await listPosts(1, PAGE_SIZE, { mode: feedMode });
        const pl = pr.list ?? [];
        postTokenRef.current = pr.refresh_token;
        setPosts(pl);
        setAnswers([]);
        setQuestions([]);
        const mp = hasMorePages(pl.length, PAGE_SIZE, pr.total, pl.length);
        setHasMorePost(mp);
        setHasMoreAnswer(false);
        setHasMoreQuestion(false);
        hasMorePostRef.current = mp;
        hasMoreAnswerRef.current = false;
        hasMoreQuestionRef.current = false;
        if (useLocalCache) {
          await cacheSet(cacheKey, { posts: pl, answers: [], questions: [] });
        }
      } else if (tab === 'help') {
        const qr = await listQuestions(1, PAGE_SIZE, { mode: feedMode });
        const ql = qr.list ?? [];
        questionTokenRef.current = qr.refresh_token;
        setPosts([]);
        setAnswers([]);
        setQuestions(ql);
        const mq = hasMorePages(ql.length, PAGE_SIZE, qr.total, ql.length);
        setHasMorePost(false);
        setHasMoreAnswer(false);
        setHasMoreQuestion(mq);
        hasMorePostRef.current = false;
        hasMoreAnswerRef.current = false;
        hasMoreQuestionRef.current = mq;
        if (useLocalCache) {
          await cacheSet(cacheKey, { posts: [], answers: [], questions: ql });
        }
      } else {
        const ar = await listAnswers(1, PAGE_SIZE, { mode: feedMode });
        const al = ar.list ?? [];
        answerTokenRef.current = ar.refresh_token;
        setPosts([]);
        setAnswers(al);
        setQuestions([]);
        const ma = hasMorePages(al.length, PAGE_SIZE, ar.total, al.length);
        setHasMorePost(false);
        setHasMoreAnswer(ma);
        setHasMoreQuestion(false);
        hasMorePostRef.current = false;
        hasMoreAnswerRef.current = ma;
        hasMoreQuestionRef.current = false;
        if (useLocalCache) {
          await cacheSet(cacheKey, { posts: [], answers: al, questions: [] });
        }
      }
    } catch {
      if (!hadCache) {
        setPosts([]);
        setAnswers([]);
        setQuestions([]);
      }
      setHasMorePost(false);
      setHasMoreAnswer(false);
      setHasMoreQuestion(false);
      hasMorePostRef.current = false;
      hasMoreAnswerRef.current = false;
      hasMoreQuestionRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey, feedMode, communityTab]);

  const loadMore = useCallback(async () => {
    const tab = communityTab;
    if (loadingMoreRef.current) {
      return;
    }
    if (tab === 'combined') {
      if (
        !hasMorePostRef.current &&
        !hasMoreAnswerRef.current &&
        !hasMoreQuestionRef.current
      ) {
        return;
      }
    } else if (tab === 'post' && !hasMorePostRef.current) {
      return;
    } else if (tab === 'help' && !hasMoreQuestionRef.current) {
      return;
    } else if (tab === 'answer' && !hasMoreAnswerRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const tasks: Promise<void>[] = [];

      if (tab === 'combined') {
        if (hasMorePostRef.current) {
          const next = postPageRef.current + 1;
          tasks.push(
            (async () => {
              const pr = await listPosts(next, PAGE_SIZE, {
                mode: feedMode,
                refreshToken: postTokenRef.current,
              });
              if (pr.refresh_token) {
                postTokenRef.current = pr.refresh_token;
              }
              const rows = pr.list || [];
              setPosts((prev) => {
                const mergedPosts = mergeById(prev, rows);
                const more = hasMorePages(
                  rows.length,
                  PAGE_SIZE,
                  pr.total,
                  mergedPosts.length,
                );
                setHasMorePost(more);
                hasMorePostRef.current = more;
                return mergedPosts;
              });
              if (rows.length > 0) {
                postPageRef.current = next;
              }
            })(),
          );
        }
        if (hasMoreAnswerRef.current) {
          const nextA = answerPageRef.current + 1;
          tasks.push(
            (async () => {
              const ar = await listAnswers(nextA, PAGE_SIZE, {
                mode: feedMode,
                refreshToken: answerTokenRef.current,
              });
              if (ar.refresh_token) {
                answerTokenRef.current = ar.refresh_token;
              }
              const rows = ar.list || [];
              setAnswers((prev) => {
                const mergedAns = mergeById(prev, rows);
                const more = hasMorePages(
                  rows.length,
                  PAGE_SIZE,
                  ar.total,
                  mergedAns.length,
                );
                setHasMoreAnswer(more);
                hasMoreAnswerRef.current = more;
                return mergedAns;
              });
              if (rows.length > 0) {
                answerPageRef.current = nextA;
              }
            })(),
          );
        }
        if (hasMoreQuestionRef.current) {
          const nextQ = questionPageRef.current + 1;
          tasks.push(
            (async () => {
              const qr = await listQuestions(nextQ, PAGE_SIZE, {
                mode: feedMode,
                refreshToken: questionTokenRef.current,
              });
              if (qr.refresh_token) {
                questionTokenRef.current = qr.refresh_token;
              }
              const rows = qr.list || [];
              questionCumulativeRef.current += rows.length;
              setQuestions((prev) => {
                const filtered = filterZeroAnswerQuestions(rows);
                const mergedQ = mergeById(prev, filtered);
                const more = hasMorePages(
                  rows.length,
                  PAGE_SIZE,
                  qr.total,
                  questionCumulativeRef.current,
                );
                setHasMoreQuestion(more);
                hasMoreQuestionRef.current = more;
                return mergedQ;
              });
              if (rows.length > 0) {
                questionPageRef.current = nextQ;
              }
            })(),
          );
        }
      } else if (tab === 'post' && hasMorePostRef.current) {
        const next = postPageRef.current + 1;
        tasks.push(
          (async () => {
            const pr = await listPosts(next, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: postTokenRef.current,
            });
            if (pr.refresh_token) {
              postTokenRef.current = pr.refresh_token;
            }
            const rows = pr.list || [];
            setPosts((prev) => {
              const mergedPosts = mergeById(prev, rows);
              const more = hasMorePages(
                rows.length,
                PAGE_SIZE,
                pr.total,
                mergedPosts.length,
              );
              setHasMorePost(more);
              hasMorePostRef.current = more;
              return mergedPosts;
            });
            if (rows.length > 0) {
              postPageRef.current = next;
            }
          })(),
        );
      } else if (tab === 'help' && hasMoreQuestionRef.current) {
        const nextQ = questionPageRef.current + 1;
        tasks.push(
          (async () => {
            const qr = await listQuestions(nextQ, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: questionTokenRef.current,
            });
            if (qr.refresh_token) {
              questionTokenRef.current = qr.refresh_token;
            }
            const rows = qr.list || [];
            setQuestions((prev) => {
              const mergedQ = mergeById(prev, rows);
              const more = hasMorePages(
                rows.length,
                PAGE_SIZE,
                qr.total,
                mergedQ.length,
              );
              setHasMoreQuestion(more);
              hasMoreQuestionRef.current = more;
              return mergedQ;
            });
            if (rows.length > 0) {
              questionPageRef.current = nextQ;
            }
          })(),
        );
      } else if (tab === 'answer' && hasMoreAnswerRef.current) {
        const nextA = answerPageRef.current + 1;
        tasks.push(
          (async () => {
            const ar = await listAnswers(nextA, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: answerTokenRef.current,
            });
            if (ar.refresh_token) {
              answerTokenRef.current = ar.refresh_token;
            }
            const rows = ar.list || [];
            setAnswers((prev) => {
              const mergedAns = mergeById(prev, rows);
              const more = hasMorePages(
                rows.length,
                PAGE_SIZE,
                ar.total,
                mergedAns.length,
              );
              setHasMoreAnswer(more);
              hasMoreAnswerRef.current = more;
              return mergedAns;
            });
            if (rows.length > 0) {
              answerPageRef.current = nextA;
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
  }, [feedMode, communityTab]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
    }, [loadInitial]),
  );

  const fabBottom = tabBarHeight + 12;
  const sheetBottom = insets.bottom;

  const renderItem = ({ item: row }: { item: FeedRow }) => {
    if (row.k === 'post') {
      const item = row.item;
      // 本地 Set（当前设备已看） || 后端 is_viewed（跨设备已看）——任一命中即灰字
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

    if (row.k === 'question') {
      const item = row.item;
      const title = item.title?.trim() || item.content?.slice(0, 40) || '求助';
      const viewed = viewedQuestions.has(item.id) || !!item.is_viewed;
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => {
            markViewed('question', item.id);
            navigation.navigate('QuestionDetail', { id: item.id });
          }}>
          <View style={styles.cardRow}>
            <FeedThumb uri={thumbUri(item)} />
            <View style={styles.cardBody}>
              <ArticleListTags kind="question" schoolId={item.school_id} compact />
              <Text
                style={[styles.qTitle, viewed && styles.viewedText]}
                numberOfLines={2}>
                {title}
              </Text>
              <Text
                style={[styles.preview, viewed && styles.viewedSubText]}
                numberOfLines={4}>
                {item.content?.trim() || '（无正文）'}
              </Text>
              <Text style={[styles.cardMeta, viewed && styles.viewedSubText]}>
                {item.author?.username ?? '用户'} · 求助 ·{' '}
                {item.answer_count ?? 0} 回答
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
              {item.author?.username ?? '用户'} · 回答
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
          visible={loading && displayRows.length === 0}
          hint="正在加载社区…"
        />
        <FlatList
          style={styles.flex}
          data={displayRows}
          keyExtractor={(row) =>
            row.k === 'post'
              ? `p-${row.item.id}`
              : row.k === 'question'
                ? `q-${row.item.id}`
                : `a-${row.item.id}`
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
            <Text style={styles.empty}>{emptyHint}</Text>
          }
          renderItem={renderItem}
        />

        <CreateFab
          onPress={() => setCreateSheetOpen(true)}
          accessibilityLabel="发布"
        />

        <Modal
          visible={createSheetOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setCreateSheetOpen(false)}>
          <View style={styles.sheetWrap}>
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setCreateSheetOpen(false)}
            />
            <View style={[styles.sheetCard, { paddingBottom: sheetBottom + 16 }]}>
              <View style={styles.sheetGrabber} />
              <Text style={styles.sheetTitle}>发布内容</Text>
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setCreateSheetOpen(false);
                  navigation.navigate('CreateDraft');
                }}
                activeOpacity={0.85}>
                <Text style={styles.sheetRowText}>创建帖子</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setCreateSheetOpen(false);
                  navigation.navigate('CreateQuestion');
                }}
                activeOpacity={0.85}>
                <Text style={styles.sheetRowText}>发布求助</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setCreateSheetOpen(false)}
                activeOpacity={0.85}>
                <Text style={styles.sheetCancelText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
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
  /** 已看过：主标题 / 副标题降级为中灰；与未看过区分明显但仍可读 */
  viewedText: { color: colors.textMuted, fontWeight: '500' },
  viewedSubText: { color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  sheetRow: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 17, color: colors.text, textAlign: 'center' },
  sheetCancel: { paddingVertical: 16, marginTop: 4 },
  sheetCancelText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
  },
});
