import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getPost } from '../api/article';
import { listComments, postComment, likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import LoadingMask from '../components/LoadingMask';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';

const EXT_POST = 1;

export default function PostDetailScreen({ route, navigation }: any) {
  const id = Number(route.params?.id ?? route.params?.postId);
  const cacheKey = `post:detail:v1:${id}`;
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [liked, setLiked] = useState(false);
  const [collected, setCollected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<{ post: any; comments: any[] }>(cacheKey);
      if (cached?.post) {
        hadCache = true;
        setPost(cached.post);
        setComments(cached.comments || []);
        setLiked(Boolean(cached.post.is_liked ?? cached.post.liked));
        setCollected(Boolean(cached.post.is_collected ?? cached.post.collected));
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
      setPost(p);
      setLiked(Boolean(p.is_liked ?? p.liked));
      setCollected(Boolean(p.is_collected ?? p.collected));
      const c = await listComments(EXT_POST, id, 1, 50);
      const rows = c.list || [];
      setComments(rows);
      await cacheSet(cacheKey, { post: p, comments: rows });
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
    try {
      if (liked) {
        await likeRemove(EXT_POST, id);
        setLiked(false);
      } else {
        await likeAdd(EXT_POST, id);
        setLiked(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message);
    }
  };

  const toggleCollect = async () => {
    try {
      if (collected) {
        await collectRemove(EXT_POST, id, 0);
        setCollected(false);
      } else {
        await collectAdd(EXT_POST, id, 0);
        setCollected(true);
      }
      load();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message);
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
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={22}
              color={liked ? colors.accent : colors.textSecondary}
            />
            <Text style={styles.actionText}>赞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleCollect}>
            <Ionicons
              name={collected ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={collected ? colors.primary : colors.textSecondary}
            />
            <Text style={styles.actionText}>收藏</Text>
          </TouchableOpacity>
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
    flexDirection: 'row',
    marginTop: 20,
    gap: 24,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 14, color: colors.textSecondary },
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
