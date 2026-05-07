import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../theme/colors';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  /** 业务上禁用按钮（如冷却中、表单未填）；视觉上变灰，点击不触发 */
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  style?: ViewStyle;
};

export default function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
}: Props) {
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';
  const isInactive = !!loading || !!disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isInactive}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isOutline && styles.outline,
        isGhost && styles.ghost,
        style,
        disabled && !loading && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.primary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.text,
            isOutline && styles.textOutline,
            isGhost && styles.textGhost,
            disabled && styles.textDisabled,
          ]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
  textOutline: { color: colors.primary },
  textGhost: { color: colors.primary, fontWeight: '500' },
  disabled: { opacity: 0.5 },
  textDisabled: { color: '#fff' },
});
