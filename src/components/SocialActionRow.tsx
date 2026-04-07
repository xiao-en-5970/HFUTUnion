import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, radius } from '../theme/colors';

type Props = {
  liked: boolean;
  collected: boolean;
  onLike: () => void;
  onCollect: () => void;
  /** 两个按钮之间的间距 */
  gap?: number;
};

/**
 * 点赞 / 收藏：未选中为线框灰字；选中为实心主色底 + 白字白图标。
 */
export default function SocialActionRow({
  liked,
  collected,
  onLike,
  onCollect,
  gap = 12,
}: Props) {
  return (
    <View style={[styles.row, { gap }]}>
      <TouchableOpacity
        style={[styles.pill, liked ? styles.pillLikeOn : styles.pillOff]}
        onPress={onLike}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: liked }}
        accessibilityLabel={liked ? '已赞，点击取消' : '点赞'}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? '#fff' : colors.textSecondary}
        />
        <Text style={[styles.label, liked && styles.labelOn]}>赞</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, collected ? styles.pillCollectOn : styles.pillOff]}
        onPress={onCollect}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: collected }}
        accessibilityLabel={collected ? '已收藏，点击取消' : '收藏'}>
        <Ionicons
          name={collected ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={collected ? '#fff' : colors.textSecondary}
        />
        <Text style={[styles.label, collected && styles.labelOn]}>收藏</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  pillLikeOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillCollectOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelOn: {
    color: '#fff',
  },
});
