import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  listReplies,
  postComment,
  likeAdd,
  likeRemove,
  EXT_TYPE_COMMENT,
  type CommentItem,
} from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function CommentRepliesScreen({ route, navigation }: any) {
  const {
    extType,
    extId,
    commentId,
    commentAuthor,
    commentContent,
    commentLikeCount: initLikeCount,
    commentIsLiked: initIsLiked,
  } = route.params as {
    extType: number;
    extId: number;
    commentId: number;
    commentAuthor?: string;
    commentContent?: string;
    commentLikeCount?: number;
    commentIsLiked?: boolean;
  };

  const [parentLiked, setParentLiked] = useState(!!initIsLiked);
  const [parentLikeCount, setParentLikeCount] = useState(initLikeCount ?? 0);
  const [replies, setReplies] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<{
    replyId: number;
    username: string;
  } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const r = await listReplies(extType, extId, commentId, 1, 200);
      setReplies(r.list || []);
      setTotal(r.total ?? (r.list?.length ?? 0));
    } catch {
      /* ignore */
    }
  }, [extType, extId, commentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleParentLike = async () => {
    const was = parentLiked;
    setParentLiked(!was);
    setParentLikeCount((n) => Math.max(0, n + (was ? -1 : 1)));
    try {
      if (was) await likeRemove(EXT_TYPE_COMMENT, commentId);
      else await likeAdd(EXT_TYPE_COMMENT, commentId);
    } catch {
      setParentLiked(was);
      setParentLikeCount((n) => Math.max(0, n + (was ? 1 : -1)));
    }
  };

  const handleReplyTo = (c: CommentItem) => {
    setReplyTarget({ replyId: c.id, username: c.author?.username || '用户' });
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyTarget(null);

  const send = async () => {
    if (!text.trim()) return;
    try {
      const body: { content: string; parent_id: number; reply_id?: number } = {
        content: text.trim(),
        parent_id: commentId,
      };
      if (replyTarget) {
        body.reply_id = replyTarget.replyId;
      }
      await postComment(extType, extId, body);
      setText('');
      setReplyTarget(null);
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message ?? '');
    }
  };

  const toggleLike = async (item: CommentItem) => {
    const was = !!item.is_liked;
    setReplies((prev) =>
      prev.map((r) =>
        r.id === item.id
          ? {
              ...r,
              is_liked: !was,
              like_count: Math.max(0, (r.like_count ?? 0) + (was ? -1 : 1)),
            }
          : r,
      ),
    );
    try {
      if (was) {
        await likeRemove(EXT_TYPE_COMMENT, item.id);
      } else {
        await likeAdd(EXT_TYPE_COMMENT, item.id);
      }
    } catch {
      setReplies((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                is_liked: was,
                like_count: Math.max(0, (r.like_count ?? 0) + (was ? 1 : -1)),
              }
            : r,
        ),
      );
    }
  };

  const renderReply = ({ item }: { item: CommentItem }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => handleReplyTo(item)}
      style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.author}>
          {item.author?.username || '用户'}
          {item.reply_to_author ? (
            <Text style={styles.arrow}>
              {' \u25B8 '}
              <Text style={styles.targetUser}>
                {item.reply_to_author.username}
              </Text>
            </Text>
          ) : null}
        </Text>
        <TouchableOpacity
          onPress={() => toggleLike(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.likeBtn}>
          <Ionicons
            name={item.is_liked ? 'heart' : 'heart-outline'}
            size={16}
            color={item.is_liked ? '#EF4444' : colors.textMuted}
          />
          {(item.like_count ?? 0) > 0 ? (
            <Text style={styles.likeCount}>{item.like_count}</Text>
          ) : null}
        </TouchableOpacity>
      </View>
      <Text style={styles.body}>{item.content}</Text>
    </TouchableOpacity>
  );

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        {commentContent ? (
          <View style={styles.parentCard}>
            <View style={styles.parentTop}>
              <View style={styles.parentMain}>
                <Text style={styles.parentAuthor}>
                  {commentAuthor || '用户'}
                </Text>
                <Text style={styles.parentBody} numberOfLines={3}>
                  {commentContent}
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleParentLike}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.likeBtn}>
                <Ionicons
                  name={parentLiked ? 'heart' : 'heart-outline'}
                  size={18}
                  color={parentLiked ? '#EF4444' : colors.textMuted}
                />
                {parentLikeCount > 0 ? (
                  <Text style={styles.likeCount}>{parentLikeCount}</Text>
                ) : null}
              </TouchableOpacity>
            </View>
            <Text style={styles.parentMeta}>
              共 {total} 条回复
            </Text>
          </View>
        ) : null}

        <FlatList
          style={styles.flex}
          data={replies}
          keyExtractor={(i) => String(i.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={
            <Text style={styles.muted}>暂无回复</Text>
          }
          renderItem={renderReply}
        />

        {replyTarget ? (
          <View style={styles.replyHint}>
            <Text style={styles.replyHintText}>
              回复 {replyTarget.username}
            </Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={styles.replyHintCancel}>取消</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={
              replyTarget ? `回复 ${replyTarget.username}…` : '写回复…'
            }
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <PrimaryButton title="发送" onPress={send} style={styles.sendBtn} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  parentCard: {
    padding: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  parentTop: { flexDirection: 'row', alignItems: 'flex-start' },
  parentMain: { flex: 1 },
  parentAuthor: { fontSize: 14, fontWeight: '700', color: colors.primary },
  parentBody: { marginTop: 4, fontSize: 15, color: colors.text, lineHeight: 22 },
  parentMeta: { marginTop: 6, fontSize: 12, color: colors.textMuted },
  listPad: { padding: space.md, paddingBottom: 20 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  author: { fontSize: 13, fontWeight: '600', color: colors.primary, flex: 1 },
  arrow: { color: colors.textMuted, fontWeight: '400' },
  targetUser: { color: colors.primary, fontWeight: '600' },
  body: { marginTop: 4, fontSize: 15, color: colors.text },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 12 },
  likeCount: { fontSize: 12, color: colors.textMuted },
  replyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: space.md,
    backgroundColor: colors.primaryLight,
  },
  replyHintText: { fontSize: 13, color: colors.primary },
  replyHintCancel: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: space.md,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    minHeight: 44,
    maxHeight: 100,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  muted: { color: colors.textMuted, fontSize: 14, padding: space.md },
});
