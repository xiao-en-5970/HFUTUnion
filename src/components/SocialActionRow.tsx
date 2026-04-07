import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, radius } from '../theme/colors';

function formatStatCount(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n)) || n < 0) {
    return '0';
  }
  if (n >= 10000) {
    return `${(n / 10000).toFixed(1)}万`;
  }
  return String(n);
}

type Props = {
  liked: boolean;
  collected: boolean;
  onLike: () => void;
  onCollect: () => void;
  /** 两个按钮之间的间距 */
  gap?: number;
  /** 传入则在「赞」「收藏」旁显示数量（与乐观更新后的 like_count / collect_count 同步） */
  likeCount?: number | null;
  collectCount?: number | null;
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
  likeCount,
  collectCount,
}: Props) {
  const showLikeNum = likeCount !== undefined && likeCount !== null;
  const showCollectNum = collectCount !== undefined && collectCount !== null;

  return (
    <View style={[styles.row, { gap }]}>
      <TouchableOpacity
        style={[styles.pill, liked ? styles.pillLikeOn : styles.pillOff]}
        onPress={onLike}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: liked }}
        accessibilityLabel={
          liked
            ? `已赞 ${showLikeNum ? formatStatCount(likeCount) : ''}，点击取消`
            : `点赞${showLikeNum ? `，当前 ${formatStatCount(likeCount)}` : ''}`
        }>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? '#fff' : colors.textSecondary}
        />
        <Text style={[styles.label, liked && styles.labelOn]}>赞</Text>
        {showLikeNum ? (
          <Text style={[styles.count, liked && styles.labelOn]}>
            {formatStatCount(likeCount)}
          </Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, collected ? styles.pillCollectOn : styles.pillOff]}
        onPress={onCollect}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: collected }}
        accessibilityLabel={
          collected
            ? `已收藏${showCollectNum ? ` ${formatStatCount(collectCount)}` : ''}，点击取消`
            : `收藏${showCollectNum ? `，当前 ${formatStatCount(collectCount)}` : ''}`
        }>
        <Ionicons
          name={collected ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={collected ? '#fff' : colors.textSecondary}
        />
        <Text style={[styles.label, collected && styles.labelOn]}>收藏</Text>
        {showCollectNum ? (
          <Text style={[styles.count, collected && styles.labelOn]}>
            {formatStatCount(collectCount)}
          </Text>
        ) : null}
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
  count: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
});
