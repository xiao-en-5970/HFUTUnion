import { apiRequest, buildQuery } from './client';
import { searchArticles } from './search';

export type ArticleRow = {
  id: number;
  title?: string;
  content?: string;
  images?: string[];
  type?: number;
  /** 1 正常 2 禁用 3 草稿 */
  status?: number;
  like_count?: number;
  collect_count?: number;
  /** 评论条数（详情/列表若返回） */
  comment_count?: number;
  view_count?: number;
  created_at?: string;
  author?: { id: number; username: string; avatar?: string };
  /** 后端若返回，用于同步点赞状态 */
  is_liked?: boolean;
  liked?: boolean;
  /** 后端若返回，用于同步收藏状态 */
  is_collected?: boolean;
  collected?: boolean;
  /** 0 或 null 表示全站公开（与后台「校外/全站」一致）；>0 为本校隔离 */
  school_id?: number | null;
  updated_at?: string;
  /** 求助列表若返回：已有回答数；综合区仅当该字段存在且为 0 时才展示该条 */
  answer_count?: number;
};

/** GET /answer/:id 与列表中的回答附带所属求助 */
export type ParentQuestionBrief = {
  id: number;
  title: string;
  content: string;
  school_id?: number | null;
};

export type AnswerRow = ArticleRow & {
  parent_question?: ParentQuestionBrief;
};

/**
 * 帖子列表模式（与 HFUT-Graduation-Project 对齐）：
 * - latest → GET /post?page&pageSize（按发布时间）
 * - recommend → GET /search/articles?type=1&sort=combined（综合排序）
 * - hot → GET /search/articles?type=1&sort=popularity（热度）
 */
export type PostFeedMode = 'latest' | 'recommend' | 'hot';

export async function listPosts(
  page = 1,
  pageSize = 20,
  opts?: { mode?: PostFeedMode },
) {
  const mode = opts?.mode ?? 'latest';
  if (mode === 'latest') {
    return apiRequest<{
      list: ArticleRow[];
      total: number;
      page: number;
      page_size: number;
    }>(`/post${buildQuery({ page, page_size: pageSize })}`);
  }
  const sort = mode === 'recommend' ? 'combined' : 'popularity';
  return searchArticles({
    type: 1,
    sort,
    page,
    page_size: pageSize,
  });
}

export async function getPost(id: number) {
  return apiRequest<ArticleRow>(`/post/${id}`);
}

export async function createPostDraft(body: {
  title?: string;
  content?: string;
  publish_status?: number;
  is_public?: number;
}) {
  return apiRequest<{ id: number }>('/post', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updatePost(
  id: number,
  body: Record<string, unknown>,
) {
  return apiRequest<unknown>(`/post/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function publishPost(id: number) {
  return apiRequest<unknown>(`/post/${id}/publish`, { method: 'POST' });
}

export async function deletePost(id: number) {
  return apiRequest<unknown>(`/post/${id}`, { method: 'DELETE' });
}

/** GET /user/:id/posts — 需登录；本人可见含私密 */
export async function listUserPosts(
  userId: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/user/${userId}/posts${buildQuery({ page, pageSize })}`);
}

/** GET /user/:id/questions */
export async function listUserQuestions(
  userId: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/user/${userId}/questions${buildQuery({ page, pageSize })}`);
}

/** GET /user/:id/answers — 我的回答 */
export async function listUserAnswers(
  userId: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/user/${userId}/answers${buildQuery({ page, pageSize })}`);
}

export async function updateQuestion(
  id: number,
  body: Record<string, unknown>,
) {
  return apiRequest<unknown>(`/question/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteQuestion(id: number) {
  return apiRequest<unknown>(`/question/${id}`, { method: 'DELETE' });
}

export async function updateAnswer(
  id: number,
  body: Record<string, unknown>,
) {
  return apiRequest<unknown>(`/answer/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteAnswer(id: number) {
  return apiRequest<unknown>(`/answer/${id}`, { method: 'DELETE' });
}

export async function listPostDrafts(page = 1, pageSize = 20) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
  }>(`/post/drafts${buildQuery({ page, pageSize })}`);
}

/** 求助列表 */
export async function listQuestions(page = 1, pageSize = 20) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/question${buildQuery({ page, page_size: pageSize })}`);
}

export async function getQuestion(id: number) {
  return apiRequest<ArticleRow>(`/question/${id}`);
}

export async function createQuestionDraft(body: {
  title?: string;
  content?: string;
  publish_status?: number;
  is_public?: number;
}) {
  return apiRequest<{ id: number }>('/question', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function publishQuestion(id: number) {
  return apiRequest<unknown>(`/question/${id}/publish`, { method: 'POST' });
}

export async function listQuestionAnswers(questionId: number, page = 1, pageSize = 20) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
  }>(`/question/${questionId}/answers${buildQuery({ page, pageSize })}`);
}

/** 拉取该求助下全部回答（分页拼接），用于回答流纵向滑动 */
export async function loadAllQuestionAnswers(
  questionId: number,
  pageSize = 50,
): Promise<ArticleRow[]> {
  const all: ArticleRow[] = [];
  let page = 1;
  while (true) {
    const res = await listQuestionAnswers(questionId, page, pageSize);
    const list = res.list || [];
    all.push(...list);
    if (list.length < pageSize) {
      break;
    }
    if (res.total != null && all.length >= res.total) {
      break;
    }
    page += 1;
  }
  return all;
}

/** 回答 */
export async function createAnswerDraft(body: {
  title?: string;
  content?: string;
  publish_status?: number;
  parent_id: number;
}) {
  return apiRequest<{ id: number }>('/answer', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function publishAnswer(id: number) {
  return apiRequest<unknown>(`/answer/${id}/publish`, { method: 'POST' });
}

/** 社区回答流：分页列出回答，含 parent_question */
export async function listAnswers(page = 1, pageSize = 20) {
  return apiRequest<{
    list: AnswerRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/answer${buildQuery({ page, page_size: pageSize })}`);
}

export async function getAnswer(id: number) {
  return apiRequest<AnswerRow>(`/answer/${id}`);
}
