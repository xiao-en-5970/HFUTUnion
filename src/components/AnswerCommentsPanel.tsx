import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Animated,
  PanResponder,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  listComments,
  postComment,
  likeAdd,
  likeRemove,
  EXT_TYPE_COMMENT,
  type CommentItem,
} from '../api/social';
import PrimaryButton from './PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootStack';

const OVERLAY = 'rgba(0,0,0,0.38)';
const EXT_ANSWER = 3;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type Props = {
  answerId: number | null;
  open: boolean;
  onClose: () => void;
  onCommentTotal?: (answerId: number, total: number) => void;
};

export default function AnswerCommentsPanel({ answerId, open, onClose, onCommentTotal }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const peekH = winH * 0.42;
  const fullH = winH * 0.9;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const dragStartH = useRef(0);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const [replyTarget, setReplyTarget] = useState<{
    parentId: number;
    replyId?: number;
    username: string;
  } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (answerId == null) return;
    setLoading(true);
    try {
      const c = await listComments(EXT_ANSWER, answerId, 1, 80);
      setComments(c.list || []);
      const total = c.total ?? (c.list?.length ?? 0);
      setCommentTotal(total);
      onCommentTotal?.(answerId, total);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [answerId, onCommentTotal]);

  useEffect(() => {
    if (open && answerId != null) {
      load();
      setText('');
      setReplyTarget(null);
      Animated.spring(heightAnim, { toValue: peekH, useNativeDriver: false, friction: 9, tension: 65 }).start();
    } else {
      Animated.timing(heightAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start();
    }
  }, [open, answerId, heightAnim, load, peekH]);

  const snapTo = useCallback(
    (h: number) => {
      Animated.spring(heightAnim, { toValue: h, useNativeDriver: false, friction: 9, tension: 65 }).start();
    },
    [heightAnim],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => open,
        onMoveShouldSetPanResponder: (_, g) => open && Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          dragStartH.current = peekH;
          heightAnim.stopAnimation((v) => { dragStartH.current = v > 8 ? v : peekH; });
        },
        onPanResponderMove: (_, g) => { heightAnim.setValue(clamp(dragStartH.current - g.dy, 0, fullH)); },
        onPanResponderRelease: (_, g) => {
          const nh = clamp(dragStartH.current - g.dy, 0, fullH);
          const vy = g.vy ?? 0;
          if (nh < 72 || (nh < peekH * 0.55 && vy > 0.35)) { onClose(); return; }
          const mid = (peekH + fullH) / 2;
          if (vy < -0.4) snapTo(fullH);
          else if (vy > 0.4) snapTo(peekH);
          else if (nh >= mid) snapTo(fullH);
          else snapTo(peekH);
        },
      }),
    [open, heightAnim, peekH, fullH, onClose, snapTo],
  );

  const handleReplyTo = (c: CommentItem, isTopLevel: boolean) => {
    const parentId = isTopLevel ? c.id : (c.parent_id ?? c.id);
    const replyId = isTopLevel ? undefined : c.id;
    setReplyTarget({ parentId, replyId, username: c.author?.username || '用户' });
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyTarget(null);

  const send = async () => {
    if (!text.trim() || answerId == null) return;
    try {
      const body: { content: string; parent_id?: number; reply_id?: number } = { content: text.trim() };
      if (replyTarget) {
        body.parent_id = replyTarget.parentId;
        if (replyTarget.replyId) body.reply_id = replyTarget.replyId;
      }
      await postComment(EXT_ANSWER, answerId, body);
      setText('');
      setReplyTarget(null);
      await load();
    } catch (e: any) {
      Alert.alert('失败', e?.message ?? '发送失败');
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
          ? { ...item, top_replies: item.top_replies?.map((tr) => tr.id === r.id ? { ...tr, is_liked: !was, like_count: Math.max(0, (tr.like_count ?? 0) + (was ? -1 : 1)) } : tr) }
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
            ? { ...item, top_replies: item.top_replies?.map((tr) => tr.id === r.id ? { ...tr, is_liked: was, like_count: Math.max(0, (tr.like_count ?? 0) + (was ? 1 : -1)) } : tr) }
            : item,
        ),
      );
    }
  };

  const openReplies = (c: CommentItem) => {
    if (answerId == null) return;
    nav.navigate('CommentReplies', {
      extType: EXT_ANSWER,
      extId: answerId,
      commentId: c.id,
      commentAuthor: c.author?.username,
      commentContent: c.content,
      commentLikeCount: c.like_count ?? 0,
      commentIsLiked: !!c.is_liked,
    });
  };

  const bottomPad = Math.max(insets.bottom, 8);
  const showPanel = open && answerId != null;

  return (
    <>
      {showPanel ? (
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭评论" />
      ) : null}

      <Animated.View
        style={[styles.sheet, { height: heightAnim, opacity: showPanel ? 1 : 0 }]}
        pointerEvents={open ? 'auto' : 'none'}>
        {showPanel ? (
          <KeyboardAvoidingView
            style={styles.kb}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 48}>
            <View style={styles.handleRow} {...panResponder.panHandlers}>
              <View style={styles.grabber} />
              <Text style={styles.handleTitle}>
                评论{commentTotal > 0 ? ` ${commentTotal}` : ''}
              </Text>
            </View>

            <FlatList
              style={styles.list}
              data={comments}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                loading
                  ? <Text style={styles.muted}>加载中…</Text>
                  : <Text style={styles.muted}>暂无评论</Text>
              }
              renderItem={({ item: c }) => (
                <View style={styles.cmtBlock}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => handleReplyTo(c, true)} style={styles.cmtRow}>
                    <View style={styles.cmtMain}>
                      <Text style={styles.cmtUser}>{c.author?.username || '用户'}</Text>
                      <Text style={styles.cmtBody}>{c.content}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleCommentLike(c)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.likeBtn}>
                      <Ionicons name={c.is_liked ? 'heart' : 'heart-outline'} size={16} color={c.is_liked ? '#EF4444' : colors.textMuted} />
                      {(c.like_count ?? 0) > 0 ? <Text style={styles.likeCount}>{c.like_count}</Text> : null}
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {c.top_replies?.map((r) => (
                    <TouchableOpacity key={r.id} activeOpacity={0.7} onPress={() => handleReplyTo(r, false)} style={styles.previewRow}>
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
              )}
            />

            {replyTarget ? (
              <View style={styles.replyHint}>
                <Text style={styles.replyHintText}>回复 {replyTarget.username}</Text>
                <TouchableOpacity onPress={cancelReply}>
                  <Text style={styles.replyHintCancel}>取消</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={[styles.inputRow, { paddingBottom: bottomPad }]}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyTarget ? `回复 ${replyTarget.username}…` : '写评论…'}
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
              />
              <PrimaryButton title="发送" onPress={send} style={styles.sendBtn} />
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: OVERLAY, zIndex: 39 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    overflow: 'hidden', zIndex: 40, elevation: 24,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
  },
  kb: { flex: 1 },
  handleRow: {
    alignItems: 'center', paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 6 },
  handleTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  list: { flex: 1, paddingHorizontal: space.md },
  cmtBlock: {
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cmtRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  cmtMain: { flex: 1 },
  cmtUser: { fontSize: 13, fontWeight: '600', color: colors.primary },
  cmtBody: { marginTop: 4, fontSize: 15, color: colors.text },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 12, paddingTop: 2 },
  likeCount: { fontSize: 12, color: colors.textMuted },
  previewRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 6, paddingLeft: 16,
    backgroundColor: colors.bg, borderRadius: radius.sm, marginBottom: 2,
  },
  replyArrow: { color: colors.textMuted, fontWeight: '400' as const },
  replyTargetUser: { color: colors.primary, fontWeight: '600' as const },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 16, paddingVertical: 6, marginBottom: 4,
  },
  viewAllText: { fontSize: 13, color: colors.primary, marginRight: 2 },
  replyHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: space.md, backgroundColor: colors.primaryLight,
  },
  replyHintText: { fontSize: 13, color: colors.primary },
  replyHintCancel: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 8 },
  muted: { color: colors.textMuted, padding: space.md },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: space.md, paddingTop: 8, paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 10, minHeight: 44, maxHeight: 100, color: colors.text, backgroundColor: colors.bg,
  },
  sendBtn: { paddingVertical: 10, paddingHorizontal: 12 },
});
