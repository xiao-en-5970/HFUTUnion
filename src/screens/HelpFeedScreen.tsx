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
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listQuestions, type ArticleRow, type PostFeedMode } from '../api/article';
import { listGoods, type GoodRow, type GoodsListSort } from '../api/goods';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import CreateFab from '../components/CreateFab';
import { colors, radius, space } from '../theme/colors';
import { PAGE_SIZE, mergeById, hasMorePages } from '../utils/pagination';
import { formatAuthorName } from '../utils/authorName';
import AuthorChip from '../components/AuthorChip';
import { markViewed, useViewedSet } from '../utils/viewedTracker';
import { renderDeadlineBadge, isDeadlineExpired } from '../utils/deadline';
import { formatGoodPrice } from '../utils/goodPrice';
import { consumeListDirty } from '../utils/listInvalidate';

/**
 * 「求助」页混排：
 *   - Q = 求解答（articles.type=2，原"提问"）
 *   - G = 求物品（goods.goods_category=2，原"有偿求助"）
 *
 * 排序策略跟"社区"页一致——顶部下拉切换 推荐 / 最新 / 热门 三档：
 *   - 推荐：两侧都走后端 sort=recommend + refresh_token 稳定分页，客户端 1:1 interleave
 *   - 最新：created_at DESC
 *   - 热门：collect_count×10 + like_count×5 + view_count×1 DESC
 * 下拉刷新视作新一轮排序（清空 refresh_token / 翻页 ref）。
 */

type Row =
  | { k: 'question'; item: ArticleRow }
  | { k: 'help_good'; item: GoodRow };

const FEED_OPTIONS: { value: PostFeedMode; label: string; hint: string }[] = [
  {
    value: 'recommend',
    label: '推荐',
    hint: '根据你的浏览、点赞、收藏个性化排序',
  },
  { value: 'latest', label: '最新', hint: '按发布时间，最新在前' },
  { value: 'hot', label: '热门', hint: '近期互动多的求助' },
];

/** mode → goods sort 映射；goods 端"热门"叫 popularity，"最新"叫 newest */
function modeToGoodsSort(mode: PostFeedMode): GoodsListSort {
  if (mode === 'recommend') return 'recommend';
  if (mode === 'hot') return 'popularity';
  return 'newest';
}

function interleave(qs: ArticleRow[], gs: GoodRow[]): Row[] {
  const out: Row[] = [];
  const n = Math.max(qs.length, gs.length);
  for (let i = 0; i < n; i++) {
    if (i < qs.length) {
      out.push({ k: 'question', item: qs[i] });
    }
    if (i < gs.length) {
      out.push({ k: 'help_good', item: gs[i] });
    }
  }
  return out;
}


export default function HelpFeedScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [questions, setQuestions] = useState<ArticleRow[]>([]);
  const [goods, setGoods] = useState<GoodRow[]>([]);

  const qPageRef = useRef(1);
  const gPageRef = useRef(1);
  const qTokenRef = useRef<string | undefined>(undefined);
  const gTokenRef = useRef<string | undefined>(undefined);
  const hasMoreQRef = useRef(true);
  const hasMoreGRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [createSheet, setCreateSheet] = useState(false);
  const [feedMode, setFeedMode] = useState<PostFeedMode>('recommend');
  const [modeSheetOpen, setModeSheetOpen] = useState(false);

  const viewedQ = useViewedSet('question');
  const viewedG = useViewedSet('good');

  const loadInitial = useCallback(async () => {
    setLoading(true);
    qPageRef.current = 1;
    gPageRef.current = 1;
    qTokenRef.current = undefined;
    gTokenRef.current = undefined;
    hasMoreQRef.current = true;
    hasMoreGRef.current = true;
    try {
      const [qr, gr] = await Promise.all([
        listQuestions(1, PAGE_SIZE, { mode: feedMode }),
        listGoods(1, PAGE_SIZE, { sort: modeToGoodsSort(feedMode), category: 2 }),
      ]);
      qTokenRef.current = qr.refresh_token;
      gTokenRef.current = gr.refresh_token;
      setQuestions(qr.list ?? []);
      setGoods(gr.list ?? []);
      hasMoreQRef.current = hasMorePages(
        (qr.list ?? []).length,
        PAGE_SIZE,
        qr.total,
        (qr.list ?? []).length,
      );
      hasMoreGRef.current = hasMorePages(
        (gr.list ?? []).length,
        PAGE_SIZE,
        gr.total,
        (gr.list ?? []).length,
      );
    } catch {
      setQuestions([]);
      setGoods([]);
      hasMoreQRef.current = false;
      hasMoreGRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedMode]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) {
      return;
    }
    if (!hasMoreQRef.current && !hasMoreGRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const tasks: Promise<void>[] = [];
      if (hasMoreQRef.current) {
        const next = qPageRef.current + 1;
        tasks.push(
          (async () => {
            const r = await listQuestions(next, PAGE_SIZE, {
              mode: feedMode,
              refreshToken: qTokenRef.current,
            });
            if (r.refresh_token) {
              qTokenRef.current = r.refresh_token;
            }
            const rows = r.list ?? [];
            setQuestions((prev) => {
              const merged = mergeById(prev, rows);
              hasMoreQRef.current = hasMorePages(
                rows.length,
                PAGE_SIZE,
                r.total,
                merged.length,
              );
              return merged;
            });
            if (rows.length > 0) {
              qPageRef.current = next;
            }
          })(),
        );
      }
      if (hasMoreGRef.current) {
        const next = gPageRef.current + 1;
        tasks.push(
          (async () => {
            const r = await listGoods(next, PAGE_SIZE, {
              sort: modeToGoodsSort(feedMode),
              category: 2,
              refreshToken: gTokenRef.current,
            });
            if (r.refresh_token) {
              gTokenRef.current = r.refresh_token;
            }
            const rows = r.list ?? [];
            setGoods((prev) => {
              const merged = mergeById(prev, rows);
              hasMoreGRef.current = hasMorePages(
                rows.length,
                PAGE_SIZE,
                r.total,
                merged.length,
              );
              return merged;
            });
            if (rows.length > 0) {
              gPageRef.current = next;
            }
          })(),
        );
      }
      await Promise.all(tasks);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedMode]);

  // 首次 mount + feedMode 切换都重新拉
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // focus 仅在外部显式置位 dirty 时才重拉，避免"点详情→返回→列表顺序抖"。
  // 触发 dirty 的场景：发布求物品 / 发布求解答 等会改变本 feed 内容的动作。
  useFocusEffect(
    useCallback(() => {
      if (consumeListDirty('helpFeed')) {
        loadInitial();
      }
    }, [loadInitial]),
  );

  const rows = interleave(questions, goods);
  const fabBottom = tabBarHeight + 12;
  const sheetBottom = insets.bottom;

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.k === 'question') {
      const q = row.item;
      const title = q.title?.trim() || q.content?.slice(0, 40) || '求助';
      const viewed = viewedQ.has(q.id) || !!q.is_viewed;
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => {
            markViewed('question', q.id);
            navigation.navigate('QuestionDetail', { id: q.id });
          }}>
          <View style={styles.tagRow}>
            <View style={[styles.tag, styles.tagQuestion]}>
              <Text style={styles.tagText}>求解答</Text>
            </View>
          </View>
          <Text
            style={[styles.title, viewed && styles.textMuted]}
            numberOfLines={2}>
            {title}
          </Text>
          {q.content?.trim() ? (
            <Text
              style={[styles.preview, viewed && styles.textMuted]}
              numberOfLines={3}>
              {q.content.trim()}
            </Text>
          ) : null}
          <View style={styles.authorLineRow}>
            <AuthorChip author={q.author as any} size="xs" />
            <Text style={[styles.meta, viewed && styles.textMuted]}>
              {' · '}{q.answer_count ?? 0} 回答
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    const g = row.item;
    const viewed = viewedG.has(g.id) || !!g.is_viewed;
    const cover = g.images?.[0];
    const deadlineText = renderDeadlineBadge(g);
    const expired = isDeadlineExpired(g);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => {
          markViewed('good', g.id);
          navigation.navigate('GoodDetail', { id: g.id });
        }}>
        <View style={styles.tagRow}>
          <View style={[styles.tag, styles.tagHelp]}>
            <Text style={styles.tagText}>求物品</Text>
          </View>
          {!g.negotiable && (g.price ?? 0) > 0 ? (
            <View style={[styles.tag, styles.tagHelp]}>
              <Text style={styles.tagText}>有偿</Text>
            </View>
          ) : null}
          {deadlineText ? (
            <View style={[styles.tag, expired ? styles.tagExpired : styles.tagDeadline]}>
              <Text style={styles.tagText}>{deadlineText}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.goodRow}>
          {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : null}
          <View style={styles.goodBody}>
            <Text
              style={[styles.title, viewed && styles.textMuted]}
              numberOfLines={2}>
              {g.title || '求物品'}
            </Text>
            {g.content?.trim() ? (
              <Text
                style={[styles.preview, viewed && styles.textMuted]}
                numberOfLines={2}>
                {g.content.trim()}
              </Text>
            ) : null}
            <View style={styles.priceRow}>
              {(() => {
                const t = formatGoodPrice(g.price, g.negotiable, g.goods_category);
                return t ? <Text style={styles.price}>{t}</Text> : null;
              })()}
            </View>
          </View>
        </View>
        {/* author 独立成行，跟卡片左边对齐——无论有图没图布局一致，跟求解答（Q）那行同样位置 */}
        <View style={styles.authorLineRow}>
          <AuthorChip author={g.author as any} size="xs" fallback="发布者" />
        </View>
      </TouchableOpacity>
    );
  };

  const currentMode = FEED_OPTIONS.find((o) => o.value === feedMode) ?? FEED_OPTIONS[0];

  return (
    <Screen scroll={false} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>求助</Text>
          <Text style={styles.headerHint}>在线帮忙 · 有偿悬赏</Text>
        </View>
        <TouchableOpacity
          style={styles.modeBtn}
          onPress={() => setModeSheetOpen(true)}
          activeOpacity={0.85}
          hitSlop={8}>
          <Text style={styles.modeBtnText}>{currentMode.label}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.flex}>
        <LoadingMask visible={loading && rows.length === 0} hint="正在加载…" />
        <FlatList
          style={styles.flex}
          data={rows}
          keyExtractor={(row) =>
            row.k === 'question' ? `q-${row.item.id}` : `g-${row.item.id}`
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
          contentContainerStyle={[styles.list, { paddingBottom: fabBottom + 56 }]}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSp} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>暂无求助</Text> : null
          }
          renderItem={renderItem}
        />
        <CreateFab onPress={() => setCreateSheet(true)} accessibilityLabel="发布" />
      </View>

      <Modal
        visible={createSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateSheet(false)}>
        <View style={styles.sheetWrap}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setCreateSheet(false)}
          />
          <View style={[styles.sheetCard, { paddingBottom: sheetBottom + 16 }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>发布求助</Text>
            <TouchableOpacity
              style={styles.sheetRow}
              activeOpacity={0.85}
              onPress={() => {
                setCreateSheet(false);
                navigation.navigate('CreateQuestion');
              }}>
              <Text style={styles.sheetRowText}>求解答</Text>
              <Text style={styles.sheetRowHint}>发起一个问题，等同学帮你回答</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              activeOpacity={0.85}
              onPress={() => {
                setCreateSheet(false);
                navigation.navigate('GoodCreate', { initialCategory: 2 });
              }}>
              <Text style={styles.sheetRowText}>求物品</Text>
              <Text style={styles.sheetRowHint}>求一件具体物品，可设置酬劳（有偿）</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancel}
              activeOpacity={0.85}
              onPress={() => setCreateSheet(false)}>
              <Text style={styles.sheetCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 排序模式切换模态——跟"社区"页同款 UX：点头部按钮弹出，三选一 */}
      <Modal
        visible={modeSheetOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setModeSheetOpen(false)}>
        <View style={styles.modeOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModeSheetOpen(false)} />
          <View style={styles.modeCard}>
            <Text style={styles.modeTitle}>排序方式</Text>
            <Text style={styles.modeSub}>随时可切换。</Text>
            {FEED_OPTIONS.map((opt) => {
              const on = opt.value === feedMode;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modeRow, on && styles.modeRowOn]}
                  onPress={() => {
                    setFeedMode(opt.value);
                    setModeSheetOpen(false);
                  }}
                  activeOpacity={0.85}>
                  <View style={styles.modeRowText}>
                    <Text style={[styles.modeRowLabel, on && styles.modeRowLabelOn]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.modeRowHint}>{opt.hint}</Text>
                  </View>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  ) : (
                    <View style={styles.modeRadio} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.modeCancel}
              activeOpacity={0.85}
              onPress={() => setModeSheetOpen(false)}>
              <Text style={styles.modeCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  headerLeft: { flex: 1, paddingRight: space.sm },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  headerHint: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  modeBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  modeOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  modeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  modeTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modeSub: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.sm,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modeRowOn: { backgroundColor: colors.primaryLight, borderRadius: radius.sm },
  modeRowText: { flex: 1, paddingRight: 8 },
  modeRowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  modeRowLabelOn: { color: colors.primary },
  modeRowHint: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  modeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
  },
  modeCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  modeCancelText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  list: { paddingHorizontal: space.md, paddingTop: space.sm },
  footerSp: { marginVertical: 16 },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tagQuestion: { backgroundColor: colors.primary },
  tagHelp: { backgroundColor: '#F59E0B' },
  tagDeadline: { backgroundColor: '#0EA5E9' },
  tagExpired: { backgroundColor: colors.textMuted },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  preview: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  meta: { marginTop: 6, fontSize: 12, color: colors.textMuted },
  textMuted: { color: colors.textMuted },
  goodRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cover: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  goodBody: { flex: 1 },
  authorLineRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center' },
  priceRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  price: { fontSize: 16, fontWeight: '800', color: colors.danger },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.md,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  sheetRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 16, fontWeight: '600', color: colors.text },
  sheetRowHint: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  sheetCancelText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
});
