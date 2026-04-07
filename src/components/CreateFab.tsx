import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, space } from '../theme/colors';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/** 各列表页统一的「创建」加号：固定在右下角（含安全区与 Tab 栏避让） */
export default function CreateFab({ onPress, accessibilityLabel = '创建' }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const bottom = tabBarHeight + 12;
  const right = Math.max(insets.right, space.md);

  return (
    <TouchableOpacity
      style={[styles.fab, { bottom, right }]}
      activeOpacity={0.88}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name="add" size={34} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
