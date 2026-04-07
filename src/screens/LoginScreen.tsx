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
import { login, fetchUserInfo } from '../api/user';
import { setToken } from '../api/client';
import { writeCachedUserInfo } from '../utils/userCache';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function LoginScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }
    try {
      setLoading(true);
      const token = await login(username, password);
      if (typeof token === 'string') {
        await setToken(token);
      } else {
        await setToken(String(token));
      }
      try {
        const u = await fetchUserInfo();
        await writeCachedUserInfo(u);
      } catch {
        /* 登录成功即可进入，资料稍后刷新 */
      }
      navigation.replace('MainTabs');
    } catch (e: any) {
      Alert.alert('登录失败', e?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.brand}>HFUT Union</Text>
          <Text style={styles.sub}>校园社区 · 二手 · 问答</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>账号</Text>
          <TextInput
            placeholder="用户名"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <Text style={styles.label}>密码</Text>
          <TextInput
            placeholder="密码"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <PrimaryButton
            title="登录"
            onPress={handleLogin}
            loading={loading}
            style={styles.btn}
          />
          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkText}>没有账号？注册</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, padding: space.lg, justifyContent: 'center' },
  header: { marginBottom: space.xl },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  sub: { marginTop: space.xs, fontSize: 15, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: space.xs,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: colors.text,
    marginBottom: space.md,
    backgroundColor: colors.bg,
  },
  btn: { marginTop: space.sm },
  link: { marginTop: space.lg, alignItems: 'center' },
  linkText: { color: colors.primary, fontSize: 15 },
});
