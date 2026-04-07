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
import { createAnswerDraft, publishAnswer } from '../api/article';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function AnswerComposeScreen({ route, navigation }: any) {
  const questionId = Number(route.params?.questionId);
  const [content, setContent] = useState('');
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
      await publishAnswer(id);
      Alert.alert('已发布', '', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '请确认已绑定学校且提问存在');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <Text style={styles.title}>写回答</Text>
        <Text style={styles.hint}>参考知乎：条理清晰、友好交流</Text>
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { marginTop: 8, fontSize: 13, color: colors.textMuted, marginBottom: space.md },
  input: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
  },
});
