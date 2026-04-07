import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import {
  createAnswerDraft,
  publishAnswer,
  updateAnswer,
} from '../api/article';
import { fetchUserInfo } from '../api/user';
import ArticleImageStrip from '../components/ArticleImageStrip';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import {
  type PickedArticleImage,
  resolveArticleImageUrls,
} from '../utils/articleImages';
import resolveCurrentUserId from '../utils/userId';

export default function AnswerComposeScreen({ route, navigation }: any) {
  const questionId = Number(route.params?.questionId);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      Alert.alert('提示', '请填写回答内容');
      return;
    }
    try {
      setLoading(true);
      const { id } = await createAnswerDraft({
        title: '',
        content: content.trim(),
        publish_status: 2,
        parent_id: questionId,
      });
      const me = await fetchUserInfo();
      const uid = resolveCurrentUserId(me);
      if (uid != null && images.length > 0) {
        const urls = await resolveArticleImageUrls(uid, images);
        await updateAnswer(id, { images: urls });
      }
      await publishAnswer(id);
      Alert.alert('已发布', '', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '请确认已完成学校认证');
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
          <Text style={styles.title}>写回答</Text>
          <Text style={styles.hint}>尽量写清楚观点，友好交流</Text>
          <ArticleImageStrip images={images} onChange={setImages} />
          <TextInput
            style={styles.input}
            placeholder="输入你的回答…"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
          <PrimaryButton title="发布回答" onPress={submit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: space.sm,
  },
  input: {
    minHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
    textAlignVertical: 'top',
  },
});
