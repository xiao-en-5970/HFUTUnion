import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { colors, space } from '../theme/colors';

type Props = {
  /** true：校外可见；false：仅本校可见 */
  widePublic: boolean;
  onWidePublicChange: (v: boolean) => void;
};

/** 发帖/求助可见范围开关 */
export default function ArticleVisibilityRow({
  widePublic,
  onWidePublicChange,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>是否校外可见</Text>
          <Text style={styles.hint}>
            {widePublic
              ? '已开启：其他学校用户也可以看到这条内容'
              : '未开启：仅本校认证用户可见'}
          </Text>
        </View>
        <Switch value={widePublic} onValueChange={onWidePublicChange} />
      </View>
      <Text style={styles.meta}>发布后不可修改可见范围</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
  },
});
