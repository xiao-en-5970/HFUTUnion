import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

/** 100% 为最小；最大 1000% = 10 倍 */
const MIN_SCALE = 1;
const MAX_SCALE = 10;

function clampPan(
  tx: number,
  ty: number,
  s: number,
  w: number,
  h: number,
): { tx: number; ty: number } {
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
 * 双指缩放（1×～10×）+ 放大后单指拖动；默认尺寸为最小缩放。
 * 缩放以双指中心（focalX/Y）为锚点：在默认「以视图中心为轴」的 scale 下，用平移补偿使视觉上绕两指中点缩放。
 * 使用 RN Animated + RNGH 旧式 Handler，避免 Reanimated/Worklets 启动期原生依赖。
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

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const baseScale = useRef(1);
  const scaleAtGestureStart = useRef(1);
  /** 捏合过程中上一帧的缩放值，用于增量计算锚点平移 */
  const pinchLastScaleRef = useRef(1);
  const savedTX = useRef(0);
  const savedTY = useRef(0);

  const [panEnabled, setPanEnabled] = useState(false);

  const applyPanClamp = (s: number) => {
    const { tx, ty } = clampPan(savedTX.current, savedTY.current, s, width, height);
    savedTX.current = tx;
    savedTY.current = ty;
    translateX.setValue(tx);
    translateY.setValue(ty);
  };

  useEffect(() => {
    baseScale.current = 1;
    scaleAtGestureStart.current = 1;
    pinchLastScaleRef.current = 1;
    savedTX.current = 0;
    savedTY.current = 0;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    setPanEnabled(false);
    onZoomChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅换图时重置手势状态
  }, [resetKey]);

  const onPinchGestureEvent = (e: PinchGestureHandlerGestureEvent) => {
    const fx = e.nativeEvent.focalX;
    const fy = e.nativeEvent.focalY;
    const cx = width / 2;
    const cy = height / 2;

    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, scaleAtGestureStart.current * e.nativeEvent.scale),
    );
    const prev = pinchLastScaleRef.current;
    if (prev > 0) {
      const factor = newScale / prev;
      savedTX.current += (fx - cx) * (1 - factor);
      savedTY.current += (fy - cy) * (1 - factor);
    }
    pinchLastScaleRef.current = newScale;
    scale.setValue(newScale);
    translateX.setValue(savedTX.current);
    translateY.setValue(savedTY.current);
  };

  const onPinchHandlerStateChange = (e: PinchGestureHandlerStateChangeEvent) => {
    const { state, scale: pinchScale } = e.nativeEvent;
    if (state === State.BEGAN) {
      scaleAtGestureStart.current = baseScale.current;
      pinchLastScaleRef.current = baseScale.current;
      onZoomChange?.(true);
    }
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, scaleAtGestureStart.current * pinchScale),
      );
      baseScale.current = next;
      pinchLastScaleRef.current = next;
      setPanEnabled(next > 1.01);

      if (next > 1.01) {
        applyPanClamp(next);
      }

      if (next <= 1.01) {
        savedTX.current = 0;
        savedTY.current = 0;
        translateX.setValue(0);
        translateY.setValue(0);
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
          friction: 7,
        }).start(() => {
          baseScale.current = 1;
          pinchLastScaleRef.current = 1;
          setPanEnabled(false);
          onZoomChange?.(false);
        });
      }
    }
  };

  const onPanGestureEvent = (e: PanGestureHandlerGestureEvent) => {
    if (baseScale.current <= 1.01) {
      return;
    }
    /** 放大倍数越高，平移阻尼越大，避免「拖一下飞太多」、更贴手 */
    const s = Math.max(baseScale.current, 1.01);
    const damp = 1 / Math.pow(s, 0.45);
    translateX.setValue(savedTX.current + e.nativeEvent.translationX * damp);
    translateY.setValue(savedTY.current + e.nativeEvent.translationY * damp);
  };

  const onPanHandlerStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState !== State.ACTIVE) {
      return;
    }
    if (baseScale.current <= 1.01) {
      return;
    }
    const s = Math.max(baseScale.current, 1.01);
    const damp = 1 / Math.pow(s, 0.45);
    let tx = savedTX.current + e.nativeEvent.translationX * damp;
    let ty = savedTY.current + e.nativeEvent.translationY * damp;
    const c = clampPan(tx, ty, s, width, height);
    tx = c.tx;
    ty = c.ty;
    savedTX.current = tx;
    savedTY.current = ty;
    translateX.setValue(tx);
    translateY.setValue(ty);
  };

  const animatedStyle = {
    transform: [{ scale }, { translateX }, { translateY }],
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      simultaneousHandlers={panRef}
      onGestureEvent={onPinchGestureEvent}
      onHandlerStateChange={onPinchHandlerStateChange}
    >
      <Animated.View style={[styles.fill, { width, height }, animatedStyle]}>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          enabled={panEnabled}
          onGestureEvent={onPanGestureEvent}
          onHandlerStateChange={onPanHandlerStateChange}
        >
          <Animated.View style={[styles.fill, { width, height }]}>
            {children}
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </PinchGestureHandler>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: 'hidden',
  },
});
