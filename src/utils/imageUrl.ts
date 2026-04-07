/**
 * 由列表/消息里的地址推导缩略图 URL（`*.jpg.small` 等）。
 * 若已是 `.small` 或无法识别扩展名则原样返回。
 */
export function thumbnailImageUrl(url: string | undefined | null): string {
  if (url == null || typeof url !== 'string' || !url.trim()) {
    return '';
  }
  const u = url.trim();
  if (/\.(jpe?g|png|webp)\.small(\?|#|$)/i.test(u)) {
    return u;
  }
  return u.replace(/\.(jpe?g|png|webp)(?=(\?|#|$))/i, '.$1.small');
}

/**
 * 后端缩略图常为 `*.jpg.small` 等形式，去掉 `.small` 段得到原图 URL。
 */
export function originalImageUrl(url: string | undefined | null): string {
  if (url == null || typeof url !== 'string' || !url.trim()) {
    return '';
  }
  let u = url.trim();
  // 形如 path.jpg.small / path.png.small → path.jpg / path.png
  u = u.replace(/\.([a-z0-9]+)\.small$/i, '.$1');
  // 若仍以 .small 结尾（无中间扩展名）
  if (u.endsWith('.small')) {
    u = u.slice(0, -'.small'.length);
  }
  return u;
}
