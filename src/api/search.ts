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
  /** 0 / null 全站；>0 本校 */
  school_id?: number | null;
};

/** sort: combined=推荐(相关度+热度)；latest=最新发布时间；relevance/popularity/updated_at 见后端 */
export async function searchArticles(params: {
  q?: string;
  type?: number;
  page?: number;
  page_size?: number;
  sort?: 'combined' | 'latest' | 'relevance' | 'popularity' | 'updated_at' | string;
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
