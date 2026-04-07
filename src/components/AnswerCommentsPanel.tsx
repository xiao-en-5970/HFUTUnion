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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listComments, postComment } from '../api/social';
import PrimaryButton from './PrimaryButton';
import { colors, radius, space } from '../theme/colors';

const OVERLAY = 'rgba(0,0,0,0.38)';

const EXT_ANSWER = 3;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type Props = {
  answerId: number | null;
  /** 是否展示面板（高度动画） */
  open: boolean;
  onClose: () => void;
  /** 评论列表加载完成后回传 total，用于同步详情区数量 */
  onCommentTotal?: (answerId: number, total: number) => void;
};

/**
 * 底部评论区：列表 + 输入发评；由回答详情侧栏按钮打开；顶部横条可拖动上拉展开 / 下拉收起。
 */
export default function AnswerCommentsPanel({
  answerId,
  open,
  onClose,
  onCommentTotal,
}: Props) {
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const peekH = winH * 0.42;
  const fullH = winH * 0.9;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const dragStartH = useRef(0);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (answerId == null) {
      return;
    }
    setLoading(true);
    try {
      const c = await listComments(EXT_ANSWER, answerId, 1, 80);
      setComments(c.list || []);
      const total = c.total ?? (c.list?.length ?? 0);
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
      Animated.spring(heightAnim, {
        toValue: peekH,
        useNativeDriver: false,
        friction: 9,
        tension: 65,
      }).start();
    } else {
      Animated.timing(heightAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }).start();
    }
  }, [open, answerId, heightAnim, load, peekH]);

  const snapTo = useCallback(
    (h: number) => {
      Animated.spring(heightAnim, {
        toValue: h,
        useNativeDriver: false,
        friction: 9,
        tension: 65,
      }).start();
    },
    [heightAnim],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => open,
        onMoveShouldSetPanResponder: (_, g) =>
          open && Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          dragStartH.current = peekH;
          heightAnim.stopAnimation((v) => {
            dragStartH.current = v > 8 ? v : peekH;
          });
        },
        onPanResponderMove: (_, g) => {
          const nh = clamp(dragStartH.current - g.dy, 0, fullH);
          heightAnim.setValue(nh);
        },
        onPanResponderRelease: (_, g) => {
          let nh = clamp(dragStartH.current - g.dy, 0, fullH);
          const vy = g.vy ?? 0;
          if (nh < 72 || (nh < peekH * 0.55 && vy > 0.35)) {
            onClose();
            return;
          }
          const mid = (peekH + fullH) / 2;
          if (vy < -0.4) {
            snapTo(fullH);
          } else if (vy > 0.4) {
            snapTo(peekH);
          } else if (nh >= mid) {
            snapTo(fullH);
          } else {
            snapTo(peekH);
          }
        },
      }),
    [open, heightAnim, peekH, fullH, onClose, snapTo],
  );

  const send = async () => {
    if (!text.trim() || answerId == null) {
      return;
    }
    try {
      await postComment(EXT_ANSWER, answerId, { content: text.trim() });
      setText('');
      await load();
    } catch (e: any) {
      Alert.alert('失败', e?.message ?? '发送失败');
    }
  };

  const bottomPad = Math.max(insets.bottom, 8);

  /** 仅在打开且有关联回答时挂载面板内容，避免高度动画过程中 flex 把输入区顶出半截 */
  const showPanel = open && answerId != null;

  return (
    <>
      {showPanel ? (
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="关闭评论"
        />
      ) : null}

      <Animated.View
        style={[
          styles.sheet,
          {
            height: heightAnim,
            opacity: showPanel ? 1 : 0,
          },
        ]}
        pointerEvents={open ? 'auto' : 'none'}>
        {showPanel ? (
          <KeyboardAvoidingView
            style={styles.kb}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 48}>
            <View style={styles.handleRow} {...panResponder.panHandlers}>
              <View style={styles.grabber} />
              <Text style={styles.handleTitle}>评论</Text>
            </View>

            <FlatList
              style={styles.list}
              data={comments}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                loading ? (
                  <Text style={styles.muted}>加载中…</Text>
                ) : (
                  <Text style={styles.muted}>暂无评论</Text>
                )
              }
              renderItem={({ item: c }) => (
                <View style={styles.cmt}>
                  <Text style={styles.cmtUser}>{c.author?.username || '用户'}</Text>
                  <Text style={styles.cmtBody}>{c.content}</Text>
                </View>
              )}
            />

            <View style={[styles.inputRow, { paddingBottom: bottomPad }]}>
              <TextInput
                style={styles.input}
                placeholder="写评论…"
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY,
    zIndex: 39,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  kb: { flex: 1 },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  handleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  list: { flex: 1, paddingHorizontal: space.md },
  cmt: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cmtUser: { fontSize: 13, fontWeight: '600', color: colors.primary },
  cmtBody: { marginTop: 4, fontSize: 15, color: colors.text },
  muted: { color: colors.textMuted, padding: space.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: space.md,
    paddingTop: 8,
    paddingBottom: 4,
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
});
