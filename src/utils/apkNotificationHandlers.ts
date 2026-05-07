/**
 * notifee 通知点击事件处理——把"点击下载完成的通知"映射到 apkDownload.installNow()。
 *
 * notifee 文档要求 onBackgroundEvent 必须在模块 top-level 调用（注册一次，全局生效）；
 * onForegroundEvent 在 React 组件 mount 时调用即可。
 *
 * 拆出来这个独立模块的好处：
 *   - top-level 副作用集中可见
 *   - 测试时可以 jest.mock 整个文件
 *   - App.tsx 不用直接 import @notifee/react-native（保持 RN 原生模块未注册时也能跑）
 */

import {
  apkDownload,
  APK_DOWNLOAD_PRESS_ACTION_DOWNLOADING,
  APK_DOWNLOAD_PRESS_ACTION_INSTALL,
} from './apkDownload';

type NotifeeEvent = {
  type: number;
  detail: {
    pressAction?: { id: string };
    notification?: { id?: string };
  };
};

type NotifeeModule = {
  default: {
    onForegroundEvent: (cb: (e: NotifeeEvent) => void) => () => void;
    onBackgroundEvent: (cb: (e: NotifeeEvent) => Promise<void>) => void;
  };
  EventType: { PRESS: number };
};

let mod: NotifeeModule | null | undefined;
function loadNotifee(): NotifeeModule | null {
  if (mod !== undefined) return mod;
  try {
    mod = require('@notifee/react-native') as NotifeeModule;
  } catch {
    mod = null;
  }
  return mod;
}

async function handlePress(actionId: string | undefined): Promise<void> {
  if (!actionId) return;
  if (
    actionId !== APK_DOWNLOAD_PRESS_ACTION_DOWNLOADING &&
    actionId !== APK_DOWNLOAD_PRESS_ACTION_INSTALL
  ) {
    return;
  }
  // 两种 action 都直接尝试触发安装；下载未完成时 installNow 是 no-op
  await apkDownload.installNow();
}

// top-level 注册后台事件——必须在 import 时同步执行，notifee 文档明确要求
const notifeeMod = loadNotifee();
if (notifeeMod) {
  notifeeMod.default.onBackgroundEvent(async event => {
    if (event.type === notifeeMod.EventType.PRESS) {
      await handlePress(event.detail.pressAction?.id);
    }
  });
}

/**
 * 在组件 mount 时调一次，挂前台通知监听；返回 unsubscribe 函数。
 *
 * notifee 模块未注册（开发期未 rebuild apk）时返回空函数，不报错。
 */
export function registerApkNotificationHandlers(): () => void {
  const m = loadNotifee();
  if (!m) {
    return () => {};
  }
  return m.default.onForegroundEvent(event => {
    if (event.type === m.EventType.PRESS) {
      handlePress(event.detail.pressAction?.id).catch(() => {
        /* 处理失败不影响主流程 */
      });
    }
  });
}
