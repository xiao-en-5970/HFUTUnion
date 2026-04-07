import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { createQuestionDraft, publishQuestion } from '../api/article';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function CreateQuestionScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(true);
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
      await publishQuestion(id);
      Alert.alert('发布成功', '', [
        { text: '确定', onPress: () => navigation.replace('QuestionDetail', { id }) },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '请确认已绑定学校');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <Text style={styles.label}>标题</Text>
        <TextInput
          style={styles.input}
          placeholder="一句话说明问题"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <Text style={styles.label}>描述</Text>
        <TextInput
          style={[styles.input, styles.area]}
          placeholder="补充 details…"
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
        />
        <View style={styles.row}>
          <Text style={styles.label}>全站公开</Text>
          <Switch value={isPublic} onValueChange={setIsPublic} />
        </View>
        <PrimaryButton title="发布提问" onPress={save} loading={loading} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.md },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
});
