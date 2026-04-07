import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { createPostDraft } from '../api/article';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function CreateDraftScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    try {
      setLoading(true);
      const { id } = await createPostDraft({
        title,
        content,
        publish_status: 2,
        is_public: 1,
      });
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
        style={styles.inner}>
        <Text style={styles.title}>发帖</Text>
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
        <PrimaryButton title="保存并继续编辑" onPress={save} loading={loading} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.md },
  title: { fontSize: 22, fontWeight: '700', marginBottom: space.md, color: colors.text },
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
