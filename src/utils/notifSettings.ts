import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * 站内通知偏好（全部走 AsyncStorage，纯本机设置）
 *
 * - pushXXX: 收到对应类别通知时，是否本地弹出系统通知栏（@notifee/react-native）。
 * - showBadgeCount: 底栏「消息」图标上是显示未读数字还是只显示红点。
 *
 * 接收站内通知本身不可关闭（避免用户忽略重要消息），仅控制手机弹窗。
 *
 * 约定：点赞类通知（like_article / like_comment）**永远不触发系统弹窗**，
 * 避免被点赞通知刷屏，因此没有对应的设置项。
 */
export type NotifSettings = {
  pushComment: boolean;
  pushReply: boolean;
  pushOfficial: boolean;
  pushOrderMessage: boolean;
  showBadgeCount: boolean;
};

export const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
  pushComment: true,
  pushReply: true,
  pushOfficial: true,
  pushOrderMessage: true,
  showBadgeCount: true,
};

const STORAGE_KEY = 'notif_settings:v1';

let cache: NotifSettings | null = null;
const listeners = new Set<(s: NotifSettings) => void>();

function notify(s: NotifSettings) {
  listeners.forEach((fn) => {
    try {
      fn(s);
    } catch {
      /* noop */
    }
  });
}

export async function loadNotifSettings(): Promise<NotifSettings> {
  if (cache) {
    return cache;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotifSettings>;
      cache = { ...DEFAULT_NOTIF_SETTINGS, ...parsed };
      return cache;
    }
  } catch {
    /* fallthrough */
  }
  cache = { ...DEFAULT_NOTIF_SETTINGS };
  return cache;
}

export async function updateNotifSettings(patch: Partial<NotifSettings>): Promise<NotifSettings> {
  const current = await loadNotifSettings();
  const next: NotifSettings = { ...current, ...patch };
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 写失败下次再试，不抛异常避免阻塞 UI */
  }
  notify(next);
  return next;
}

/** 同步读取缓存；缓存未命中时返回默认值，后台异步填充 */
export function getNotifSettingsSync(): NotifSettings {
  if (cache) {
    return cache;
  }
  loadNotifSettings();
  return DEFAULT_NOTIF_SETTINGS;
}

/** 订阅偏好变更（设置页改动或其它页同步） */
export function subscribeNotifSettings(fn: (s: NotifSettings) => void): () => void {
  listeners.add(fn);
  // 触发一次初始回调，避免订阅端自己再读
  loadNotifSettings().then(fn).catch(() => {});
  return () => {
    listeners.delete(fn);
  };
}

/** React Hook 版本，读 + 订阅变更 */
export function useNotifSettings(): NotifSettings {
  const [state, setState] = useState<NotifSettings>(() => getNotifSettingsSync());
  useEffect(() => {
    const unsub = subscribeNotifSettings(setState);
    return unsub;
  }, []);
  return state;
}
