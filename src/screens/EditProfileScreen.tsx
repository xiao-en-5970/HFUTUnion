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
import { updateUser } from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function EditProfileScreen({ route, navigation }: any) {
  const { user } = route.params || {};
  const [bindQQ, setBindQQ] = useState(user?.bind_qq || '');
  const [bindWX, setBindWX] = useState(user?.bind_wx || '');
  const [bindPhone, setBindPhone] = useState(user?.bind_phone || '');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    try {
      setLoading(true);
      await updateUser({
        avatar: user?.avatar,
        background: user?.background,
        bind_qq: bindQQ,
        bind_wx: bindWX,
        bind_phone: bindPhone,
      });
      Alert.alert('已保存');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <Text style={styles.title}>编辑资料</Text>
        <Text style={styles.hint}>学籍绑定请在「我的 → 学籍认证」完成</Text>
        <TextInput
          placeholder="QQ"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={bindQQ}
          onChangeText={setBindQQ}
        />
        <TextInput
          placeholder="微信"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={bindWX}
          onChangeText={setBindWX}
        />
        <TextInput
          placeholder="手机"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={bindPhone}
          onChangeText={setBindPhone}
          keyboardType="phone-pad"
        />
        <PrimaryButton title="保存" onPress={save} loading={loading} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { marginTop: 8, marginBottom: space.lg, fontSize: 13, color: colors.textMuted },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: space.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});
