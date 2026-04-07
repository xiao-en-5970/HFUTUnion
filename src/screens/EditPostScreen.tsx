import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { listPostDrafts, publishPost, updatePost } from '../api/article';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function EditPostScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const res = await listPostDrafts(1, 20);
      const draft = res.list?.find((item: any) => item.id === id);
      if (draft) {
        setTitle(draft.title || '');
        setContent(draft.content || '');
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const publish = async () => {
    try {
      setLoading(true);
      await updatePost(id, { title, content });
      await publishPost(id);
      Alert.alert('发布成功', '', [
        { text: '确定', onPress: () => navigation.popToTop() },
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
        style={styles.inner}>
        <Text style={styles.title}>编辑草稿</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.area]}
          value={content}
          onChangeText={setContent}
          multiline
        />
        <PrimaryButton title="发布" onPress={publish} loading={loading} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.md },
  title: { fontSize: 20, fontWeight: '700', marginBottom: space.md, color: colors.text },
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
