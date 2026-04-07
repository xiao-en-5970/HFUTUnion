import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { getPost, listPostDrafts, publishPost, updatePost } from '../api/article';
import { fetchUserInfo } from '../api/user';
import ArticleImageStrip from '../components/ArticleImageStrip';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import {
  type PickedArticleImage,
  newArticleImageKey,
  resolveArticleImageUrls,
} from '../utils/articleImages';
import resolveCurrentUserId from '../utils/userId';

const STATUS_DRAFT = 3;

function visibilityLine(schoolId: number | null | undefined): string | null {
  if (schoolId === undefined) {
    return null;
  }
  if (schoolId === 0 || schoolId === null) {
    return '可见范围：全站公开，校外用户也可查看';
  }
  return '可见范围：仅本校用户可见';
}

export default function EditPostScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [visibilityHint, setVisibilityHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getPost(id);
      setTitle(p.title || '');
      setContent(p.content || '');
      setIsDraft(p.status === STATUS_DRAFT);
      setVisibilityHint(visibilityLine(p.school_id));
      if (p.images?.length) {
        setImages(
          p.images.map((uri) => ({ key: newArticleImageKey(), uri })),
        );
      } else {
        setImages([]);
      }
    } catch {
      try {
        const res = await listPostDrafts(1, 50);
        const draft = res.list?.find((item: any) => item.id === id);
        if (draft) {
          setTitle(draft.title || '');
          setContent(draft.content || '');
          setIsDraft(true);
          setVisibilityHint(
            visibilityLine((draft as { school_id?: number | null }).school_id),
          );
          if (draft.images?.length) {
            setImages(
              draft.images.map((uri: string) => ({
                key: newArticleImageKey(),
                uri,
              })),
            );
          } else {
            setImages([]);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async () => {
    try {
      setLoading(true);
      const me = await fetchUserInfo();
      const uid = resolveCurrentUserId(me);
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const urls = await resolveArticleImageUrls(uid, images);
      await updatePost(id, { title, content, images: urls });
      if (isDraft) {
        await publishPost(id);
      }
      Alert.alert('已保存', '', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled>
          <Text style={styles.title}>{isDraft ? '编辑草稿' : '编辑帖子'}</Text>
          {visibilityHint ? (
            <Text style={styles.visibilityRo}>{visibilityHint}</Text>
          ) : null}
          <ArticleImageStrip images={images} onChange={setImages} />
          <TextInput
            style={styles.input}
            placeholder="标题"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.area]}
            placeholder="正文"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
          />
          <PrimaryButton
            title={isDraft ? '保存并发布' : '保存'}
            onPress={publish}
            loading={loading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: 40 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: space.md,
    color: colors.text,
  },
  visibilityRo: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: space.md,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  area: { minHeight: 160, textAlignVertical: 'top' },
});
