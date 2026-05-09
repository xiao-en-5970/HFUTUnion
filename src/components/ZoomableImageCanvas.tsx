import React, { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

/**
 * ZoomableImageCanvas —— 主流"图片预览"手势：
 *
 *   - 双指 pinch 缩放（以双指中点为锚 + 中点移动跟手平移，跟 iOS Photos 完全一致）
 *   - 已放大后单指 pan 拖动（1:1 等比，到边停）
 *   - 双击 1x ↔ 2x 切换
 *   - 缩到 < 1x 橡皮筋松手回正
 *
 * 实现栈：reanimated v4 sharedValue + react-native-gesture-handler v2 Gesture API。
 * 整套手势计算运行在 UI 线程的 worklet 里，scale / translateX / translateY 同帧 commit。
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 关键设计决定：pinch 跟 pan 用 Gesture.Race 互斥（不是 Simultaneous）
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 之前的 Simultaneous(pinch, pan) 让两者并行，导致 bug：
 *   - pan 用 e.translationX（自手指落下累积位移）写 translate
 *   - pinch 用焦点公式写 translate
 *   - 同帧两者都写 sharedValue，肉眼上图像分裂、飞向两根手指
 *
 * Race 后只有先识别的赢：
 *   - 单指拖（minDistance 触发）→ pan 赢
 *   - 双指落下 → pinch 立刻识别（无需 minDistance），pan 取消
 *
 * 跟手平移（双指中点移动）已经在 pinch onUpdate 内部实现（`panTX = focalNow - focalStart`），
 * **不需要** pan 同时参与；pan 只服务"放大后单指拖"这个独立场景。
 *
 * 代价：用户单指 pan 一半再加第二指要 pinch 时，pinch 不会触发——必须先抬手再双指捏。
 * 这个 trade-off 主流图片预览也都接受（包括 Instagram / iOS Photos 内部的 stable 模式）。
 */

const MIN_SCALE = 1;
const MAX_SCALE = 10;
const DOUBLE_TAP_SCALE = 2;
const ZOOMED_EPS = 1.01;
const RUBBER_MIN_SCALE = 0.4;

/** 弹簧参数——风格统一，配合 mass=1 默认值，体感跟 iOS Photos 接近 */
const SPRING_CONFIG = { damping: 20, stiffness: 180, mass: 1 } as const;

/** 浮点亚像素容差——肉眼 < 0.5px 移动不可察觉，认为相等就不启动 spring */
const PIXEL_EPS = 0.5;

/**
 * applyRubberBand 在缩放低于 1 时引入"橡皮筋阻尼"——iOS Photos 风格。
 * raw < 1 时 displayed = 1 - sqrt(1 - raw) * 0.55，越深入阻力越强。
 * hard floor RUBBER_MIN_SCALE 防止极端 pinch 缩到 0.05 这种灾难。
 */
function applyRubberBand(raw: number): number {
  'worklet';
  if (raw >= MIN_SCALE) {
    return Math.min(MAX_SCALE, raw);
  }
  const overshoot = MIN_SCALE - raw;
  const damped = Math.sqrt(overshoot) * 0.55;
  const displayed = MIN_SCALE - damped;
  return Math.max(RUBBER_MIN_SCALE, displayed);
}

/**
 * clampPan 把平移量约束到"图片不能拖出画面"的范围内。
 *
 * transform = `[translateX, translateY, scale]`（origin = view center）：
 *   P_screen = (P_image - center) * s + center + (tx, ty)
 * 即 translate 直接是屏幕坐标位移，跟 scale 解耦。
 * 图缩放 s 倍后视觉宽度 = s*w，tx 合法区间 = ±w*(s-1)/2。
 *
 * s ≤ 1 时图视觉小于等于屏幕，居中显示，translate 锁回 (0,0)。
 */
function clampPan(
  tx: number,
  ty: number,
  s: number,
  w: number,
  h: number,
): { tx: number; ty: number } {
  'worklet';
  if (s <= 1) {
    return { tx: 0, ty: 0 };
  }
  const maxX = (w * (s - 1)) / 2;
  const maxY = (h * (s - 1)) / 2;
  return {
    tx: Math.max(-maxX, Math.min(maxX, tx)),
    ty: Math.max(-maxY, Math.min(maxY, ty)),
  };
}

type Props = {
  width: number;
  height: number;
  /** 变化时重置缩放（如换图） */
  resetKey: string | number;
  onZoomChange?: (zoomed: boolean) => void;
  children: React.ReactNode;
};

export default function ZoomableImageCanvas({
  width,
  height,
  resetKey,
  onZoomChange,
  children,
}: Props) {
  // 当前帧的实时变换值（直接绑到 transform）
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // 上一次手势结束后稳定的"基线"值——下次 pinch/pan 都基于它叠加
  const baseScale = useSharedValue(1);
  const baseTX = useSharedValue(0);
  const baseTY = useSharedValue(0);

  // pinch onStart 一次性锁定的起始焦点（屏幕坐标）。pinch 过程中 e.focalX/Y 每帧变化，
  // 但锚点公式只依赖"起始焦点 + 起始 baseTX"，避免双指中点微抖被无限放大。
  const focalStartX = useSharedValue(0);
  const focalStartY = useSharedValue(0);

  // 桥接 worklet → JS：通知外层"是否已放大"以便关闭水平 swipe 翻页。
  const notifyZoomed = useCallback(
    (zoomed: boolean) => {
      onZoomChange?.(zoomed);
    },
    [onZoomChange],
  );

  // 换图时重置所有共享值（停止任何进行中的 spring）
  useEffect(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    baseScale.value = 1;
    baseTX.value = 0;
    baseTY.value = 0;
    onZoomChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 resetKey 触发
  }, [resetKey]);

  // ───────────────────────── Pinch（缩放 + 跟手平移）─────────────────────────
  //
  // 数学模型（origin = view center, transform = T*S）：
  //   P_screen = (P_image - center) * s + center + (tx, ty)
  //
  // 不变性："f0_screen 处的图像内容"在 pinch 全过程中始终落在当前焦点 f_now：
  //   (f0 - center - t0) / s0 = (f_now - center - t_now) / s_now
  // ⇒ t_now = f_now - center - (s_now/s0) * (f0 - center - t0)
  //
  // 这条公式同时实现：
  //   1) 缩放锚点：f0 处图像不动 → "对哪两根手指捏，那一点就在原地放大"
  //   2) 跟手平移：双指中点 f0 → f_now，等于把图整体挪 (f_now - f0) 像素
  //
  // 每帧绝对值计算（不依赖上一帧的 savedTX 累加），fx 微抖不会被多帧放大。
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      'worklet';
      focalStartX.value = e.focalX;
      focalStartY.value = e.focalY;
      runOnJS(notifyZoomed)(true);
    })
    .onUpdate((e) => {
      'worklet';
      const cx = width / 2;
      const cy = height / 2;
      const raw = baseScale.value * e.scale;
      const newScale = applyRubberBand(raw);
      const factor = baseScale.value > 0 ? newScale / baseScale.value : 1;

      // 三个 sharedValue 在同一个 worklet 同帧赋值，绝对不会撕裂
      scale.value = newScale;
      translateX.value =
        e.focalX - cx - factor * (focalStartX.value - cx - baseTX.value);
      translateY.value =
        e.focalY - cy - factor * (focalStartY.value - cy - baseTY.value);
    })
    .onEnd(() => {
      'worklet';
      // 直接用 onUpdate 最后一帧的可视值，不重算——避免跟 e.scale 微小偏差导致松手移位
      const finalScale = scale.value;

      if (finalScale > ZOOMED_EPS) {
        // 保持放大状态——base 立刻锁定到当前显示值，spring 仅用于"边界橡皮筋回弹"
        const c = clampPan(translateX.value, translateY.value, finalScale, width, height);
        baseScale.value = finalScale;
        baseTX.value = c.tx;
        baseTY.value = c.ty;
        // 仅当 translate 真的越界（差异 > 0.5px）才启动 spring 回弹；亚像素差异保持原位
        if (Math.abs(c.tx - translateX.value) > PIXEL_EPS) {
          translateX.value = withSpring(c.tx, SPRING_CONFIG);
        }
        if (Math.abs(c.ty - translateY.value) > PIXEL_EPS) {
          translateY.value = withSpring(c.ty, SPRING_CONFIG);
        }
        runOnJS(notifyZoomed)(true);
      } else {
        // < 1 或恰好 1 → 弹回 1.0 + 居中
        // base 立刻同步成 1，spring 是视觉过渡；下次 pinch 起点是 1，不会出现"动画途中
        // pinch 起点是 0.6"的怪异感
        baseScale.value = 1;
        baseTX.value = 0;
        baseTY.value = 0;
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(notifyZoomed)(false);
      }
    });

  // ───────────────────────── Pan（已放大后单指拖动）─────────────────────────
  //
  // Race 已经保证 pinch 期间 pan 不会被识别，所以这里**不再需要** pinchActive 守卫
  // 和 numberOfPointers 检查——逻辑回归到最纯粹的"baseScale > 1 时 1:1 跟手"。
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      'worklet';
      if (baseScale.value <= ZOOMED_EPS) {
        return;
      }
      const c = clampPan(
        baseTX.value + e.translationX,
        baseTY.value + e.translationY,
        baseScale.value,
        width,
        height,
      );
      translateX.value = c.tx;
      translateY.value = c.ty;
    })
    .onEnd(() => {
      'worklet';
      if (baseScale.value <= ZOOMED_EPS) {
        return;
      }
      // 把当前可见 translate 固化进基线
      baseTX.value = translateX.value;
      baseTY.value = translateY.value;
    });

  // ───────────────────────── Double Tap（1x ↔ 2x）─────────────────────────
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .maxDistance(20)
    .onEnd((e) => {
      'worklet';
      const cx = width / 2;
      const cy = height / 2;

      if (baseScale.value > ZOOMED_EPS) {
        // 已放大 → 一键复位
        baseScale.value = 1;
        baseTX.value = 0;
        baseTY.value = 0;
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(notifyZoomed)(false);
        return;
      }

      // 未放大 → 以双击点为锚放大到 DOUBLE_TAP_SCALE
      const target = DOUBLE_TAP_SCALE;
      const newTX = e.x - cx - target * (e.x - cx);
      const newTY = e.y - cy - target * (e.y - cy);
      const c = clampPan(newTX, newTY, target, width, height);
      baseScale.value = target;
      baseTX.value = c.tx;
      baseTY.value = c.ty;
      scale.value = withSpring(target, SPRING_CONFIG);
      translateX.value = withSpring(c.tx, SPRING_CONFIG);
      translateY.value = withSpring(c.ty, SPRING_CONFIG);
      runOnJS(notifyZoomed)(true);
    });

  // 三者互斥：先识别的赢，其余取消。
  //
  // doubleTap 跟 pan 看似冲突（双击瞬间也会有微小手指移动），靠 doubleTap.maxDistance(20)
  // 卡住——20px 内的两次 tap 优先认 doubleTap，超出 20px 才让 pan 接管。
  //
  // pinch 不需要任何 minDistance 兜底——双指落下瞬间 RNGH 就 begin 状态，
  // 跟单指 pan 先识别的可能性几乎为 0；如果用户单指 pan 一半再加第二指，pan 会保持
  // 锁定，不会切换到 pinch（这是 Race 行为；主流图片预览也都这样）。
  const composed = Gesture.Race(doubleTap, pinch, pan);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.fill, { width, height }, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: 'hidden',
  },
});
