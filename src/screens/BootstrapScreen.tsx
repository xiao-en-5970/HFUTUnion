import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Screen from '../components/Screen';
import { getToken } from '../api/client';
import { colors } from '../theme/colors';

/**
 * 启动屏：根据本地 token 决定进入主界面或登录页，避免每次冷启动都落在登录页。
 */
export default function BootstrapScreen({ navigation }: any) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        if (cancelled) {
          return;
        }
        navigation.replace(t ? 'MainTabs' : 'Login');
      } catch {
        if (!cancelled) {
          navigation.replace('Login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
