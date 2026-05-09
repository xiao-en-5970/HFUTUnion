import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

/** 自然回正基线（pinch 松手会 spring 到这个值） */
const MIN_SCALE = 1;
/** 上界硬 clamp：超过这个倍数就不再继续放大（同时给手感反馈"已到极限"） */
const MAX_SCALE = 10;
/** 双击放大档位（未缩放时双击直接到这个倍数） */
const DOUBLE_TAP_SCALE = 2;
/** 视为"已缩放"的阈值——浮点比较留 1% 容差，避免缩放回 1.000003 时还判定为已缩放 */
const ZOOMED_EPS = 1.01;
/** 橡皮筋下界——pinch 过程允许实时显示到这个最小值，再小手势也不会让视图继续变小 */
const RUBBER_MIN_SCALE = 0.4;

/**
 * applyRubberBand 在缩放低于 1 时引入"橡皮筋阻尼"——iOS Photos 风格。
 *
 * 用户继续往内捏 → 视图继续缩小，但**越小阻力越大**，手指捏到 0.3 倍时视图大概只缩到 0.65 倍。
 * 松手会被 onPinchHandlerStateChange 的 ENDED 分支 spring 回 MIN_SCALE。
 *
 * 公式：raw < 1 时 displayed = 1 - sqrt(1 - raw) * dampFactor，
 *       sqrt 让"刚开始缩"还有线性手感，越深入阻力越强；
 *       hard floor RUBBER_MIN_SCALE 防止极端 pinch 把视图缩到 0.05 这种视觉灾难。
 */
function applyRubberBand(raw: number): number {
  if (raw >= MIN_SCALE) {
    return Math.min(MAX_SCALE, raw);
  }
  // raw < 1：进入橡皮筋
  const overshoot = MIN_SCALE - raw;        // (0, 1] 区间
  const damped = Math.sqrt(overshoot) * 0.55;
  const displayed = MIN_SCALE - damped;
  return Math.max(RUBBER_MIN_SCALE, displayed);
}

/**
 * clampPan 在屏幕坐标里把平移量约束到"图片不能拖出画面"的范围内。
 *
 * 推导：图被放大 s 倍后视觉宽度 = s*w；可向左/右各拖 (s*w - w)/2 = w*(s-1)/2 而仍能看到边。
 * 我们用 transform: [{ translateX }, { translateY }, { scale }]，矩阵是
 *   M = T(tx,ty) * S(s)
 * 一个图心点 (0,0) 经过 M 后落到 (tx, ty)——即 translate 直接是屏幕位移，
 * 与缩放无关。所以 clamp 直接限定 |tx| <= w*(s-1)/2、|ty| <= h*(s-1)/2 即可。
 *
 * s <= 1 的特殊情况：图视觉小于等于屏幕，"居中显示"才是合理行为，所以直接锁回 (0,0)；
 * 否则 (s-1) 是负数，公式会算出"反向 clamp"产生异常行为。
 */
function clampPan(
  tx: number,
  ty: number,
  s: number,
  w: number,
  h: number,
): { tx: number; ty: number } {
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

/**
 * 双指 pinch（1×～10×）+ 已缩放后单指拖动 + 双击放大/还原。
 *
 * 设计要点：
 *
 * 1) transform 顺序 = `[translateX, translateY, scale]`，对应矩阵 T*S。
 *    点 P 经过 T*S 后 = T(S*P) = s*P + (tx,ty)，即**translate 是屏幕坐标位移**，
 *    跟缩放倍率解耦。这样 pan 拖动可以做到 1:1 等比例（手指走多远图就走多远），
 *    不需要原来 1/s^0.45 的非线性 damp 补偿。
 *
 * 2) Pinch 锚点公式：要让屏幕上某点 (fx,fy) 在缩放前后位置不变，需满足
 *      tx' = tx + (fx - cx - tx) * (1 - s'/s)
 *    其中 cx = 视图中心（RN transform 默认 origin）。
 *    旧实现少了 -tx 项，跨多次 pinch 累积时锚点会漂移；这里修正。
 *
 * 3) 双击：未缩放（scale ≈ 1）→ 以双击点为锚放大到 DOUBLE_TAP_SCALE；
 *          已缩放（scale > 1）→ 平滑回正到 1。
 *
 * 4) 用 RN Animated + RNGH v2 的 ANN handler API（PinchGestureHandler 等），
 *    避免 Reanimated/Worklets 的原生依赖；spring 用 useNativeDriver:false
 *    因为 transform 同时作用 scale + translate，原生驱动会报"non-transform"。
 */
export default function ZoomableImageCanvas({
  width,
  height,
  resetKey,
  onZoomChange,
  children,
}: Props) {
  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);
  const doubleTapRef = useRef<TapGestureHandler>(null);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  /** 上一次手势结束后稳定的 scale；pan 时也根据它判断是否启用拖动 */
  const baseScale = useRef(1);
  /** pinch 开始那一刻的 scale，用于 e.scale * scaleAtGestureStart 计算新 scale */
  const scaleAtGestureStart = useRef(1);
  /** pinch 过程中上一帧 scale，用于增量算锚点 */
  const pinchLastScaleRef = useRef(1);
  /** 上一次手势结束后稳定的 translate */
  const savedTX = useRef(0);
  const savedTY = useRef(0);
  /** 防 spring 完成回调踩竞态：进了新的手势就把回调忽略 */
  const animTokenRef = useRef(0);

  const [panEnabled, setPanEnabled] = useState(false);

  const setZoomedState = useCallback(
    (s: number) => {
      const zoomed = s > ZOOMED_EPS;
      setPanEnabled(zoomed);
      onZoomChange?.(zoomed);
    },
    [onZoomChange],
  );

  useEffect(() => {
    animTokenRef.current++;
    baseScale.current = 1;
    scaleAtGestureStart.current = 1;
    pinchLastScaleRef.current = 1;
    savedTX.current = 0;
    savedTY.current = 0;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    setZoomedState(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅换图时重置手势状态
  }, [resetKey]);

  // ---------- Pinch ----------

  const onPinchGestureEvent = (e: PinchGestureHandlerGestureEvent) => {
    const fx = e.nativeEvent.focalX;
    const fy = e.nativeEvent.focalY;
    const cx = width / 2;
    const cy = height / 2;

    // raw 是用户手势"想要"的 scale；显示用 applyRubberBand 处理：
    //   - raw ≥ 1：直接用（上界 clamp 到 MAX_SCALE）
    //   - raw < 1：进入橡皮筋下界，越捏越费力且不超过 RUBBER_MIN_SCALE
    // 这样松手前用户就能看到"图变小"的反馈，松手再 spring 回 1（见 ENDED 分支）。
    const raw = scaleAtGestureStart.current * e.nativeEvent.scale;
    const newScale = applyRubberBand(raw);

    const prev = pinchLastScaleRef.current;
    if (prev > 0) {
      const factor = newScale / prev;
      // 锚点公式：tx' = tx + (fx - cx - tx) * (1 - s'/s)
      // 屏幕坐标视图下 translate 跟缩放解耦，这条公式让"焦点处图像内容"在屏幕上不动
      savedTX.current += (fx - cx - savedTX.current) * (1 - factor);
      savedTY.current += (fy - cy - savedTY.current) * (1 - factor);
    }
    pinchLastScaleRef.current = newScale;
    scale.setValue(newScale);
    translateX.setValue(savedTX.current);
    translateY.setValue(savedTY.current);
  };

  const onPinchHandlerStateChange = (e: PinchGestureHandlerStateChangeEvent) => {
    const { state, scale: pinchScale } = e.nativeEvent;
    if (state === State.BEGAN) {
      animTokenRef.current++;
      scaleAtGestureStart.current = baseScale.current;
      pinchLastScaleRef.current = baseScale.current;
      onZoomChange?.(true); // 立即关闭外层水平 swipe，防 pinch 过程中误触翻页
    }
    if (e.nativeEvent.oldState === State.ACTIVE) {
      // 松手时**不再用 Math.max(MIN_SCALE, ...)** 提前夹住——让"用户意图缩到 0.5x"也能进入
      // 下面的 else 分支触发 spring 回 1。仅上界依然硬 clamp 到 MAX_SCALE。
      const intended = scaleAtGestureStart.current * pinchScale;
      const next = Math.min(MAX_SCALE, intended);

      if (next > ZOOMED_EPS) {
        baseScale.current = next;
        pinchLastScaleRef.current = next;
        // 松手时把 translate 收进合法范围（pinch 过程不 clamp，让用户感觉自然，类似 iOS Photos）
        const c = clampPan(savedTX.current, savedTY.current, next, width, height);
        savedTX.current = c.tx;
        savedTY.current = c.ty;
        Animated.parallel([
          Animated.spring(translateX, { toValue: c.tx, useNativeDriver: false, friction: 7 }),
          Animated.spring(translateY, { toValue: c.ty, useNativeDriver: false, friction: 7 }),
        ]).start();
        setPanEnabled(true);
      } else {
        // next <= 1（含橡皮筋区间的 < 1 和正好 = 1 两种）→ 回弹基线：scale=1 + 平移归零
        savedTX.current = 0;
        savedTY.current = 0;
        const token = ++animTokenRef.current;
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 7 }),
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 7 }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: false, friction: 7 }),
        ]).start(() => {
          if (token !== animTokenRef.current) {
            return;
          }
          baseScale.current = 1;
          pinchLastScaleRef.current = 1;
          setZoomedState(1);
        });
      }
    }
  };

  // ---------- Pan ----------

  const onPanGestureEvent = (e: PanGestureHandlerGestureEvent) => {
    if (baseScale.current <= ZOOMED_EPS) {
      return;
    }
    // 1:1 等比例：手指 dx = 屏幕位移 dx；clamp 实时执行避免拖出边界出现"白边"再弹回
    const c = clampPan(
      savedTX.current + e.nativeEvent.translationX,
      savedTY.current + e.nativeEvent.translationY,
      baseScale.current,
      width,
      height,
    );
    translateX.setValue(c.tx);
    translateY.setValue(c.ty);
  };

  const onPanHandlerStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState !== State.ACTIVE) {
      return;
    }
    if (baseScale.current <= ZOOMED_EPS) {
      return;
    }
    const c = clampPan(
      savedTX.current + e.nativeEvent.translationX,
      savedTY.current + e.nativeEvent.translationY,
      baseScale.current,
      width,
      height,
    );
    savedTX.current = c.tx;
    savedTY.current = c.ty;
    translateX.setValue(c.tx);
    translateY.setValue(c.ty);
  };

  // ---------- Double Tap ----------

  const onDoubleTap = (e: TapGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state !== State.ACTIVE) {
      return;
    }
    const fx = e.nativeEvent.x;
    const fy = e.nativeEvent.y;
    const cx = width / 2;
    const cy = height / 2;
    const token = ++animTokenRef.current;

    if (baseScale.current > ZOOMED_EPS) {
      // 已缩放 → 双击复位到 1x，平移归零
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 7 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 7 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: false, friction: 7 }),
      ]).start(() => {
        if (token !== animTokenRef.current) {
          return;
        }
        baseScale.current = 1;
        pinchLastScaleRef.current = 1;
        savedTX.current = 0;
        savedTY.current = 0;
        setZoomedState(1);
      });
      return;
    }

    // 未缩放 → 以双击点为锚，spring 到 DOUBLE_TAP_SCALE
    const target = DOUBLE_TAP_SCALE;
    const factor = target / 1; // s' / s（s=1）
    const tx0 = savedTX.current; // 通常是 0
    const ty0 = savedTY.current;
    let newTx = tx0 + (fx - cx - tx0) * (1 - factor);
    let newTy = ty0 + (fy - cy - ty0) * (1 - factor);
    const c = clampPan(newTx, newTy, target, width, height);
    newTx = c.tx;
    newTy = c.ty;

    Animated.parallel([
      Animated.spring(scale, { toValue: target, useNativeDriver: false, friction: 7 }),
      Animated.spring(translateX, { toValue: newTx, useNativeDriver: false, friction: 7 }),
      Animated.spring(translateY, { toValue: newTy, useNativeDriver: false, friction: 7 }),
    ]).start(() => {
      if (token !== animTokenRef.current) {
        return;
      }
      baseScale.current = target;
      pinchLastScaleRef.current = target;
      savedTX.current = newTx;
      savedTY.current = newTy;
      setZoomedState(target);
    });
  };

  const animatedStyle = {
    transform: [{ translateX }, { translateY }, { scale }],
  };

  return (
    <TapGestureHandler
      ref={doubleTapRef}
      numberOfTaps={2}
      maxDelayMs={260}
      maxDist={20}
      simultaneousHandlers={[pinchRef, panRef]}
      onHandlerStateChange={onDoubleTap}>
      <Animated.View style={[styles.fill, { width, height }]}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={[panRef, doubleTapRef]}
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchHandlerStateChange}>
          <Animated.View style={[styles.fill, { width, height }, animatedStyle]}>
            <PanGestureHandler
              ref={panRef}
              simultaneousHandlers={[pinchRef, doubleTapRef]}
              enabled={panEnabled}
              onGestureEvent={onPanGestureEvent}
              onHandlerStateChange={onPanHandlerStateChange}>
              <Animated.View style={[styles.fill, { width, height }]}>
                {children}
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: 'hidden',
  },
});
