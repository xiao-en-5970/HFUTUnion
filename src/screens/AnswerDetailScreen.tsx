import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAnswer,
  loadAllQuestionAnswers,
  type AnswerRow,
  type ArticleRow,
  type ParentQuestionBrief,
} from '../api/article';
import {
  likeAdd,
  likeRemove,
  collectAdd,
  collectRemove,
  listComments,
} from '../api/social';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import AnswerCommentsPanel from '../components/AnswerCommentsPanel';
import { colors, radius, space } from '../theme/colors';
import { markViewed } from '../utils/viewedTracker';

const EXT_A = 3;

/** 点赞态：红底（与爱心图标一致） */
const LIKE_RED = '#E11D48';
/** 收藏态：琥珀黄 */
const COLLECT_AMBER = '#F59E0B';

function normalizeFlag(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') return true;
  return false;
}

function formatStatCount(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n)) || n < 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function normalizeAnswerFlags(a: AnswerRow): AnswerRow {
  return {
    ...a,
    is_liked: normalizeFlag(a.is_liked ?? a.liked),
    is_collected: normalizeFlag(a.is_collected ?? a.collected),
  };
}

function mergeAnswerRowFromApi(row: AnswerRow, prev: AnswerRow): AnswerRow {
  return normalizeAnswerFlags({
    ...prev,
    ...row,
    like_count: row.like_count ?? prev.like_count,
    collect_count: row.collect_count ?? prev.collect_count,
    comment_count: row.comment_count ?? prev.comment_count,
    view_count: row.view_count ?? prev.view_count,
  });
}

function mergeDetailIntoList(list: ArticleRow[], detail: AnswerRow): AnswerRow[] {
  const idx = list.findIndex((x) => x.id === detail.id);
  const base = list.map((x) => ({ ...x } as AnswerRow));
  if (idx === -1) {
    return [...base, normalizeAnswerFlags(detail)].map(normalizeAnswerFlags);
  }
  // 详情接口含 is_liked / is_collected 时覆盖列表中的缺省或旧值
  base[idx] = normalizeAnswerFlags({ ...base[idx], ...detail });
  return base.map(normalizeAnswerFlags);
}

type SlideProps = {
  answer: AnswerRow;
  active: boolean;
  commentsOpen: boolean;
  questionTitle: string;
  questionContent: string;
  questionNeedsExpand: boolean;
  isLast: boolean;
};

function AnswerSlide({
  answer,
  active,
  commentsOpen,
  questionTitle,
  questionContent,
  questionNeedsExpand,
  isLast,
}: SlideProps) {
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      setNearBottom(false);
    }
  }, [active]);

  useEffect(() => {
    const show = active && nearBottom && !commentsOpen;
    Animated.timing(hintOpacity, {
      toValue: show ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [active, nearBottom, commentsOpen, hintOpacity]);

  const onScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      layoutMeasurement: { height: number };
      contentSize: { height: number };
    };
  }) => {
    if (!active) {
      return;
    }
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentSize.height <= 0 || layoutMeasurement.height <= 0) {
      return;
    }
    const threshold = 28;
    const maxY = Math.max(0, contentSize.height - layoutMeasurement.height);
    /** 已在底部附近 */
    const atBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - threshold;
    /**
     * 底部继续下拉时的橡皮筋（iOS）；过渡中 contentOffset.y 会略大于 maxY，
     * 用于在最后一条回答时显示「没有更多回答了」。
     */
    const overscrollPastBottom = contentOffset.y > maxY + 0.5;
    setNearBottom(atBottom || overscrollPastBottom);
  };

  return (
    <View style={slideStyles.page}>
      <ScrollView
        style={slideStyles.flex}
        contentContainerStyle={slideStyles.scrollContent}
        nestedScrollEnabled
        directionalLockEnabled={Platform.OS === 'ios'}
        bounces
        alwaysBounceVertical
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={onScroll}>
        {questionTitle ? (
          <Text style={slideStyles.title}>{questionTitle}</Text>
        ) : null}

        {questionContent ? (
          <View style={slideStyles.qBlock}>
            <Text
              style={slideStyles.qBody}
              numberOfLines={
                questionNeedsExpand && !questionExpanded ? 4 : undefined
              }>
              {questionContent}
            </Text>
            {questionNeedsExpand ? (
              <TouchableOpacity
                onPress={() => setQuestionExpanded((v) => !v)}
                hitSlop={8}
                activeOpacity={0.7}>
                <Text style={slideStyles.qToggle}>
                  {questionExpanded ? '收起求助' : '展开求助全文'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <Text style={slideStyles.meta}>
          {answer.author?.username ?? '用户'} · {answer.like_count ?? 0} 赞 ·{' '}
          {answer.collect_count ?? 0} 藏 · {answer.comment_count ?? 0} 评
          {answer.view_count != null ? ` · ${answer.view_count} 浏览` : ''}
        </Text>

        <Text style={slideStyles.body}>{answer.content}</Text>
        {answer.images?.length ? (
          <View style={slideStyles.images}>
            {answer.images.map((u: string, i: number) => (
              <Image
                key={i}
                source={{ uri: u }}
                style={slideStyles.img}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : null}

        <View style={slideStyles.bottomSpacer} />
      </ScrollView>

      <Animated.View
        style={[slideStyles.hintWrap, { opacity: hintOpacity }]}
        pointerEvents="none">
        <Text style={slideStyles.hintText}>
          {isLast ? '没有更多回答了' : '继续上滑 · 查看下一个回答'}
        </Text>
      </Animated.View>
    </View>
  );
}

const slideStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: 140,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  qBlock: {
    marginTop: 10,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  qBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  qToggle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  meta: { marginTop: 12, fontSize: 13, color: colors.textSecondary },
  body: { marginTop: 16, fontSize: 16, lineHeight: 24, color: colors.text },
  images: { marginTop: 12, gap: 8 },
  img: { width: '100%', height: 200, borderRadius: radius.sm, marginBottom: 8 },
  bottomSpacer: { height: 24 },
  hintWrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: 24,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15, 118, 110, 0.92)',
  },
  hintText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
});

export default function AnswerDetailScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const id = Number(route.params?.id);
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView | null>(null);

  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [qBrief, setQBrief] = useState<ParentQuestionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialIndex, setInitialIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const qTitle = qBrief?.title?.trim() || '';
  const qContent = qBrief?.content?.trim() ?? '';
  const questionNeedsExpand = useMemo(() => {
    if (!qContent) {
      return false;
    }
    const lines = qContent.split('\n').length;
    return qContent.length > 160 || lines > 4;
  }, [qContent]);

  const currentAnswerId = answers[currentIndex]?.id;
  const currentAnswer = answers[currentIndex];
  const liked = normalizeFlag(currentAnswer?.is_liked ?? currentAnswer?.liked);
  const collected = normalizeFlag(
    currentAnswer?.is_collected ?? currentAnswer?.collected,
  );
  const likeCount = currentAnswer?.like_count ?? 0;
  const collectCount = currentAnswer?.collect_count ?? 0;
  const commentCount = currentAnswer?.comment_count ?? 0;

  const answersRef = useRef(answers);
  answersRef.current = answers;

  useLayoutEffect(() => {
    const t = qTitle || '回答';
    navigation.setOptions({
      title: t.length > 20 ? `${t.slice(0, 20)}…` : t,
    });
  }, [navigation, qTitle]);

  // 切换到任一回答时即打标；用户在本页纵滑阅读多条，逐一记录才准确
  useEffect(() => {
    if (currentAnswerId && Number.isFinite(currentAnswerId) && currentAnswerId > 0) {
      markViewed('answer', currentAnswerId);
    }
  }, [currentAnswerId]);

  useEffect(() => {
    let cancelled = false;
    setAnswers([]);
    setQBrief(null);
    setCommentsOpen(false);
    setLoading(true);

    (async () => {
      try {
        const first = await getAnswer(id);
        if (cancelled) {
          return;
        }
        const qid = first.parent_question?.id;
        if (!qid) {
          setAnswers([normalizeAnswerFlags(first)]);
          setQBrief(first.parent_question ?? null);
          setInitialIndex(0);
          setCurrentIndex(0);
          return;
        }
        setQBrief(first.parent_question ?? null);
        const list = await loadAllQuestionAnswers(qid);
        if (cancelled) {
          return;
        }
        const merged = mergeDetailIntoList(list, first);
        const idx = merged.findIndex((a) => a.id === id);
        const i = Math.max(0, idx);
        setAnswers(merged);
        setInitialIndex(i);
        setCurrentIndex(i);
      } catch (e: any) {
        if (!cancelled) {
          Alert.alert('加载失败', e?.message ?? '');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /** 切换页时同步当前条目的点赞/收藏/评论数（接口可能用 0/1 表示布尔） */
  useEffect(() => {
    const idx = currentIndex;
    const aid = answersRef.current[idx]?.id;
    if (aid == null) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await getAnswer(aid);
        if (cancelled || answersRef.current[idx]?.id !== aid) {
          return;
        }
        let commentTotal = row.comment_count;
        if (commentTotal == null) {
          try {
            const c = await listComments(EXT_A, aid, 1, 1);
            commentTotal = c.total;
          } catch {
            /* keep */
          }
        }
        setAnswers((prev) =>
          prev.map((a) =>
            a.id === aid
              ? mergeAnswerRowFromApi(
                  {
                    ...row,
                    comment_count: commentTotal ?? row.comment_count,
                  } as AnswerRow,
                  a,
                )
              : a,
          ),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, currentAnswerId]);

  const toggleLike = async () => {
    if (currentAnswerId == null) {
      return;
    }
    const aid = currentAnswerId;
    const cur = answers.find((a) => a.id === aid);
    if (!cur) {
      return;
    }
    const was = normalizeFlag(cur.is_liked ?? cur.liked);
    const snapshot = { ...cur };
    const nextLiked = !was;
    setAnswers((prev) =>
      prev.map((a) =>
        a.id === aid
          ? {
              ...a,
              is_liked: nextLiked,
              liked: undefined,
              like_count: Math.max(0, (a.like_count ?? 0) + (nextLiked ? 1 : -1)),
            }
          : a,
      ),
    );
    try {
      if (was) {
        await likeRemove(EXT_A, aid);
      } else {
        await likeAdd(EXT_A, aid);
      }
      const row = await getAnswer(aid);
      setAnswers((prev) =>
        prev.map((a) => (a.id === aid ? mergeAnswerRowFromApi(row, a) : a)),
      );
    } catch (e: any) {
      setAnswers((prev) => prev.map((a) => (a.id === aid ? snapshot : a)));
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const toggleCollect = async () => {
    if (currentAnswerId == null) {
      return;
    }
    const aid = currentAnswerId;
    const cur = answers.find((a) => a.id === aid);
    if (!cur) {
      return;
    }
    const was = normalizeFlag(cur.is_collected ?? cur.collected);
    const snapshot = { ...cur };
    const nextCol = !was;
    setAnswers((prev) =>
      prev.map((a) =>
        a.id === aid
          ? {
              ...a,
              is_collected: nextCol,
              collected: undefined,
              collect_count: Math.max(
                0,
                (a.collect_count ?? 0) + (nextCol ? 1 : -1),
              ),
            }
          : a,
      ),
    );
    try {
      if (was) {
        await collectRemove(EXT_A, aid, 0);
      } else {
        await collectAdd(EXT_A, aid, 0);
      }
      const row = await getAnswer(aid);
      setAnswers((prev) =>
        prev.map((a) => (a.id === aid ? mergeAnswerRowFromApi(row, a) : a)),
      );
    } catch (e: any) {
      setAnswers((prev) => prev.map((a) => (a.id === aid ? snapshot : a)));
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const goNextAnswer = useCallback(() => {
    if (currentIndex >= answers.length - 1) {
      Alert.alert('', '没有更多回答了');
      return;
    }
    const next = currentIndex + 1;
    pagerRef.current?.setPage(next);
  }, [currentIndex, answers.length]);

  const openComments = useCallback(() => {
    setCommentsOpen(true);
  }, []);

  const onCommentTotal = useCallback((answerId: number, total: number) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.id === answerId ? { ...a, comment_count: total } : a,
      ),
    );
  }, []);

  const isLast = answers.length > 0 && currentIndex >= answers.length - 1;
  const fabBottom = insets.bottom + 88;
  const composeQuestionId = qBrief?.id;

  if (loading && answers.length === 0) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingWrap}>
          <LoadingMask visible={true} hint="正在加载回答…" />
        </View>
      </Screen>
    );
  }

  if (!loading && answers.length === 0) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingWrap}>
          <Text style={styles.muted}>暂无回答</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <View style={styles.root}>
        <PagerView
          key={id}
          ref={pagerRef}
          style={styles.pager}
          initialPage={initialIndex}
          orientation="vertical"
          overdrag={false}
          onPageSelected={(e) => {
            const pos = e.nativeEvent.position;
            setCurrentIndex(pos);
            setCommentsOpen(false);
          }}>
          {answers.map((a, index) => (
            <AnswerSlide
              key={a.id}
              answer={a}
              active={index === currentIndex}
              commentsOpen={commentsOpen}
              questionTitle={qTitle}
              questionContent={qContent}
              questionNeedsExpand={questionNeedsExpand}
              isLast={index === answers.length - 1}
            />
          ))}
        </PagerView>

        <View
          style={[styles.fabCol, { bottom: fabBottom }]}
          pointerEvents="box-none">
          <View style={styles.fabStack}>
            <TouchableOpacity
              style={[styles.fab, liked && styles.fabLikeOn]}
              onPress={toggleLike}
              activeOpacity={0.88}
              accessibilityLabel="点赞">
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={26}
                color={liked ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
            <Text style={styles.fabCount}>{formatStatCount(likeCount)}</Text>
          </View>

          <View style={styles.fabStack}>
            <TouchableOpacity
              style={[styles.fab, collected && styles.fabCollectOn]}
              onPress={toggleCollect}
              activeOpacity={0.88}
              accessibilityLabel="收藏">
              <Ionicons
                name={collected ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={collected ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
            <Text style={styles.fabCount}>
              {formatStatCount(collectCount)}
            </Text>
          </View>

          <View style={styles.fabStack}>
            <TouchableOpacity
              style={styles.fab}
              onPress={openComments}
              activeOpacity={0.88}
              accessibilityLabel="评论">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            <Text style={styles.fabCount}>
              {formatStatCount(commentCount)}
            </Text>
          </View>

          {composeQuestionId != null ? (
            <View style={styles.fabStack}>
              <TouchableOpacity
                style={styles.fab}
                onPress={() =>
                  navigation.navigate('AnswerCompose', {
                    questionId: composeQuestionId,
                  })
                }
                activeOpacity={0.88}
                accessibilityLabel="写回答">
                <Ionicons
                  name="create-outline"
                  size={26}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.fabStack}>
            <TouchableOpacity
              style={[styles.fab, isLast && styles.fabDisabled]}
              onPress={goNextAnswer}
              disabled={isLast}
              activeOpacity={0.88}
              accessibilityLabel="下一个回答">
              <Ionicons
                name="chevron-down"
                size={28}
                color={isLast ? colors.textMuted : colors.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <AnswerCommentsPanel
          answerId={currentAnswerId ?? null}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          onCommentTotal={onCommentTotal}
        />

      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  pager: { flex: 1 },
  loadingWrap: { flex: 1, minHeight: 200, position: 'relative' },
  muted: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  fabCol: {
    position: 'absolute',
    right: 10,
    zIndex: 50,
    alignItems: 'center',
    gap: 10,
  },
  fabStack: {
    alignItems: 'center',
    maxWidth: 64,
  },
  fabCount: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabLikeOn: {
    backgroundColor: LIKE_RED,
    borderColor: LIKE_RED,
  },
  fabCollectOn: {
    backgroundColor: COLLECT_AMBER,
    borderColor: COLLECT_AMBER,
  },
  fabDisabled: {
    opacity: 0.45,
  },
});
