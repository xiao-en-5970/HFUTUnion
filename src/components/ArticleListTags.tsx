import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, space } from '../theme/colors';

/** 与后端 constant.ArticleType 一致 */
export const ARTICLE_TYPE_POST = 1;
export const ARTICLE_TYPE_QUESTION = 2;
export const ARTICLE_TYPE_ANSWER = 3;

export type ArticleListKind = 'post' | 'question' | 'answer';

export function articleTypeToKind(t?: number | null): ArticleListKind {
  if (t === ARTICLE_TYPE_QUESTION) {
    return 'question';
  }
  if (t === ARTICLE_TYPE_ANSWER) {
    return 'answer';
  }
  return 'post';
}

const KIND_LABEL: Record<ArticleListKind, string> = {
  post: '帖子',
  question: '求助',
  answer: '回答',
};

/** 每类内容一套独立配色，帖子/求助/回答在混排列表里一眼可分 */
const KIND_STYLES: Record<
  ArticleListKind,
  { bg: string; border: string; text: string }
> = {
  post: { bg: colors.primaryLight, border: '#99F6E4', text: colors.primary },
  question: { bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' },
  answer: { bg: '#F3E8FF', border: '#E9D5FF', text: '#7C3AED' },
};

type Props = {
  /** 后端 type：1 帖子 2 求助(question) 3 回答 */
  articleType?: number | null;
  /** 若已知列表类型，可直传，优先于 articleType */
  kind?: ArticleListKind;
  /** 0 / null 为全站可见；>0 为本校隔离 */
  schoolId?: number | null;
  /** 更紧凑的间距（卡片内第一行） */
  compact?: boolean;
};

/**
 * 列表卡片用小标签标注：内容类型（帖/问/答）+ 可见范围（全站/本校）。
 */
export default function ArticleListTags({
  articleType,
  kind: kindProp,
  schoolId,
  compact,
}: Props) {
  const kind = kindProp ?? articleTypeToKind(articleType ?? undefined);
  const typeLabel = KIND_LABEL[kind];
  const kindStyle = KIND_STYLES[kind];

  let scopeLabel: string | null = null;
  let scopeVariant: 'wide' | 'school' | null = null;
  if (schoolId !== undefined) {
    if (schoolId === 0 || schoolId === null) {
      scopeLabel = '全站';
      scopeVariant = 'wide';
    } else {
      scopeLabel = '本校';
      scopeVariant = 'school';
    }
  }

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View
        style={[
          styles.pill,
          { backgroundColor: kindStyle.bg, borderColor: kindStyle.border },
        ]}>
        <Text style={[styles.pillKindText, { color: kindStyle.text }]}>
          {typeLabel}
        </Text>
      </View>
      {scopeLabel != null && scopeVariant != null ? (
        <View
          style={[
            styles.pill,
            scopeVariant === 'wide' ? styles.pillWide : styles.pillSchool,
          ]}>
          <Text
            style={
              scopeVariant === 'wide' ? styles.pillWideText : styles.pillSchoolText
            }>
            {scopeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.sm,
  },
  rowCompact: {
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillKindText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pillWide: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  pillWideText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  pillSchool: {
    backgroundColor: '#F3F4F6',
    borderColor: colors.border,
  },
  pillSchoolText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
