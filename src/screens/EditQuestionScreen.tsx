import React, { useEffect, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { getQuestion, updateQuestion } from '../api/article';
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

function visibilityLine(schoolId: number | null | undefined): string | null {
  if (schoolId === undefined) {
    return null;
  }
  if (schoolId === 0 || schoolId === null) {
    return '可见范围：全站公开，校外用户也可查看';
  }
  return '可见范围：仅本校用户可见';
}

export default function EditQuestionScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibilityHint, setVisibilityHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = await getQuestion(id);
        if (cancelled) {
          return;
        }
        setTitle(q.title || '');
        setContent(q.content || '');
        setVisibilityHint(visibilityLine(q.school_id));
        if (q.images?.length) {
          setImages(
            q.images.map((uri) => ({ key: newArticleImageKey(), uri })),
          );
        } else {
          setImages([]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    try {
      setLoading(true);
      const me = await fetchUserInfo();
      const uid = resolveCurrentUserId(me);
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const urls = await resolveArticleImageUrls(uid, images);
      await updateQuestion(id, {
        title: title.trim(),
        content: content.trim(),
        images: urls,
      });
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
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>编辑求助</Text>
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
            placeholder="问题描述"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
          <PrimaryButton title="保存" onPress={save} loading={loading} />
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
  area: { minHeight: 160 },
});
