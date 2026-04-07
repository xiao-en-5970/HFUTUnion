import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { register } from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function RegisterScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rePassword, setRePassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !password || !rePassword) {
      Alert.alert('提示', '请填写完整信息');
      return;
    }
    if (password !== rePassword) {
      Alert.alert('提示', '两次密码不一致');
      return;
    }
    try {
      setLoading(true);
      await register(username, password, rePassword);
      Alert.alert('注册成功', '请登录', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('注册失败', e?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <Text style={styles.title}>创建账号</Text>
        <View style={styles.card}>
          <TextInput
            placeholder="用户名"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="密码"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            placeholder="确认密码"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={rePassword}
            onChangeText={setRePassword}
            secureTextEntry
          />
          <PrimaryButton
            title="注册"
            onPress={handleRegister}
            loading={loading}
          />
          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>返回登录</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.lg, justifyContent: 'center' },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: space.md,
    backgroundColor: colors.bg,
    color: colors.text,
  },
  link: { marginTop: space.lg, alignItems: 'center' },
  linkText: { color: colors.primary },
});
