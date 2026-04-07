import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const DURATION_MS = 280;
const ENTER_OFFSET_Y = 12;

/**
 * 底部 Tab 切换：从其它 Tab 回到本页时做淡入 + 轻微上滑（冷启动首次进入不播，避免闪屏）。
 */
export default function TabTransitionContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const isFocused = useIsFocused();
  const prevFocused = useRef(isFocused);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused && !prevFocused.current) {
      opacity.setValue(0);
      translateY.setValue(ENTER_OFFSET_Y);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevFocused.current = isFocused;
  }, [isFocused, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});
