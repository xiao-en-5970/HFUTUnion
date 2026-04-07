import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import ArticleVisibilityRow from '../components/ArticleVisibilityRow';
import { ScrollView } from 'react-native-gesture-handler';
import {
  createQuestionDraft,
  publishQuestion,
  updateQuestion,
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

export default function CreateQuestionScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    try {
      setLoading(true);
      const { id } = await createQuestionDraft({
        title: title.trim(),
        content: content.trim(),
        publish_status: 2,
        is_public: isPublic ? 1 : 0,
      });
      const me = await fetchUserInfo();
      const uid = resolveCurrentUserId(me);
      if (uid != null && images.length > 0) {
        const urls = await resolveArticleImageUrls(uid, images);
        await updateQuestion(id, { images: urls });
      }
      await publishQuestion(id);
      Alert.alert('发布成功', '', [
        {
          text: '确定',
          onPress: () => navigation.replace('QuestionDetail', { id }),
        },
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
          <Text style={styles.label}>标题</Text>
          <TextInput
            style={styles.input}
            placeholder="一句话说明问题"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <ArticleImageStrip images={images} onChange={setImages} />
          <Text style={styles.label}>描述</Text>
          <TextInput
            style={[styles.input, styles.area]}
            placeholder="补充说明（可选）"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
          />
          <ArticleVisibilityRow
            widePublic={isPublic}
            onWidePublicChange={setIsPublic}
          />
          <PrimaryButton title="发布求助" onPress={save} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: 40 },
  label: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
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
  area: { minHeight: 120, textAlignVertical: 'top' },
});
