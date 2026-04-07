import { apiRequest, buildQuery } from './client';
import { searchArticles } from './search';

export type ArticleRow = {
  id: number;
  title?: string;
  content?: string;
  images?: string[];
  type?: number;
  like_count?: number;
  collect_count?: number;
  view_count?: number;
  created_at?: string;
  author?: { id: number; username: string; avatar?: string };
  /** 后端若返回，用于同步点赞状态 */
  is_liked?: boolean;
  liked?: boolean;
  /** 后端若返回，用于同步收藏状态 */
  is_collected?: boolean;
  collected?: boolean;
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
    }>(`/post${buildQuery({ page, pageSize })}`);
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

export async function listPostDrafts(page = 1, pageSize = 20) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
  }>(`/post/drafts${buildQuery({ page, pageSize })}`);
}

/** 提问 */
export async function listQuestions(page = 1, pageSize = 20) {
  return apiRequest<{
    list: ArticleRow[];
    total: number;
    page: number;
    page_size: number;
  }>(`/question${buildQuery({ page, pageSize })}`);
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

export async function getAnswer(id: number) {
  return apiRequest<ArticleRow>(`/answer/${id}`);
}
