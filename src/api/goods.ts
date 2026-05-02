import { apiRequest, buildQuery } from './client';

/** 商品类别；与 goods_type（履约方式）正交 */
export const GOODS_CATEGORY = {
  Normal: 1, // 二手买卖：发布者是卖家、收款方
  Help: 2, // 有偿求助：发布者是付款方，接单者是收款方
} as const;
export type GoodsCategory = (typeof GOODS_CATEGORY)[keyof typeof GOODS_CATEGORY];

export type GoodRow = {
  id: number;
  title: string;
  content?: string;
  images?: string[];
  price: number;
  marked_price?: number;
  stock: number;
  goods_type?: number;
  goods_type_label?: string;
  /** 1=二手买卖 2=有偿求助；缺省时视为 1 */
  goods_category?: number;
  goods_category_label?: string;
  /** 卖家收款码完整 URL；仅二手买卖可能非空 */
  payment_qr_url?: string;
  /** 是否启用定时下架 */
  has_deadline?: boolean;
  /** ISO 时间字符串；仅 has_deadline=true 时有意义 */
  deadline?: string | null;
  /** 距离 deadline 的剩余秒数（负数=已过期）；由服务端基于 NOW() 计算 */
  deadline_remaining_seconds?: number | null;
  goods_addr?: string;
  pickup_addr?: string;
  goods_lat?: number | null;
  goods_lng?: number | null;
  good_status?: number;
  status?: number;
  /** 发布者（卖家 / 求助方）用户 id */
  user_id?: number | null;
  author?: { id: number; username: string; avatar?: string };
  view_count?: number;
  like_count?: number;
  collect_count?: number;
  is_liked?: boolean;
  liked?: boolean;
  is_collected?: boolean;
  collected?: boolean;
  /** 后端标记：当前用户是否跨设备看过本商品；与本地 viewedTracker 并集 */
  is_viewed?: boolean;
  created_at?: string;
};

/**
 * 后端 GET /goods：
 * - `newest` 或空 = 上架时间降序
 * - `updated_at` = 最近更新
 * - `recommend` = 个性化推荐（带 refresh_token 稳定分页；仅在无关键词时生效）
 */
export type GoodsListSort = 'newest' | 'updated_at' | 'recommend';

export type GoodsListResult = {
  list: GoodRow[];
  total: number;
  page: number;
  page_size: number;
  /** 推荐模式才有；其它 sort 为 undefined */
  refresh_token?: string;
  sort?: string;
};

export async function listGoods(
  page = 1,
  pageSize = 20,
  opts?: {
    q?: string;
    keyword?: string;
    sort?: GoodsListSort | string;
    refreshToken?: string;
    /** 1 二手买卖 / 2 有偿求助；不传=全部 */
    category?: number;
  },
): Promise<GoodsListResult> {
  const keyword = opts?.q ?? opts?.keyword;
  let sortParam: string | undefined;
  let refreshTokenParam: string | undefined;
  if (opts?.sort === 'updated_at') {
    sortParam = 'updated_at';
  } else if (opts?.sort === 'recommend') {
    // 推荐模式仅在无关键词时生效；有关键词时回退到默认最新上架
    if (!keyword || !keyword.trim()) {
      sortParam = 'recommend';
      refreshTokenParam = opts?.refreshToken || undefined;
    }
  } else if (opts?.sort === 'newest') {
    sortParam = 'newest';
  }
  const params: Record<string, string | number | undefined> = {
    page,
    pageSize,
    q: keyword,
    sort: sortParam,
    refresh_token: refreshTokenParam,
    category: opts?.category && opts.category > 0 ? opts.category : undefined,
  };
  return apiRequest<GoodsListResult>(`/goods${buildQuery(params)}`);
}

export async function getGood(id: number) {
  return apiRequest<GoodRow>(`/goods/${id}`);
}

export async function createGood(body: {
  title: string;
  content: string;
  goods_type?: number;
  /** 1=二手买卖（默认） 2=有偿求助 */
  goods_category?: number;
  /** 与地址簿关联时传，便于后台与订单侧一致 */
  user_location_id?: number;
  goods_addr?: string;
  pickup_addr?: string;
  price: number;
  marked_price?: number;
  stock: number;
  images?: string[];
  /** 收款码图片 URL；仅二手买卖时有效，留空或有偿求助时后端会强制置空 */
  payment_qr_url?: string;
  /** 是否启用定时下架；false 时后端忽略 deadline */
  has_deadline?: boolean;
  /** RFC3339 / "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD" 任选其一；仅 has_deadline=true 时必填 */
  deadline?: string | null;
  goods_lat?: number | null;
  goods_lng?: number | null;
}) {
  return apiRequest<{ id: number }>('/goods', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function publishGood(id: number) {
  return apiRequest<unknown>(`/goods/${id}/publish`, { method: 'POST' });
}

export async function offShelfGood(id: number) {
  return apiRequest<unknown>(`/goods/${id}/off-shelf`, { method: 'POST' });
}

/** GET /user/:id/goods — 本人可含下架商品 */
export async function listUserGoods(
  userId: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: GoodRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/user/${userId}/goods${buildQuery({ page, pageSize })}`);
}

export async function updateGood(
  id: number,
  body: Record<string, unknown>,
) {
  return apiRequest<unknown>(`/goods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
