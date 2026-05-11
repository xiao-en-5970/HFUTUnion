// AuthorChip —— 通用的"作者卡片"：头像 + 昵称 +（可选）QQ 智能体 tag，整体可点击跳 UserProfile。
//
// 使用场景：
//   - 详情页顶部"作者" 行
//   - 评论 / 回复行的发表者 / 被回复人
//   - 通知列表里的"X 赞了你"中的 X
//   - 列表卡片上的作者占位
//
// 设计原则：
//   - 自带跳转——传 `author.id` 后单击头像或名字都跳 UserProfile（除非 disableNav=true）
//   - 多档尺寸——"sm"（评论行 28x28）/ "md"（详情页 36x36）/ 自定义 avatarSize
//   - 名字单独 wrap 一层是为了让"点头像或名字"都生效——TouchableOpacity 的 touch area
//   - 旗下号用 11px 蓝色 "QQ" 小标签，区分但不抢镜
import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors } from '../theme/colors';
import { formatAuthorName, isQQChildAuthor, type AuthorBrief } from '../utils/authorName';
import type { RootStackParamList } from '../navigation/RootStack';

const defaultAvatar = require('../assets/default-avatar.png');

type Size = 'xs' | 'sm' | 'md' | 'lg';

const AVATAR_PX: Record<Size, number> = { xs: 20, sm: 28, md: 36, lg: 48 };
const NAME_PX: Record<Size, number> = { xs: 12, sm: 13, md: 14, lg: 16 };

type Props = {
  author?: AuthorBrief | null;
  size?: Size;
  /** 强行覆盖头像大小（不走预设 size） */
  avatarSize?: number;
  /** 名字字号 */
  nameSize?: number;
  /** 名字颜色覆盖（默认正文颜色） */
  nameColor?: string;
  /** false = 横排（默认） true = 仅显示名字不含头像 */
  nameOnly?: boolean;
  /** 自定义 fallback 名字 */
  fallback?: string;
  /** 是否展示 "QQ" 旗下号 tag（默认 true） */
  showQQTag?: boolean;
  /** 自定义副标题（如时间 / 浏览量）——名字下方一行 */
  subtitle?: string;
  /** 禁用跳转（如卡片本身是个大的 touchable，避免事件穿透） */
  disableNav?: boolean;
  /** 跳转后调用方自定义额外回调 */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  nameStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export default function AuthorChip({
  author,
  size = 'sm',
  avatarSize,
  nameSize,
  nameColor,
  nameOnly,
  fallback,
  showQQTag = true,
  subtitle,
  disableNav,
  onPress,
  style,
  nameStyle,
  numberOfLines = 1,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const name = formatAuthorName(author, fallback);
  const isQQ = isQQChildAuthor(author);
  const avatarPx = avatarSize ?? AVATAR_PX[size];
  const namePx = nameSize ?? NAME_PX[size];
  const uid = author?.id;

  const goProfile = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (disableNav) return;
    if (uid && uid > 0) {
      navigation.navigate('UserProfile', { userId: uid });
    }
  };

  const nameContent = (
    <View style={styles.nameWrap}>
      <Text
        numberOfLines={numberOfLines}
        style={[
          { fontSize: namePx, color: nameColor ?? colors.text, fontWeight: '600' },
          nameStyle,
        ]}>
        {name}
      </Text>
      {showQQTag && isQQ ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>QQ</Text>
        </View>
      ) : null}
    </View>
  );

  if (nameOnly) {
    return (
      <TouchableOpacity activeOpacity={uid ? 0.6 : 1} onPress={goProfile} style={style}>
        {nameContent}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={uid ? 0.7 : 1}
      onPress={goProfile}
      style={[styles.row, style]}>
      <Image
        source={author?.avatar ? { uri: author.avatar } : defaultAvatar}
        style={{ width: avatarPx, height: avatarPx, borderRadius: avatarPx / 2, backgroundColor: colors.bg }}
      />
      <View style={styles.textBlock}>
        {nameContent}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textBlock: { flexShrink: 1, gap: 2 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#CFFAFE',
  },
  tagText: { fontSize: 10, color: '#0E7490', fontWeight: '700' },
  subtitle: { fontSize: 11, color: colors.textMuted },
});
