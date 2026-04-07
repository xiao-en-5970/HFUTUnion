import { apiRequest, buildQuery } from './client';

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
  goods_addr?: string;
  pickup_addr?: string;
  goods_lat?: number | null;
  goods_lng?: number | null;
  good_status?: number;
  status?: number;
  /** 发布者（卖家）用户 id */
  user_id?: number | null;
  author?: { id: number; username: string; avatar?: string };
  view_count?: number;
  like_count?: number;
  collect_count?: number;
  is_liked?: boolean;
  liked?: boolean;
  is_collected?: boolean;
  collected?: boolean;
  created_at?: string;
};

/** 后端 GET /goods：`sort=newest` 或空=上架时间；`sort=updated_at`=最近更新 */
export type GoodsListSort = 'newest' | 'updated_at';

export async function listGoods(
  page = 1,
  pageSize = 20,
  opts?: { q?: string; keyword?: string; sort?: GoodsListSort | string },
) {
  let sortParam: string | undefined;
  if (opts?.sort === 'updated_at') {
    sortParam = 'updated_at';
  } else if (opts?.sort === 'newest') {
    sortParam = 'newest';
  }
  const params: Record<string, string | number | undefined> = {
    page,
    pageSize,
    q: opts?.q ?? opts?.keyword,
    sort: sortParam,
  };
  return apiRequest<{
    list: GoodRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/goods${buildQuery(params)}`);
}

export async function getGood(id: number) {
  return apiRequest<GoodRow>(`/goods/${id}`);
}

export async function createGood(body: {
  title: string;
  content: string;
  goods_type?: number;
  /** 与地址簿关联时传，便于后台与订单侧一致 */
  user_location_id?: number;
  goods_addr?: string;
  pickup_addr?: string;
  price: number;
  marked_price?: number;
  stock: number;
  images?: string[];
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
