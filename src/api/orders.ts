import { apiRequest, buildQuery } from './client';

export type OrderRow = {
  id: number;
  /** 1 正常 2 已删除/禁用；聊天列表等应忽略非 1 */
  status?: number;
  /** 买方用户 id */
  user_id?: number | null;
  order_status?: number;
  order_status_label?: string;
  receiver_addr?: string;
  sender_addr?: string;
  /** 买方申请修改的收货地址（待卖方确认） */
  pending_receiver_user_location_id?: number | null;
  pending_receiver_addr?: string;
  pending_receiver_lat?: number | null;
  pending_receiver_lng?: number | null;
  /** 收发直线距离（米），两端有坐标时服务端写入 */
  distance_meters?: number | null;
  good?: {
    id: number;
    title: string;
    images?: string[];
    price: number;
    goods_type?: number;
    goods_type_label?: string;
    /** 1=二手买卖 2=有偿求助 */
    goods_category?: number;
    goods_category_label?: string;
    /** 卖家收款码完整 URL（可能为空） */
    payment_qr_url?: string;
    goods_lat?: number | null;
    goods_lng?: number | null;
    /** 卖方用户 id */
    user_id?: number | null;
    /** 后端目前未返回，保留为兜底 */
    author?: { id: number; username?: string; avatar?: string };
  };
  created_at?: string;
};

export async function createOrder(body: {
  goods_id: number;
  /** 省略或为 0：创建不完整订单（待买方完善地址），商品页「我想要」 */
  user_location_id?: number;
  sender_addr?: string;
  sender_lat?: number | null;
  sender_lng?: number | null;
}) {
  return apiRequest<{ id: number }>('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 统一更新买方收货地 / 卖方发货地 / 卖方确认或拒绝买方改址 */
export async function updateOrderLocation(
  orderId: number,
  body: {
    type: 'buyer' | 'seller';
    user_location_id?: number;
    proposal_only?: boolean;
    sender_addr?: string;
    sender_lat?: number | null;
    sender_lng?: number | null;
    confirm_buyer_location?: boolean;
    reject_buyer_location?: boolean;
  },
) {
  return apiRequest<unknown>(`/orders/${orderId}/location`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listOrdersBuyer(page = 1, pageSize = 20) {
  return apiRequest<{
    list: OrderRow[];
    total: number;
  }>(`/orders${buildQuery({ page, pageSize })}`);
}

export async function listOrdersSold(page = 1, pageSize = 20) {
  return apiRequest<{
    list: OrderRow[];
    total: number;
  }>(`/orders/sold${buildQuery({ page, pageSize })}`);
}

export async function getOrder(id: number) {
  return apiRequest<OrderRow>(`/orders/${id}`);
}

export async function orderMessages(orderId: number, page = 1, pageSize = 50) {
  return apiRequest<{
    list: Array<{
      id: number;
      content?: string;
      image_url?: string;
      msg_type?: number;
      created_at?: string;
      sender_id?: number;
    }>;
    total: number;
  }>(`/orders/${orderId}/messages${buildQuery({ page, pageSize })}`);
}

export async function postOrderMessage(
  orderId: number,
  body: { msg_type?: number; content?: string; image_url?: string },
) {
  return apiRequest<unknown>(`/orders/${orderId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sellerConfirmPayment(orderId: number) {
  return apiRequest<unknown>(`/orders/${orderId}/seller-confirm-payment`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function confirmDelivery(
  orderId: number,
  body: { delivery_images: string[] },
) {
  return apiRequest<unknown>(`/orders/${orderId}/confirm-delivery`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function confirmReceipt(orderId: number, body: Record<string, unknown> = {}) {
  return apiRequest<unknown>(`/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 有偿求助：发布者上传付酬截图，订单 1→3（待接单者确认收到酬劳） */
export async function helpPublisherPay(
  orderId: number,
  body: { payment_image: string; note?: string },
) {
  return apiRequest<unknown>(`/orders/${orderId}/help/pay`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function cancelOrder(orderId: number) {
  return apiRequest<unknown>(`/orders/${orderId}/cancel`, { method: 'POST' });
}
