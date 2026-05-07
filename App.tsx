import React, { useEffect, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/navigation';
import { getToken } from './src/api/client';
import { fetchUserInfo } from './src/api/user';
import { writeCachedUserInfo } from './src/utils/userCache';
import UpdateDialog from './src/components/UpdateDialog';
import { checkForUpdate, type UpdateCheckResult } from './src/utils/appUpdate';
import { registerApkNotificationHandlers } from './src/utils/apkNotificationHandlers';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';
  // 弹窗状态：null=不弹；非 null=弹（详见 utils/appUpdate.ts::checkForUpdate）
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult>(null);

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

  // 启动后异步检查 app 更新——不依赖登录态、不阻塞导航；
  // 失败静默吞掉（详见 utils/appUpdate.ts 顶部注释）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await checkForUpdate();
      if (!cancelled) {
        setUpdateInfo(info);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 注册 notifee 通知点击监听——下载完成的通知点击后触发 installApk。
  // 必须在顶层 mount 一次（onForegroundEvent 返回 unsubscribe 函数）；
  // onBackgroundEvent 也必须在 import 时同步注册（详见 apkNotificationHandlers.ts 注释）。
  useEffect(() => {
    return registerApkNotificationHandlers();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={isDarkMode ? '#000' : '#fff'}
        />
        <Navigation />
        <UpdateDialog
          info={updateInfo}
          onClose={() => setUpdateInfo(null)}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
