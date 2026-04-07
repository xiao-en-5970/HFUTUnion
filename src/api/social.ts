import { apiRequest, buildQuery } from './client';

/** extType: 1帖 2问 3答 4商品 */
export async function listComments(
  extType: number,
  id: number,
  page = 1,
  pageSize = 20,
) {
  return apiRequest<{
    list: Array<{
      id: number;
      content: string;
      images?: string[];
      user_id?: number;
      parent_id?: number;
      created_at?: string;
      author?: { id: number; username: string; avatar?: string };
    }>;
    total: number;
  }>(`/comments/${extType}/${id}${buildQuery({ page, pageSize })}`);
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
