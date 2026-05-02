/**
 * 本地通知封装：在应用运行期间（前台或最近被挂后台）把增量的站内通知显示到系统通知栏。
 *
 * 说明：
 * 1. 本模块故意用 `require` + try/catch 动态加载 @notifee/react-native。
 *    - 首次接入时开发者可能忘记执行 `pod install` / 重编 APK，此时 `require` 会抛 native
 *      module 未找到；我们在运行时退化为 no-op，避免整个 app 崩溃。
 * 2. 调用方（MessagesUnreadContext 轮询）只需保证传入的通知条目是「新增」的即可；
 *    我们额外在模块内做一次 id 去重，避免同一条通知被重复弹出。
 * 3. 不依赖 FCM / APNs：app 完全退出后不会再弹；若需要远程推送需后续接入 FCM。
 */

import { Platform } from 'react-native';
import type { NotificationItem } from '../api/notification';
import { NOTIFY_TYPE } from '../api/notification';
import { getNotifSettingsSync } from './notifSettings';

type NotifeeModule = {
  default: {
    requestPermission: () => Promise<unknown>;
    createChannel: (opts: {
      id: string;
      name: string;
      importance?: number;
      sound?: string;
    }) => Promise<string>;
    displayNotification: (opts: {
      title?: string;
      body?: string;
      data?: Record<string, string>;
      android?: { channelId: string; smallIcon?: string; pressAction?: { id: string } };
      ios?: { sound?: string };
    }) => Promise<string>;
  };
  AndroidImportance?: { HIGH: number; DEFAULT: number; LOW: number };
};

let notifee: NotifeeModule | null | undefined;
let channelReady = false;

function loadNotifee(): NotifeeModule | null {
  if (notifee !== undefined) {
    return notifee;
  }
  try {
    notifee = require('@notifee/react-native') as NotifeeModule;
  } catch {
    notifee = null;
  }
  return notifee;
}

async function ensureChannel(mod: NotifeeModule): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (channelReady) {
    return 'hfut-default';
  }
  try {
    await mod.default.createChannel({
      id: 'hfut-default',
      name: 'HFUT 默认通知',
      importance: mod.AndroidImportance?.HIGH ?? 4,
    });
    channelReady = true;
    return 'hfut-default';
  } catch {
    return null;
  }
}

/** 初始化权限与通道；幂等，可重复调用 */
export async function initLocalNotif(): Promise<void> {
  const mod = loadNotifee();
  if (!mod) {
    return;
  }
  try {
    await mod.default.requestPermission();
  } catch {
    /* noop */
  }
  await ensureChannel(mod);
}

const displayedIDs = new Set<number>();

/**
 * 检查通知偏好，判断该条通知应不应该弹本地通知栏。
 *
 * 注意：点赞类通知（LikeArticle / LikeComment）**硬编码为永不弹窗**，
 * 列表中仍然可见；这样即便哪天点赞很多也不会被系统通知轰炸。
 */
function shouldPush(item: NotificationItem): boolean {
  const s = getNotifSettingsSync();
  switch (item.type) {
    case NOTIFY_TYPE.LikeArticle:
    case NOTIFY_TYPE.LikeComment:
      return false;
    case NOTIFY_TYPE.Comment:
      return s.pushComment;
    case NOTIFY_TYPE.Reply:
      return s.pushReply;
    case NOTIFY_TYPE.Official:
      return s.pushOfficial;
    default:
      return false;
  }
}

function titleFor(item: NotificationItem): string {
  const name = item.from?.username || '某人';
  switch (item.type) {
    case NOTIFY_TYPE.LikeArticle:
      return `${name} 赞了你的作品`;
    case NOTIFY_TYPE.LikeComment:
      return `${name} 赞了你的评论`;
    case NOTIFY_TYPE.Comment:
      return `${name} 评论了你`;
    case NOTIFY_TYPE.Reply:
      return `${name} 回复了你的评论`;
    case NOTIFY_TYPE.Official:
      return '官方通知';
    default:
      return '新消息';
  }
}

/** 把一批新通知投递到系统通知栏（按偏好过滤，模块缺失时静默跳过） */
export async function pushNotificationsLocal(items: NotificationItem[]): Promise<void> {
  if (!items.length) {
    return;
  }
  const mod = loadNotifee();
  if (!mod) {
    return;
  }
  const channelId = (await ensureChannel(mod)) ?? 'hfut-default';

  for (const item of items) {
    if (displayedIDs.has(item.id)) {
      continue;
    }
    if (!shouldPush(item)) {
      continue;
    }
    try {
      await mod.default.displayNotification({
        title: titleFor(item),
        body: item.summary || item.title || '',
        data: {
          notification_id: String(item.id),
          type: String(item.type),
          target_type: String(item.target_type),
          target_id: String(item.target_id),
          ref_ext_type: String(item.ref_ext_type),
          ref_id: String(item.ref_id),
        },
        android: {
          channelId,
          smallIcon: 'ic_launcher',
          pressAction: { id: 'default' },
        },
        ios: { sound: 'default' },
      });
      displayedIDs.add(item.id);
      // 简单防爆炸：缓存上限 500 条
      if (displayedIDs.size > 500) {
        const iter = displayedIDs.values();
        for (let i = 0; i < 100; i++) {
          const v = iter.next().value;
          if (v === undefined) {
            break;
          }
          displayedIDs.delete(v);
        }
      }
    } catch {
      /* 单条失败不影响其它条 */
    }
  }
}

/** 商品消息/订单消息单独入口：调用方决定消息内容与标题 */
export async function pushOrderMessageLocal(params: {
  key: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const s = getNotifSettingsSync();
  if (!s.pushOrderMessage) {
    return;
  }
  const mod = loadNotifee();
  if (!mod) {
    return;
  }
  const channelId = (await ensureChannel(mod)) ?? 'hfut-default';
  try {
    await mod.default.displayNotification({
      title: params.title,
      body: params.body,
      data: params.data,
      android: {
        channelId,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
      ios: { sound: 'default' },
    });
  } catch {
    /* ignore */
  }
}
