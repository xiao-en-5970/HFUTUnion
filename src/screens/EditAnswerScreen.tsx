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
import { getAnswer, updateAnswer } from '../api/article';
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

export default function EditAnswerScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getAnswer(id);
        if (cancelled) {
          return;
        }
        setContent(a.content || '');
        if (a.images?.length) {
          setImages(
            a.images.map((uri) => ({ key: newArticleImageKey(), uri })),
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
    if (!content.trim()) {
      Alert.alert('提示', '请填写回答内容');
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
      await updateAnswer(id, { content: content.trim(), images: urls });
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
          <Text style={styles.title}>编辑回答</Text>
          <ArticleImageStrip images={images} onChange={setImages} />
          <TextInput
            style={styles.input}
            placeholder="回答内容"
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
  input: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.md,
    textAlignVertical: 'top',
  },
});
