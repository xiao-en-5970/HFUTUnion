import { apiRequest, buildQuery } from './client';

/** 通知类型，后端 SQL 中的 type 枚举 */
export const NOTIFY_TYPE = {
  LikeArticle: 1, // 点赞了你的帖子/提问/回答/商品
  LikeComment: 2, // 点赞了你的评论
  Comment: 3, // 顶层评论
  Reply: 4, // 回复评论
  Official: 5, // 官方通知
} as const;

export type NotifyType = (typeof NOTIFY_TYPE)[keyof typeof NOTIFY_TYPE];

/** 前端用的 target_type：与后端 ExtType 一致（1 帖子 2 提问 3 回答 4 商品 5 评论） */
export const TARGET_EXT = {
  Post: 1,
  Question: 2,
  Answer: 3,
  Goods: 4,
  Comment: 5,
} as const;

export type NotificationFrom = {
  id: number;
  username: string;
  avatar: string;
};

export type NotificationItem = {
  id: number;
  type: NotifyType;
  target_type: number;
  target_id: number;
  ref_ext_type: number;
  ref_id: number;
  title: string;
  summary: string;
  image: string;
  is_read: boolean;
  /** 聚合触发者人数：点赞类会 >1（N 人点赞了你），顶层评论与回复恒为 1 */
  count?: number;
  created_at: string;
  /** 聚合最近一次更新时间（列表按此排序，缺省时后端会和 created_at 相同） */
  updated_at?: string;
  from?: NotificationFrom;
};

export type NotificationListResult = {
  list: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
};

/**
 * 消息列表的筛选分类。
 * - like   = 点赞作品 + 点赞评论（后端聚合）
 * - comment = 评论 + 回复（回复统一归入评论分类）
 * - official = 官方通知
 */
export type NotificationFilter = 'all' | 'like' | 'comment' | 'official';

/** GET /notifications */
export async function listNotifications(params: {
  page?: number;
  pageSize?: number;
  filter?: NotificationFilter;
  onlyUnread?: boolean;
}): Promise<NotificationListResult> {
  const q = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? 20,
    type: params.filter && params.filter !== 'all' ? params.filter : undefined,
    only_unread: params.onlyUnread ? 1 : undefined,
  };
  return apiRequest<NotificationListResult>(`/notifications${buildQuery(q)}`);
}

/** 未读数汇总：返回 total + 分 type 未读数，用于底栏角标与子 tab 小红点 */
export type NotificationUnreadSummary = {
  total: number;
  /** key 是 type 的字符串：'1'|'2'|'3'|'4'|'5' */
  by_type: Record<string, number>;
};

/** GET /notifications/unread_count */
export async function fetchNotificationUnread(): Promise<NotificationUnreadSummary> {
  return apiRequest<NotificationUnreadSummary>('/notifications/unread_count');
}

/** POST /notifications/read：传 ids 标记指定条，或 all=true 全部已读 */
export async function markNotificationsRead(input: {
  ids?: number[];
  all?: boolean;
  /** 仅 all=true 时生效，限定只清某类型（配合子 tab） */
  type?: NotifyType;
}): Promise<void> {
  await apiRequest<unknown>('/notifications/read', {
    method: 'POST',
    body: JSON.stringify({
      ids: input.ids,
      all: input.all ?? false,
      type: input.type ?? 0,
    }),
  });
}
