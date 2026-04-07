import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getPost } from '../api/article';
import { listComments, postComment, likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import LoadingMask from '../components/LoadingMask';
import SocialActionRow from '../components/SocialActionRow';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';

const EXT_POST = 1;

function normalizeFlag(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') {
    return true;
  }
  return false;
}

function normalizePostFlags(p: any) {
  if (!p) {
    return p;
  }
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
  const id = Number(route.params?.id ?? route.params?.postId);
  const cacheKey = `post:detail:v1:${id}`;
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    } catch {
      /* noop */
    }
    if (!hadCache) {
      setLoading(true);
    }
    try {
      const p = await getPost(id);
      const normalized = normalizePostFlags(p);
      setPost(normalized);
      const c = await listComments(EXT_POST, id, 1, 50);
      const rows = c.list || [];
      setComments(rows);
      await cacheSet(cacheKey, { post: normalized, comments: rows });
    } catch (e: any) {
      if (!hadCache) {
        Alert.alert('加载失败', e?.message || '');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id]),
  );

  const sendComment = async () => {
    if (!text.trim()) {
      return;
    }
    try {
      await postComment(EXT_POST, id, { content: text.trim() });
      setText('');
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
    }
  };

  const toggleLike = async () => {
    if (!post) {
      return;
    }
    const was = normalizeFlag(post.is_liked ?? post.liked);
    const snapshot = { ...post };
    const nextLiked = !was;
    setPost((p: any) =>
      p
        ? {
            ...p,
            is_liked: nextLiked,
            liked: undefined,
            like_count: Math.max(0, (p.like_count ?? 0) + (nextLiked ? 1 : -1)),
          }
        : p,
    );
    try {
      if (was) {
        await likeRemove(EXT_POST, id);
      } else {
        await likeAdd(EXT_POST, id);
      }
      const row = await getPost(id);
      setPost((prev: any) => {
        if (!prev) {
          return prev;
        }
        const merged = mergePostFromApi(row, prev);
        void cacheGet<{ post: any; comments: any[] }>(cacheKey).then((cached) => {
          cacheSet(cacheKey, {
            post: merged,
            comments: cached?.comments ?? [],
          }).catch(() => {});
        });
        return merged;
      });
    } catch (e: any) {
      setPost(snapshot);
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const toggleCollect = async () => {
    if (!post) {
      return;
    }
    const was = normalizeFlag(post.is_collected ?? post.collected);
    const snapshot = { ...post };
    const nextCol = !was;
    setPost((p: any) =>
      p
        ? {
            ...p,
            is_collected: nextCol,
            collected: undefined,
            collect_count: Math.max(
              0,
              (p.collect_count ?? 0) + (nextCol ? 1 : -1),
            ),
          }
        : p,
    );
    try {
      if (was) {
        await collectRemove(EXT_POST, id, 0);
      } else {
        await collectAdd(EXT_POST, id, 0);
      }
      const row = await getPost(id);
      setPost((prev: any) => {
        if (!prev) {
          return prev;
        }
        const merged = mergePostFromApi(row, prev);
        void cacheGet<{ post: any; comments: any[] }>(cacheKey).then((cached) => {
          cacheSet(cacheKey, {
            post: merged,
            comments: cached?.comments ?? [],
          }).catch(() => {});
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={colors.primary}
              />
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
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

        <Text style={styles.section}>评论</Text>
        {comments.map((c) => (
          <View key={c.id} style={styles.cmt}>
            <Text style={styles.cmtUser}>{c.author?.username || '用户'}</Text>
            <Text style={styles.cmtBody}>{c.content}</Text>
          </View>
        ))}
        {comments.length === 0 ? (
          <Text style={styles.muted}>暂无评论，来抢沙发</Text>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="写评论…"
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
  actions: {
    marginTop: 20,
  },
  section: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  cmt: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cmtUser: { fontSize: 13, fontWeight: '600', color: colors.primary },
  cmtBody: { marginTop: 4, fontSize: 15, color: colors.text },
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
