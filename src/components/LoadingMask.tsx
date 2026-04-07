import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  visible: boolean;
  /** 副文案，如「正在同步」 */
  hint?: string;
};

/** 首屏无缓存时的缓冲提示 */
export default function LoadingMask({ visible, hint = '加载中…' }: Props) {
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    zIndex: 50,
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
