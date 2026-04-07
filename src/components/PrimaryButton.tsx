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
  variant?: 'primary' | 'outline' | 'ghost';
  style?: ViewStyle;
};

export default function PrimaryButton({
  title,
  onPress,
  loading,
  variant = 'primary',
  style,
}: Props) {
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isOutline && styles.outline,
        isGhost && styles.ghost,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.primary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.text,
            isOutline && styles.textOutline,
            isGhost && styles.textGhost,
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
});
