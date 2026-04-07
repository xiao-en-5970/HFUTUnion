import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/navigation';
import { getToken } from './src/api/client';
import { fetchUserInfo } from './src/api/user';
import { writeCachedUserInfo } from './src/utils/userCache';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        if (!t || cancelled) {
          return;
        }
        const u = await fetchUserInfo();
        if (!cancelled) {
          await writeCachedUserInfo(u);
        }
      } catch {
        /* 网络失败时保留本地已缓存的登录态与用户信息 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={isDarkMode ? '#000' : '#fff'}
        />
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
