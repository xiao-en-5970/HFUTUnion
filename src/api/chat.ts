import { apiRequest } from './client';
import { listOrdersBuyer, listOrdersSold } from './orders';

/** GET /user/chat/unread */
export type ChatUnreadSummary = {
  total: number;
  /** orderId 字符串 -> 未读条数 */
  by_order: Record<string, number>;
};

export async function fetchChatUnreadSummary() {
  return apiRequest<ChatUnreadSummary>('/user/chat/unread');
}

/** POST /orders/:id/messages/read — 不传 body 或 last_read_message_id=0 表示读到当前最后一条 */
export async function markOrderMessagesRead(orderId: number, lastReadMessageId?: number) {
  const body =
    lastReadMessageId != null && lastReadMessageId > 0
      ? { last_read_message_id: lastReadMessageId }
      : {};
  return apiRequest<unknown>(`/orders/${orderId}/messages/read`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 会话列表项：与后台订单聊天一致，对方身份为买家或卖家 */
export type ChatConversation = {
  orderId: number;
  counterpartUserId: number;
  /** 相对当前登录用户，对方是卖家还是买家 */
  counterpartRole: 'seller' | 'buyer';
  goodTitle: string;
  goodThumb?: string;
  orderStatusLabel?: string;
  /** 后端 order_status 1–5 */
  orderStatus?: number;
  /** 商品 goods_type 1 送货 2 自提 3 在线 */
  goodsType?: number;
  /** 商品 goods_category 1 二手买卖 2 有偿求助 */
  goodsCategory?: number;
  createdAt?: string;
  /** 对方发来未读条数（由未读汇总合并） */
  unreadCount?: number;
};

function parseTime(iso?: string): number {
  if (!iso) {
    return 0;
  }
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/** 合并我买到的 / 我卖出的订单，作为「与谁聊过」的会话列表 */
export async function fetchChatConversations(): Promise<ChatConversation[]> {
  const [buyRes, sellRes] = await Promise.all([
    listOrdersBuyer(1, 60),
    listOrdersSold(1, 60),
  ]);

  const out: ChatConversation[] = [];

  const seenOrderIds = new Set<number>();

  for (const o of buyRes.list || []) {
    if (o.status != null && o.status !== 1) {
      continue;
    }
    if (seenOrderIds.has(o.id)) {
      continue;
    }
    seenOrderIds.add(o.id);
    const sid = o.good?.user_id;
    if (sid == null) {
      continue;
    }
    out.push({
      orderId: o.id,
      counterpartUserId: Number(sid),
      counterpartRole: 'seller',
      goodTitle: o.good?.title || '商品',
      goodThumb: o.good?.images?.[0],
      orderStatusLabel: o.order_status_label,
      orderStatus: o.order_status,
      goodsType: o.good?.goods_type,
      goodsCategory: o.good?.goods_category,
      createdAt: o.created_at,
    });
  }

  for (const o of sellRes.list || []) {
    if (o.status != null && o.status !== 1) {
      continue;
    }
    if (seenOrderIds.has(o.id)) {
      continue;
    }
    seenOrderIds.add(o.id);
    const bid = o.user_id;
    if (bid == null) {
      continue;
    }
    out.push({
      orderId: o.id,
      counterpartUserId: Number(bid),
      counterpartRole: 'buyer',
      goodTitle: o.good?.title || '商品',
      goodThumb: o.good?.images?.[0],
      orderStatusLabel: o.order_status_label,
      orderStatus: o.order_status,
      goodsType: o.good?.goods_type,
      goodsCategory: o.good?.goods_category,
      createdAt: o.created_at,
    });
  }

  out.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
  return out;
}

/** 会话列表 + 未读数（并行请求后合并，只打一次未读汇总接口） */
export async function fetchChatConversationsWithUnread(): Promise<{
  list: ChatConversation[];
  total: number;
}> {
  const [rows, sum] = await Promise.all([
    fetchChatConversations(),
    fetchChatUnreadSummary().catch(() => ({ total: 0, by_order: {} } as ChatUnreadSummary)),
  ]);
  const by = sum.by_order || {};
  const list = rows.map((r) => ({
    ...r,
    unreadCount: by[String(r.orderId)] ?? 0,
  }));
  return { list, total: sum.total ?? 0 };
}
