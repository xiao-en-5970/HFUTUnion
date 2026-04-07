import { uploadOssUserFile } from '../api/oss';

export type PickedArticleImage = {
  key: string;
  uri: string;
  type?: string;
  fileName?: string;
};

export function newArticleImageKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isRemoteImageUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

/** 本地图走 OSS；已是 http(s) 的保留顺序 */
export async function resolveArticleImageUrls(
  userId: number,
  picks: PickedArticleImage[],
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < picks.length; i++) {
    const a = picks[i];
    if (isRemoteImageUrl(a.uri)) {
      urls.push(a.uri);
    } else {
      const url = await uploadOssUserFile(
        userId,
        a.uri,
        a.type || 'image/jpeg',
        a.fileName || `article_${i}.jpg`,
        'articles',
      );
      urls.push(url);
    }
  }
  return urls;
}
