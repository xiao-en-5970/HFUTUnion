import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Alert,
  StatusBar,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Gallery from 'react-native-awesome-gallery';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { originalImageUrl, thumbnailImageUrl } from '../utils/imageUrl';
import { downloadImageAsDataUrl } from '../utils/imageDownload';
import { saveRemoteImageToGallery } from '../utils/saveImageToGallery';

/**
 * OriginalImageViewer —— 原图预览模态框。
 *
 * 内部用 react-native-awesome-gallery 提供 pinch / pan / 双击 / 翻页 / swipe-to-close
 * 的现代体验。注意：**控件层（关闭、HD、进度条、下载按钮、页码）放在 Gallery 同级，
 * 不被 Gallery 缩放**——之前把控件放进 renderItem 里会跟着 transform 变大变模糊，
 * 是 UX bug。
 *
 * 状态分布：
 *   - per-uri 加载状态（thumb / fullDataUri / loading / progress …）由顶层维护，
 *     按 currentUri 决定哪些控件显示
 *   - Gallery 内部的 ViewerSlide 是纯展示组件，没有内部状态，只通过 props 接收
 *     图层数据 + 报告 image dims 给 Gallery
 */

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  /** 任意一张图地址（列表里多为 small，也可能已是原图） */
  uris: string[];
  initialIndex?: number;
};

type SlideState = {
  /** 当前应显示的缩略图 url（缩略图不存在时回落到原图本身） */
  thumbSrc: string;
  thumbMissing: boolean;
  /** 高清原图 dataURL，下载完成后填充；触发淡入动画 */
  fullDataUri: string | null;
  loading: boolean;
  progress: number;
  /** 服务器没回 Content-Length：进度条改用脉动条 */
  lengthUnknown: boolean;
  saving: boolean;
};

function makeInitState(uri: string, orig: string): SlideState {
  return {
    thumbSrc: thumbnailImageUrl(uri) || uri,
    thumbMissing: false,
    fullDataUri: null,
    loading: false,
    progress: 0,
    lengthUnknown: false,
    saving: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ViewerSlide：纯展示组件，被 Gallery renderItem 调用。
//
// 完全不含 per-uri 业务状态——thumb / full / 淡入 opacity 都从 props 接收。
// thumb / full 的 opacity Animated.Value 在本组件内 useRef，不影响其它图。
// ──────────────────────────────────────────────────────────────────────────────
function ViewerSlide({
  state,
  origUri,
  onThumbError,
  setImageDimensions,
}: {
  state: SlideState;
  /** 原图 url——thumb 加载失败时回落到这个 */
  origUri: string;
  onThumbError: () => void;
  setImageDimensions?: (dims: { width: number; height: number }) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const thumbTone = useRef(new Animated.Value(1)).current;
  const reportedDimsRef = useRef(false);

  // fullDataUri 出现时执行淡入；离开（如果出现重置场景）则归零
  useEffect(() => {
    if (state.fullDataUri) {
      Animated.parallel([
        Animated.timing(thumbTone, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [state.fullDataUri, fadeAnim, thumbTone]);

  // loading 变化时让 thumb 略变暗——给用户"正在加载原图"的视觉反馈
  useEffect(() => {
    Animated.timing(thumbTone, {
      toValue: state.loading ? 0.72 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [state.loading, thumbTone]);

  const handleThumbLoad = useCallback(
    (e: any) => {
      if (reportedDimsRef.current) return;
      const src = e?.nativeEvent?.source;
      if (src && src.width > 0 && src.height > 0) {
        reportedDimsRef.current = true;
        setImageDimensions?.({ width: src.width, height: src.height });
      }
    },
    [setImageDimensions],
  );

  return (
    <View style={styles.slide}>
      <View style={styles.zoomInner}>
        <Animated.View style={[styles.layer, { opacity: thumbTone }]}>
          <Image
            source={{ uri: state.thumbSrc }}
            style={styles.image}
            resizeMode="contain"
            onLoad={handleThumbLoad}
            onError={() => {
              if (!state.thumbMissing && state.thumbSrc !== origUri) {
                onThumbError();
              }
            }}
          />
        </Animated.View>
        {state.fullDataUri ? (
          <Animated.View style={[styles.layer, { opacity: fadeAnim }]}>
            <Image
              source={{ uri: state.fullDataUri }}
              style={styles.image}
              resizeMode="contain"
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 顶层控件层（无状态，按 props 渲染）——脉动条用 RN Animated。
//
// 只在加载中且 lengthUnknown=true 时跑 loop pulse；其它情况用普通进度条。
// ──────────────────────────────────────────────────────────────────────────────
function ProgressBar({
  loading,
  progress,
  lengthUnknown,
  insetsBottom,
}: {
  loading: boolean;
  progress: number;
  lengthUnknown: boolean;
  insetsBottom: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loading && lengthUnknown) {
      pulseLoopRef.current?.stop();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulse.setValue(0);
    }
    return () => pulseLoopRef.current?.stop();
  }, [loading, lengthUnknown, pulse]);

  if (!loading) return null;
  return (
    <View style={[styles.progressWrap, { paddingBottom: Math.max(insetsBottom, 12) }]}>
      <View style={styles.progressTrack}>
        {lengthUnknown ? (
          <Animated.View
            style={[
              styles.progressIndeterminate,
              {
                transform: [
                  {
                    translateX: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-120, 120],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : (
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        )}
      </View>
      <Text style={styles.progressLabel}>
        {lengthUnknown
          ? '加载原图中…'
          : `加载原图 ${Math.min(100, Math.round(progress * 100))}%`}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────────────────────────────────────
export default function OriginalImageViewer({
  visible,
  onRequestClose,
  uris,
  initialIndex = 0,
}: Props) {
  const { width: w, height: h } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(initialIndex);

  // 每张图原图 url（用 useMemo 锁定，避免重复计算）
  const origMap = useMemo(() => {
    const m: Record<string, string> = {};
    uris.forEach((u) => {
      m[u] = originalImageUrl(u) || u;
    });
    return m;
  }, [uris]);

  // per-uri 状态：所有 image-level 加载/缓存信息集中在这里
  const [perUri, setPerUri] = useState<Record<string, SlideState>>({});

  // 初始化或换 uri 列表时 reset；visible 切换无需重置（保留缓存）
  useEffect(() => {
    setPerUri(() => {
      const init: Record<string, SlideState> = {};
      uris.forEach((u) => {
        init[u] = makeInitState(u, origMap[u]);
      });
      return init;
    });
  }, [uris, origMap]);

  // visible 变化时重置当前页码
  useEffect(() => {
    if (visible) {
      setPage(Math.min(Math.max(0, initialIndex), Math.max(0, uris.length - 1)));
    }
  }, [visible, initialIndex, uris.length]);

  const updateSlide = useCallback((uri: string, patch: Partial<SlideState>) => {
    setPerUri((prev) => ({
      ...prev,
      [uri]: { ...(prev[uri] || makeInitState(uri, originalImageUrl(uri) || uri)), ...patch },
    }));
  }, []);

  // 触发"下载并淡入高清"——不阻塞 UI；进度通过 updateSlide 报告
  const loadOriginal = useCallback(
    async (uri: string) => {
      const orig = origMap[uri];
      if (!orig) return;
      updateSlide(uri, { loading: true, progress: 0, lengthUnknown: false });
      let unknownPrevLoaded = 0;
      try {
        const data = await downloadImageAsDataUrl(orig, ({ loaded, total }) => {
          if (total > 0) {
            updateSlide(uri, {
              lengthUnknown: false,
              progress: Math.min(1, loaded / total),
            });
          } else {
            const delta = loaded - unknownPrevLoaded;
            unknownPrevLoaded = loaded;
            // 用 functional update 防止快速回调相互覆盖
            setPerUri((prev) => {
              const cur = prev[uri];
              if (!cur) return prev;
              return {
                ...prev,
                [uri]: {
                  ...cur,
                  lengthUnknown: true,
                  progress: Math.min(
                    0.93,
                    cur.progress + Math.max(0.008, delta > 0 ? delta / (900 * 1024) : 0.015),
                  ),
                },
              };
            });
          }
        });
        updateSlide(uri, { fullDataUri: data, progress: 1 });
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '请重试', [
          { text: '取消', style: 'cancel' },
          {
            text: '重试',
            onPress: () => {
              loadOriginal(uri).catch(() => {});
            },
          },
        ]);
      } finally {
        updateSlide(uri, { loading: false });
      }
    },
    [origMap, updateSlide],
  );

  // 保存当前图到相册
  const onDownload = useCallback(
    async (uri: string) => {
      const cur = perUri[uri];
      if (!cur || cur.saving) return;
      const orig = origMap[uri];
      updateSlide(uri, { saving: true });
      try {
        await saveRemoteImageToGallery(orig, cur.fullDataUri);
        Alert.alert('已保存', '图片已保存到相册');
      } catch (e: any) {
        Alert.alert('保存失败', e?.message || '请重试');
      } finally {
        updateSlide(uri, { saving: false });
      }
    },
    [origMap, perUri, updateSlide],
  );

  // thumb 加载失败：回落到原图
  const onThumbError = useCallback(
    (uri: string) => {
      const orig = origMap[uri];
      updateSlide(uri, { thumbSrc: orig, thumbMissing: true });
    },
    [origMap, updateSlide],
  );

  if (!uris.length) return null;

  const currentUri = uris[Math.min(Math.max(0, page), uris.length - 1)] || '';
  const cur = perUri[currentUri];
  const orig = origMap[currentUri];
  const hasSeparateThumb = cur?.thumbSrc !== orig;
  const showHd =
    !!cur &&
    hasSeparateThumb &&
    !cur.thumbMissing &&
    !cur.fullDataUri &&
    !cur.loading &&
    !!orig;
  const footerLift = uris.length > 1 ? 36 : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent>
      <StatusBar hidden={visible} />
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.root}>
          {/* 关闭按钮（最高 zIndex，永远不被缩放） */}
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 6 }]}
            onPress={onRequestClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>

          {/* Gallery 负责 pinch / pan / 双击 / 翻页 / 下拉关闭。
              真正修复"pinch 松手瞬间移位"在 patches/react-native-awesome-gallery+0.4.3.patch
              里——库的 pinch onEnd 原本会强制把 translation.y 对齐回几何中心，
              是抖动来源。patch 改成"仅当真的越界才回弹"，pinch 松手保持原地。 */}
          <Gallery
            data={uris}
            initialIndex={initialIndex}
            onIndexChange={setPage}
            onSwipeToClose={onRequestClose}
            keyExtractor={(item, idx) => `${item}-${idx}`}
            doubleTapScale={2}
            maxScale={6}
            renderItem={({ item, setImageDimensions }) => {
              const s = perUri[item] || makeInitState(item, origMap[item]);
              return (
                <ViewerSlide
                  state={s}
                  origUri={origMap[item]}
                  onThumbError={() => onThumbError(item)}
                  setImageDimensions={setImageDimensions}
                />
              );
            }}
            style={{ width: w, height: h }}
          />

          {/* HD 按钮（仅在当前页有缩略图、未加载原图时显示） */}
          {showHd ? (
            <TouchableOpacity
              style={[styles.hdBtn, { top: insets.top + 8 }]}
              onPress={() => loadOriginal(currentUri).catch(() => {})}
              activeOpacity={0.88}>
              <Ionicons name="expand-outline" size={18} color="#fff" />
              <Text style={styles.hdBtnText}>查看原图</Text>
            </TouchableOpacity>
          ) : null}

          {/* 进度条 */}
          {cur ? (
            <ProgressBar
              loading={cur.loading}
              progress={cur.progress}
              lengthUnknown={cur.lengthUnknown}
              insetsBottom={insets.bottom}
            />
          ) : null}

          {/* 下载按钮 */}
          <TouchableOpacity
            style={[
              styles.downloadFab,
              { bottom: Math.max(insets.bottom, 10) + footerLift },
            ]}
            onPress={() => {
              onDownload(currentUri).catch(() => {});
            }}
            disabled={cur?.saving}
            activeOpacity={0.85}
            accessibilityLabel="保存原图到相册">
            {cur?.saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>

          {/* 页码指示器 */}
          {uris.length > 1 ? (
            <View style={[styles.dots, { bottom: Math.max(insets.bottom, 16) }]}>
              <Text style={styles.dotText}>
                {page + 1} / {uris.length}
              </Text>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  zoomInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 20,
    left: 12,
    padding: 4,
  },
  slide: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  hdBtn: {
    position: 'absolute',
    zIndex: 15,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,118,110,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  hdBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  progressWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingTop: 10,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  progressIndeterminate: {
    width: '40%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.95,
  },
  progressLabel: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  downloadFab: {
    position: 'absolute',
    right: 12,
    zIndex: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
