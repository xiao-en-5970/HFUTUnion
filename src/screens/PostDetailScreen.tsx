import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getPost } from '../api/article';
import {
  listComments,
  postComment,
  likeAdd,
  likeRemove,
  collectAdd,
  collectRemove,
  EXT_TYPE_COMMENT,
  type CommentItem,
} from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import LoadingMask from '../components/LoadingMask';
import SocialActionRow from '../components/SocialActionRow';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import type { RootStackParamList } from '../navigation/RootStack';

const EXT_POST = 1;

function normalizeFlag(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') return true;
  return false;
}

function normalizePostFlags(p: any) {
  if (!p) return p;
  return {
    ...p,
    is_liked: normalizeFlag(p.is_liked ?? p.liked),
    is_collected: normalizeFlag(p.is_collected ?? p.collected),
  };
}

function mergePostFromApi(row: any, prev: any) {
  return normalizePostFlags({
    ...prev,
    ...row,
    like_count: row.like_count ?? prev.like_count,
    collect_count: row.collect_count ?? prev.collect_count,
    view_count: row.view_count ?? prev.view_count,
  });
}

export default function PostDetailScreen({ route }: any) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const id = Number(route.params?.id ?? route.params?.postId);
  const cacheKey = `post:detail:v1:${id}`;
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [replyTarget, setReplyTarget] = useState<{
    parentId: number;
    replyId?: number;
    username: string;
  } | null>(null);

  const inputRef = useRef<TextInput>(null);

  const load = async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{ post: any; comments: any[] }>(cacheKey);
      if (cached?.post) {
        hadCache = true;
        setPost(normalizePostFlags(cached.post));
        setComments(cached.comments || []);
        setLoading(false);
      }
    } catch { /* noop */ }
    if (!hadCache) setLoading(true);
    try {
      const p = await getPost(id);
      const normalized = normalizePostFlags(p);
      setPost(normalized);
      const c = await listComments(EXT_POST, id, 1, 50);
      const rows = c.list || [];
      setComments(rows);
      setCommentTotal(c.total ?? rows.length);
      await cacheSet(cacheKey, { post: normalized, comments: rows });
    } catch (e: any) {
      if (!hadCache) Alert.alert('加载失败', e?.message || '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  const handleReplyTo = (c: CommentItem, isTopLevel: boolean) => {
    const parentId = isTopLevel ? c.id : (c.parent_id ?? c.id);
    const replyId = isTopLevel ? undefined : c.id;
    setReplyTarget({ parentId, replyId, username: c.author?.username || '用户' });
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyTarget(null);

  const sendComment = async () => {
    if (!text.trim()) return;
    try {
      const body: { content: string; parent_id?: number; reply_id?: number } = {
        content: text.trim(),
      };
      if (replyTarget) {
        body.parent_id = replyTarget.parentId;
        if (replyTarget.replyId) body.reply_id = replyTarget.replyId;
      }
      await postComment(EXT_POST, id, body);
      setText('');
      setReplyTarget(null);
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
    }
  };

  const toggleCommentLike = async (c: CommentItem) => {
    const was = !!c.is_liked;
    setComments((prev) =>
      prev.map((item) =>
        item.id === c.id
          ? { ...item, is_liked: !was, like_count: Math.max(0, (item.like_count ?? 0) + (was ? -1 : 1)) }
          : item,
      ),
    );
    try {
      if (was) await likeRemove(EXT_TYPE_COMMENT, c.id);
      else await likeAdd(EXT_TYPE_COMMENT, c.id);
    } catch {
      setComments((prev) =>
        prev.map((item) =>
          item.id === c.id
            ? { ...item, is_liked: was, like_count: Math.max(0, (item.like_count ?? 0) + (was ? 1 : -1)) }
            : item,
        ),
      );
    }
  };

  const togglePreviewLike = async (parentId: number, r: CommentItem) => {
    const was = !!r.is_liked;
    setComments((prev) =>
      prev.map((item) =>
        item.id === parentId
          ? {
              ...item,
              top_replies: item.top_replies?.map((tr) =>
                tr.id === r.id
                  ? { ...tr, is_liked: !was, like_count: Math.max(0, (tr.like_count ?? 0) + (was ? -1 : 1)) }
                  : tr,
              ),
            }
          : item,
      ),
    );
    try {
      if (was) await likeRemove(EXT_TYPE_COMMENT, r.id);
      else await likeAdd(EXT_TYPE_COMMENT, r.id);
    } catch {
      setComments((prev) =>
        prev.map((item) =>
          item.id === parentId
            ? {
                ...item,
                top_replies: item.top_replies?.map((tr) =>
                  tr.id === r.id
                    ? { ...tr, is_liked: was, like_count: Math.max(0, (tr.like_count ?? 0) + (was ? 1 : -1)) }
                    : tr,
                ),
              }
            : item,
        ),
      );
    }
  };

  const openReplies = (c: CommentItem) => {
    nav.navigate('CommentReplies', {
      extType: EXT_POST,
      extId: id,
      commentId: c.id,
      commentAuthor: c.author?.username,
      commentContent: c.content,
      commentLikeCount: c.like_count ?? 0,
      commentIsLiked: !!c.is_liked,
    });
  };

  const toggleLike = async () => {
    if (!post) return;
    const was = normalizeFlag(post.is_liked ?? post.liked);
    const snapshot = { ...post };
    const nextLiked = !was;
    setPost((p: any) =>
      p ? { ...p, is_liked: nextLiked, liked: undefined, like_count: Math.max(0, (p.like_count ?? 0) + (nextLiked ? 1 : -1)) } : p,
    );
    try {
      if (was) await likeRemove(EXT_POST, id);
      else await likeAdd(EXT_POST, id);
      const row = await getPost(id);
      setPost((prev: any) => {
        if (!prev) return prev;
        const merged = mergePostFromApi(row, prev);
        void cacheGet<{ post: any; comments: any[] }>(cacheKey).then((cached) => {
          cacheSet(cacheKey, { post: merged, comments: cached?.comments ?? [] }).catch(() => {});
        });
        return merged;
      });
    } catch (e: any) {
      setPost(snapshot);
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const toggleCollect = async () => {
    if (!post) return;
    const was = normalizeFlag(post.is_collected ?? post.collected);
    const snapshot = { ...post };
    const nextCol = !was;
    setPost((p: any) =>
      p ? { ...p, is_collected: nextCol, collected: undefined, collect_count: Math.max(0, (p.collect_count ?? 0) + (nextCol ? 1 : -1)) } : p,
    );
    try {
      if (was) await collectRemove(EXT_POST, id, 0);
      else await collectAdd(EXT_POST, id, 0);
      const row = await getPost(id);
      setPost((prev: any) => {
        if (!prev) return prev;
        const merged = mergePostFromApi(row, prev);
        void cacheGet<{ post: any; comments: any[] }>(cacheKey).then((cached) => {
          cacheSet(cacheKey, { post: merged, comments: cached?.comments ?? [] }).catch(() => {});
        });
        return merged;
      });
    } catch (e: any) {
      setPost(snapshot);
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  if (!post) {
    return (
      <Screen scroll={false}>
        <View style={styles.emptyWrap}>
          <LoadingMask visible={loading} hint="正在加载帖子…" />
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.emptyScroll}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
            }>
            {!loading ? <Text style={styles.muted}>加载失败，下拉重试</Text> : null}
          </ScrollView>
        </View>
      </Screen>
    );
  }

  const liked = normalizeFlag(post.is_liked ?? post.liked);
  const collected = normalizeFlag(post.is_collected ?? post.collected);

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.flex}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.pad}>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.meta}>
          {post.author?.username} · {post.like_count ?? 0} 赞
          {post.view_count != null ? ` · ${post.view_count} 浏览` : ''}
          {post.collect_count != null ? ` · ${post.collect_count} 收藏` : ''}
        </Text>
        <Text style={styles.body}>{post.content}</Text>
        {post.images?.length ? (
          <View style={styles.images}>
            {post.images.map((u: string, i: number) => (
              <Image key={i} source={{ uri: u }} style={styles.img} resizeMode="cover" />
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <SocialActionRow
            liked={liked}
            collected={collected}
            onLike={toggleLike}
            onCollect={toggleCollect}
            gap={14}
            likeCount={post.like_count ?? 0}
            collectCount={post.collect_count ?? 0}
          />
        </View>

        <Text style={styles.section}>
          评论{commentTotal > 0 ? ` ${commentTotal}` : ''}
        </Text>

        {comments.map((c) => (
          <View key={c.id} style={styles.cmtBlock}>
            {/* 顶层评论 */}
            <TouchableOpacity activeOpacity={0.7} onPress={() => handleReplyTo(c, true)} style={styles.cmtRow}>
              <View style={styles.cmtMain}>
                <Text style={styles.cmtUser}>{c.author?.username || '用户'}</Text>
                <Text style={styles.cmtBody}>{c.content}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleCommentLike(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.likeBtn}>
                <Ionicons name={c.is_liked ? 'heart' : 'heart-outline'} size={16} color={c.is_liked ? '#EF4444' : colors.textMuted} />
                {(c.like_count ?? 0) > 0 ? <Text style={styles.likeCount}>{c.like_count}</Text> : null}
              </TouchableOpacity>
            </TouchableOpacity>

            {/* top3 热门预览回复 */}
            {c.top_replies?.map((r) => (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.7}
                onPress={() => handleReplyTo(r, false)}
                style={styles.previewRow}>
                <View style={styles.cmtMain}>
                  <Text style={styles.cmtUser}>
                    {r.author?.username || '用户'}
                    {r.reply_to_author ? (
                      <Text style={styles.replyArrow}>
                        {' \u25B8 '}
                        <Text style={styles.replyTargetUser}>{r.reply_to_author.username}</Text>
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={styles.cmtBody} numberOfLines={2}>{r.content}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => togglePreviewLike(c.id, r)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.likeBtn}>
                  <Ionicons name={r.is_liked ? 'heart' : 'heart-outline'} size={14} color={r.is_liked ? '#EF4444' : colors.textMuted} />
                  {(r.like_count ?? 0) > 0 ? <Text style={styles.likeCount}>{r.like_count}</Text> : null}
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            {/* 查看全部回复入口 */}
            {(c.reply_count ?? 0) > 0 ? (
              <TouchableOpacity onPress={() => openReplies(c)} style={styles.viewAllBtn}>
                <Text style={styles.viewAllText}>
                  {(c.reply_count ?? 0) > (c.top_replies?.length ?? 0)
                    ? `查看全部 ${c.reply_count} 条回复`
                    : `查看 ${c.reply_count} 条回复`}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        {comments.length === 0 ? (
          <Text style={styles.muted}>暂无评论，来抢沙发</Text>
        ) : null}

        {replyTarget ? (
          <View style={styles.replyHint}>
            <Text style={styles.replyHintText}>回复 {replyTarget.username}</Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={styles.replyHintCancel}>取消</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={replyTarget ? `回复 ${replyTarget.username}…` : '写评论…'}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <PrimaryButton title="发送" onPress={sendComment} style={styles.sendBtn} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyWrap: { flex: 1, position: 'relative' },
  emptyScroll: { flexGrow: 1, justifyContent: 'center', padding: space.md },
  pad: { padding: space.md, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { marginTop: 8, fontSize: 13, color: colors.textSecondary },
  body: { marginTop: 16, fontSize: 16, lineHeight: 24, color: colors.text },
  images: { marginTop: 12, gap: 8 },
  img: { width: '100%', height: 200, borderRadius: radius.sm, marginBottom: 8 },
  actions: { marginTop: 20 },
  section: {
    marginTop: 24, fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12,
  },
  cmtBlock: {
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cmtRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  cmtMain: { flex: 1 },
  cmtUser: { fontSize: 13, fontWeight: '600', color: colors.primary },
  cmtBody: { marginTop: 4, fontSize: 15, color: colors.text },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 12, paddingTop: 2 },
  likeCount: { fontSize: 12, color: colors.textMuted },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingLeft: 16,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  replyArrow: { color: colors.textMuted, fontWeight: '400' },
  replyTargetUser: { color: colors.primary, fontWeight: '600' },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 6,
    marginBottom: 4,
  },
  viewAllText: { fontSize: 13, color: colors.primary, marginRight: 2 },
  replyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
  },
  replyHintText: { fontSize: 13, color: colors.primary },
  replyHintCancel: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 8 },
  muted: { color: colors.textMuted, fontSize: 14 },
  inputRow: { marginTop: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    minHeight: 44,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sendBtn: { paddingVertical: 10 },
});
