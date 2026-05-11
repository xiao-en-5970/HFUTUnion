import { apiRequest, buildQuery } from './client';

/** 与点赞/收藏接口 extType 一致：1帖 2问 3答 4商品 */
export const EXT_TYPE_POST = 1;
export const EXT_TYPE_QUESTION = 2;
export const EXT_TYPE_ANSWER = 3;
export const EXT_TYPE_GOODS = 4;

/** AccountType: 1 普通账号；2 QQ 旗下号（"QQ 智能体"标签由前端按这个字段判断） */
export const ACCOUNT_TYPE_NORMAL = 1;
export const ACCOUNT_TYPE_QQ_CHILD = 2;

/**
 * AuthorInfo 通用作者卡片字段集——所有列表 / 评论 / 详情接口返回的作者信息都用这个结构。
 *
 * 展示约定：
 *   - nickname 是"对外展示名"；后端 fallback 到 username（永远非空）
 *   - avatar 是完整 URL；后端会把 QQ 头像（q.qlogo.cn）或自上传头像统一吐回来
 *   - account_type = 2 → 前端给作者卡片打 "QQ 智能体" tag
 *   - parent_user_id 非空（QQ 旗下号挂主账号）→ 前端在个人展示页展示 "关联自「parent_nickname」"
 *     且 parent_nickname 可点击跳转到主账号的 UserProfile 页
 *   - from_user_id / from_username 是老字段，仅做兼容；新代码用 parent_*
 */
export type AuthorInfo = {
  id: number;
  username: string;
  nickname?: string;
  avatar?: string;

  /** 1 普通 / 2 QQ 旗下号 */
  account_type?: number;
  /** 旗下号挂的主账号 user_id（非孤儿） */
  parent_user_id?: number;
  /** 旗下号挂的主账号展示名 */
  parent_nickname?: string;

  /** 老字段——兼容已发布客户端，不要在新逻辑里使用 */
  from_user_id?: number;
  from_username?: string;
};

/** CommentAuthor 等价于 AuthorInfo——保留旧名字给已有调用方 */
export type CommentAuthor = AuthorInfo;

export type CommentItem = {
  id: number;
  content: string;
  images?: string[];
  user_id?: number;
  parent_id?: number;
  reply_id?: number;
  type?: number;
  like_count?: number;
  created_at?: string;
  author?: AuthorInfo;
  reply_to_author?: AuthorInfo;
  reply_count?: number;
  is_liked?: boolean;
  top_replies?: CommentItem[];
};

export const EXT_TYPE_COMMENT = 5;

/** extType: 1帖 2问 3答 4商品 */
export async function listComments(
  extType: number,
  id: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{ list: CommentItem[]; total: number }>(
    `/comments/${extType}/${id}${buildQuery({ page, pageSize })}`,
  );
}

export async function listReplies(
  extType: number,
  id: number,
  commentId: number,
  page = 1,
  pageSize = 50,
) {
  return apiRequest<{ list: CommentItem[]; total: number }>(
    `/comments/${extType}/${id}/${commentId}/replies${buildQuery({ page, pageSize })}`,
  );
}

export async function postComment(
  extType: number,
  id: number,
  body: { content: string; parent_id?: number; reply_id?: number },
) {
  return apiRequest<{ id: number }>(`/comments/${extType}/${id}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function likeAdd(extType: number, id: number) {
  return apiRequest<unknown>(`/like/${extType}/${id}`, { method: 'POST' });
}

export async function likeRemove(extType: number, id: number) {
  return apiRequest<unknown>(`/like/${extType}/${id}`, { method: 'DELETE' });
}

export async function collectAdd(extType: number, id: number, collectId = 0) {
  return apiRequest<unknown>(`/collect/${extType}/${id}`, {
    method: 'POST',
    body: JSON.stringify({ collect_id: collectId }),
  });
}

export async function collectRemove(extType: number, id: number, collectId = 0) {
  return apiRequest<unknown>(
    `/collect/${extType}/${id}${buildQuery({ collect_id: collectId })}`,
    { method: 'DELETE' },
  );
}

/**
 * 我的收藏列表（需登录）
 * GET /user/collects?ext_type=&page=&page_size=
 */
export async function listUserCollects(
  extType: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: unknown[];
    total: number;
    page: number;
    page_size: number;
  }>(
    `/user/collects${buildQuery({
      ext_type: extType,
      page,
      page_size: pageSize,
    })}`,
  );
}
