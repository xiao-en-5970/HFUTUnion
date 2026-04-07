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
import { createPostDraft, updatePost } from '../api/article';
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

export default function CreateDraftScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PickedArticleImage[]>([]);
  /** true：校外可见；false：仅本校（默认校内） */
  const [widePublic, setWidePublic] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    try {
      setLoading(true);
      const { id } = await createPostDraft({
        title,
        content,
        publish_status: 2,
        is_public: widePublic ? 1 : 0,
      });
      const me = await fetchUserInfo();
      const uid = resolveCurrentUserId(me);
      if (uid != null && images.length > 0) {
        const urls = await resolveArticleImageUrls(uid, images);
        await updatePost(id, { images: urls });
      }
      navigation.replace('EditPost', { id });
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
          <Text style={styles.title}>发帖</Text>
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
          <ArticleVisibilityRow
            widePublic={widePublic}
            onWidePublicChange={setWidePublic}
          />
          <PrimaryButton
            title="保存并继续编辑"
            onPress={save}
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
    fontSize: 22,
    fontWeight: '700',
    marginBottom: space.md,
    color: colors.text,
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
