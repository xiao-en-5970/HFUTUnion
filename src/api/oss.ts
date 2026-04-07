import { API_BASE } from '../config';
import { getToken } from './client';

type OssSubfolder = 'order_messages' | 'goods' | 'articles';

/** POST /oss/user/:id/... 上传后返回可访问的 URL */
export async function uploadOssUserFile(
  userId: number,
  fileUri: string,
  mime: string,
  filename: string,
  subfolder: OssSubfolder = 'order_messages',
): Promise<string> {
  const path = `user/${userId}/${subfolder}/${Date.now()}_${filename.replace(/[^\w.-]/g, '_')}`;
  const token = await getToken();
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: mime || 'image/jpeg',
    name: filename || 'photo.jpg',
  } as any);
  const res = await fetch(`${API_BASE}/oss/${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const text = await res.text();
  let json: { code?: number; message?: string; data?: { url?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (json.code !== 200) {
    throw new Error(json.message || '上传失败');
  }
  const url = json.data?.url;
  if (!url) {
    throw new Error('上传无返回地址');
  }
  return url;
}
