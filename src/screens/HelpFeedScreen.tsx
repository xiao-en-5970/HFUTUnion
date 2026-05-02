import React, { useCallback, useRef, useState } from 'react';
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
import { listQuestions, type ArticleRow } from '../api/article';
import { listGoods, type GoodRow } from '../api/goods';
import Screen from '../components/Screen';
import LoadingMask from '../components/LoadingMask';
import CreateFab from '../components/CreateFab';
import { colors, radius, space } from '../theme/colors';
import { PAGE_SIZE, mergeById, hasMorePages } from '../utils/pagination';
import { markViewed, useViewedSet } from '../utils/viewedTracker';
import { renderDeadlineBadge, isDeadlineExpired } from '../utils/deadline';

/**
 * 「求助」页混排：
 *   - Q = 文字提问（articles.type=2）
 *   - G = 有偿求助（goods.goods_category=2）
 * 排序策略：两侧都走后端推荐流，客户端用 1:1 interleave；
 *   下拉刷新视作新一轮个性化排序（清空 refresh_token 重新开）。
 */

type Row =
  | { k: 'question'; item: ArticleRow }
  | { k: 'help_good'; item: GoodRow };

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

function fmtPrice(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
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
        listQuestions(1, PAGE_SIZE, { mode: 'recommend' }),
        listGoods(1, PAGE_SIZE, { sort: 'recommend', category: 2 }),
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
  }, []);

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
              mode: 'recommend',
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
              sort: 'recommend',
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
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
              <Text style={styles.tagText}>提问</Text>
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
          <Text style={[styles.meta, viewed && styles.textMuted]}>
            {q.author?.username ?? '用户'} · {q.answer_count ?? 0} 回答
          </Text>
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
            <Text style={styles.tagText}>有偿求助</Text>
          </View>
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
              {g.title || '有偿求助'}
            </Text>
            {g.content?.trim() ? (
              <Text
                style={[styles.preview, viewed && styles.textMuted]}
                numberOfLines={2}>
                {g.content.trim()}
              </Text>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{fmtPrice(g.price)}</Text>
              <Text style={[styles.meta, viewed && styles.textMuted]} numberOfLines={1}>
                {g.author?.username ?? '发布者'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen scroll={false} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>求助</Text>
        <Text style={styles.headerHint}>在线帮忙 · 有偿悬赏</Text>
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
              <Text style={styles.sheetRowText}>文字提问</Text>
              <Text style={styles.sheetRowHint}>无偿咨询，求解答</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              activeOpacity={0.85}
              onPress={() => {
                setCreateSheet(false);
                navigation.navigate('GoodCreate', { initialCategory: 2 });
              }}>
              <Text style={styles.sheetRowText}>有偿求助</Text>
              <Text style={styles.sheetRowHint}>设置酬劳，接单完成</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  headerHint: { marginTop: 4, fontSize: 12, color: colors.textMuted },
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
  priceRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    justifyContent: 'space-between',
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
