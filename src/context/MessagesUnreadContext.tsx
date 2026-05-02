import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchNotificationUnread,
  listNotifications,
  type NotificationItem,
  type NotificationUnreadSummary,
} from '../api/notification';
import { fetchChatUnreadSummary, type ChatUnreadSummary } from '../api/chat';
import { getToken } from '../api/client';
import { initLocalNotif, pushNotificationsLocal } from '../utils/localNotif';

/**
 * 全局未读汇总上下文
 *
 * 这里把两种未读聚合在一起：
 * - 普通消息（notifications 表）：点赞 / 评论 / 回复 / 官方通知
 * - 商品消息（order_messages 表）：买家 / 卖家 的订单聊天
 *
 * 消费方：
 * - 底栏消息 tab 的角标（MainTabs）
 * - 消息页子 tab 的小红点（MessagesScreen）
 *
 * 我们每 POLL_MS 轮询一次；成功后把新增站内通知投给本地通知模块（如果 notifee 可用）。
 */

const POLL_MS = 35_000;

type Summary = {
  notifTotal: number;
  notifByType: Record<string, number>;
  chatTotal: number;
  chatByOrder: Record<string, number>;
};

const EMPTY: Summary = {
  notifTotal: 0,
  notifByType: {},
  chatTotal: 0,
  chatByOrder: {},
};

type Ctx = Summary & {
  total: number;
  /** 重新拉取一次 */
  refresh: () => Promise<void>;
};

const MessagesUnreadContext = createContext<Ctx>({
  ...EMPTY,
  total: 0,
  refresh: async () => {},
});

export function MessagesUnreadProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const knownMaxNotifIDRef = useRef<number>(0);
  const initedRef = useRef(false);

  /**
   * 取近期通知，把「新出现」的那些交给本地通知。
   * 首次调用只记录当前最大 id，不弹通知，避免冷启动刷屏。
   */
  const fireLocalNotifsFor = useCallback(async (nextTotal: number) => {
    if (nextTotal <= 0) {
      return;
    }
    try {
      const res = await listNotifications({ page: 1, pageSize: 10, onlyUnread: true });
      const items: NotificationItem[] = res.list || [];
      if (!initedRef.current) {
        initedRef.current = true;
        knownMaxNotifIDRef.current = items[0]?.id ?? 0;
        return;
      }
      const threshold = knownMaxNotifIDRef.current;
      const fresh = items.filter((n) => n.id > threshold);
      if (fresh.length) {
        knownMaxNotifIDRef.current = Math.max(...fresh.map((n) => n.id), threshold);
        await pushNotificationsLocal(fresh);
      }
    } catch {
      /* 轮询失败允许忽略，保持最后一次成功的 summary */
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setSummary(EMPTY);
      return;
    }
    // 这两个接口各自独立失败，不互相拖累
    const [notifRes, chatRes] = await Promise.allSettled([
      fetchNotificationUnread(),
      fetchChatUnreadSummary(),
    ]);
    let nextNotifTotal = 0;
    let nextNotifByType: Record<string, number> = {};
    let nextChatTotal = 0;
    let nextChatByOrder: Record<string, number> = {};

    if (notifRes.status === 'fulfilled') {
      const r: NotificationUnreadSummary = notifRes.value;
      nextNotifTotal = r.total ?? 0;
      nextNotifByType = r.by_type ?? {};
    }
    if (chatRes.status === 'fulfilled') {
      const r: ChatUnreadSummary = chatRes.value;
      nextChatTotal = r.total ?? 0;
      nextChatByOrder = r.by_order ?? {};
    }

    setSummary({
      notifTotal: nextNotifTotal,
      notifByType: nextNotifByType,
      chatTotal: nextChatTotal,
      chatByOrder: nextChatByOrder,
    });

    if (nextNotifTotal > 0) {
      // 有新通知时拉取最新几条做本地弹窗；失败不影响状态
      fireLocalNotifsFor(nextNotifTotal).catch(() => {});
    }
  }, [fireLocalNotifsFor]);

  // 初始化 + 启动轮询
  useEffect(() => {
    initLocalNotif().catch(() => {});
    refresh().catch(() => {});
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      ...summary,
      total: summary.notifTotal + summary.chatTotal,
      refresh,
    }),
    [summary, refresh],
  );

  return (
    <MessagesUnreadContext.Provider value={value}>{children}</MessagesUnreadContext.Provider>
  );
}

export function useMessagesUnread(): Ctx {
  return useContext(MessagesUnreadContext);
}
