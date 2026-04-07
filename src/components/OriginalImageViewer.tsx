import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
  StatusBar,
  Easing,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomableImageCanvas from './ZoomableImageCanvas';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { originalImageUrl, thumbnailImageUrl } from '../utils/imageUrl';
import { downloadImageAsDataUrl } from '../utils/imageDownload';
import { saveRemoteImageToGallery } from '../utils/saveImageToGallery';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  /** 任意一张图地址（列表里多为 small，也可能已是原图） */
  uris: string[];
  initialIndex?: number;
};

function ViewerSlide({
  uri,
  onZoomChange,
  footerLift = 0,
}: {
  uri: string;
  onZoomChange?: (zoomed: boolean) => void;
  /** 底部有分页指示器时上移，避免重叠 */
  footerLift?: number;
}) {
  const { width: slideWidth, height: slideHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const orig = useMemo(() => originalImageUrl(uri) || uri, [uri]);
  const thumbPreferred = useMemo(() => thumbnailImageUrl(uri) || uri, [uri]);

  const [thumbSrc, setThumbSrc] = useState(thumbPreferred);
  const [thumbMissing, setThumbMissing] = useState(false);
  const [fullDataUri, setFullDataUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lengthUnknown, setLengthUnknown] = useState(false);
  const [saving, setSaving] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const thumbTone = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const saveBusyRef = useRef(false);

  useEffect(() => {
    setThumbSrc(thumbPreferred);
    setThumbMissing(false);
    setFullDataUri(null);
    setLoading(false);
    setProgress(0);
    setLengthUnknown(false);
    setSaving(false);
    saveBusyRef.current = false;
    fadeAnim.setValue(0);
    thumbTone.setValue(1);
    pulse.setValue(0);
  }, [uri, thumbPreferred, fadeAnim, thumbTone, pulse]);

  const onDownload = useCallback(async () => {
    if (!orig || saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    setSaving(true);
    try {
      await saveRemoteImageToGallery(orig, fullDataUri);
      Alert.alert('已保存', '图片已保存到相册');
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请重试');
    } finally {
      saveBusyRef.current = false;
      setSaving(false);
    }
  }, [orig, fullDataUri]);

  const hasSeparateThumb = thumbPreferred !== orig;

  const showHdButton =
    hasSeparateThumb &&
    !thumbMissing &&
    !fullDataUri &&
    !loading &&
    orig.length > 0;

  const startPulse = useCallback(() => {
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
  }, [pulse]);

  useEffect(() => {
    if (loading && lengthUnknown) {
      startPulse();
    } else {
      pulseLoopRef.current?.stop();
      pulse.setValue(0);
    }
    return () => pulseLoopRef.current?.stop();
  }, [loading, lengthUnknown, startPulse, pulse]);

  const unknownPrevLoadedRef = useRef(0);

  const loadOriginal = useCallback(async () => {
    if (!orig) {
      return;
    }
    unknownPrevLoadedRef.current = 0;
    setLoading(true);
    setProgress(0);
    setLengthUnknown(false);
    Animated.timing(thumbTone, {
      toValue: 0.72,
      duration: 220,
      useNativeDriver: true,
    }).start();
    try {
      const data = await downloadImageAsDataUrl(orig, ({ loaded, total }) => {
        if (total > 0) {
          setLengthUnknown(false);
          setProgress(Math.min(1, loaded / total));
        } else {
          setLengthUnknown(true);
          const prev = unknownPrevLoadedRef.current;
          unknownPrevLoadedRef.current = loaded;
          const delta = loaded - prev;
          setProgress((p) =>
            Math.min(0.93, p + Math.max(0.008, delta > 0 ? delta / (900 * 1024) : 0.015)),
          );
        }
      });
      setFullDataUri(data);
      setProgress(1);
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
    } catch (e: any) {
      Animated.timing(thumbTone, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Alert.alert('加载失败', e?.message || '请重试', [
        { text: '取消', style: 'cancel' },
        { text: '重试', onPress: () => loadOriginal().catch(() => {}) },
      ]);
    } finally {
      setLoading(false);
    }
  }, [orig, thumbTone, fadeAnim]);

  return (
    <View style={[styles.slide, { width: slideWidth, height: slideHeight }]}>
      <ZoomableImageCanvas
        width={slideWidth}
        height={slideHeight}
        resetKey={uri}
        onZoomChange={onZoomChange}>
        <View style={styles.zoomInner}>
          <Animated.View style={[styles.layer, { opacity: thumbTone }]}>
            <Image
              source={{ uri: thumbSrc }}
              style={styles.image}
              resizeMode="contain"
              onError={() => {
                if (!thumbMissing && thumbSrc !== orig) {
                  setThumbSrc(orig);
                  setThumbMissing(true);
                }
              }}
            />
          </Animated.View>
          {fullDataUri ? (
            <Animated.View style={[styles.layer, { opacity: fadeAnim }]}>
              <Image source={{ uri: fullDataUri }} style={styles.image} resizeMode="contain" />
            </Animated.View>
          ) : null}
        </View>
      </ZoomableImageCanvas>

      {showHdButton ? (
        <TouchableOpacity
          style={[styles.hdBtn, { top: insets.top + 8 }]}
          onPress={() => loadOriginal().catch(() => {})}
          activeOpacity={0.88}>
          <Ionicons name="expand-outline" size={18} color="#fff" />
          <Text style={styles.hdBtnText}>查看原图</Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={[styles.progressWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
            {lengthUnknown ? '加载原图中…' : `加载原图 ${Math.min(100, Math.round(progress * 100))}%`}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.downloadFab,
          { bottom: Math.max(insets.bottom, 10) + footerLift },
        ]}
        onPress={() => {
          onDownload().catch(() => {});
        }}
        disabled={saving}
        activeOpacity={0.85}
        accessibilityLabel="保存原图到相册">
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="download-outline" size={22} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function OriginalImageViewer({
  visible,
  onRequestClose,
  uris,
  initialIndex = 0,
}: Props) {
  const { width: w, height: h } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(initialIndex);
  const [hScrollEnabled, setHScrollEnabled] = useState(true);

  const onZoom = useCallback((zoomed: boolean) => {
    setHScrollEnabled(!zoomed);
  }, []);

  useEffect(() => {
    if (!visible) {
      setHScrollEnabled(true);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const i = Math.min(Math.max(0, initialIndex), Math.max(0, uris.length - 1));
      setPage(i);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: i * w, animated: false });
      });
    }
  }, [visible, initialIndex, uris.length, w, h]);

  if (!uris.length) {
    return null;
  }

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
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 6 }]}
            onPress={onRequestClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>

          <ScrollView
            ref={scrollRef}
            style={{ height: h }}
            horizontal
            pagingEnabled
            scrollEnabled={hScrollEnabled}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const i = Math.round(x / w);
              setPage(Math.min(Math.max(0, i), uris.length - 1));
            }}>
            {uris.map((u, idx) => (
              <View key={`${u}-${idx}`} style={{ width: w, height: h }}>
                <ViewerSlide
                  uri={u}
                  onZoomChange={onZoom}
                  footerLift={uris.length > 1 ? 36 : 0}
                />
              </View>
            ))}
          </ScrollView>

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
