import { apiRequest, buildQuery } from './client';

export type SearchArticleItem = {
  id: number;
  type: number;
  title?: string;
  content?: string;
  images?: string[];
  like_count?: number;
  collect_count?: number;
  view_count?: number;
  created_at?: string;
  author?: { id: number; username: string; avatar?: string };
};

export async function searchArticles(params: {
  q?: string;
  type?: number;
  page?: number;
  page_size?: number;
  sort?: string;
  visibility?: string;
  time_range?: string;
}) {
  return apiRequest<{
    list: SearchArticleItem[];
    total: number;
    page: number;
    page_size: number;
  }>(`/search/articles${buildQuery(params as Record<string, string | number | undefined>)}`);
}
