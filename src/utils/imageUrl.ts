/**
 * 缩略图 / 原图 URL 互转——后端有两种缩略图实现，前端要都兼容。
 *
 * 1. 七牛模式（OSS_DRIVER=qiniu，详见 HFUT/package/oss/oss.go::ToFullURL）：
 *    缩略图：`https://oss.xiaoen.xyz/path.jpg?imageView2/2/w/720/q/75`
 *    原 图：`https://oss.xiaoen.xyz/path.jpg`
 *    缩略由 query 实现，URL 写入 DB 时不带 query；展示时由后端拼出 query 给前端。
 *
 * 2. 本地模式（OSS_DRIVER=local）：
 *    缩略图：`<host>/api/v1/oss/path.jpg.small`
 *    原 图：`<host>/api/v1/oss/path.jpg`
 *    用 `.small` 后缀实现，旧路径也走这个分支。
 *
 * 字符串工具，无网络请求；对未识别的 URL 原样返回不报错。
 */

/** 跟后端 OSS_SMALL_IMAGE_SIZE 默认值对齐；前端只在收到"裸原图 URL"时主动生成缩略图。 */
const QINIU_THUMB_WIDTH = 720;

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(?=([?#]|$))/i;
const QINIU_IMAGE_VIEW_RE = /[?&]imageView2\//;

/**
 * thumbnailImageUrl 把任意 URL 转为对应的缩略图 URL。
 *
 * 已经是缩略图（带 imageView2 query 或 .small 后缀）→ 原样返回。
 * 七牛裸 URL（https + 图片扩展名 + 无 query）→ 加 `?imageView2/2/w/720/q/75`。
 * 老相对路径或本地完整 URL → 加 `.small` 后缀。
 *
 * 实际场景下后端返给前端的 URL 已经是缩略图，本函数主要起 idempotent + 防御作用。
 */
export function thumbnailImageUrl(url: string | undefined | null): string {
  if (url == null || typeof url !== 'string') {
    return '';
  }
  const u = url.trim();
  if (!u) {
    return '';
  }
  if (QINIU_IMAGE_VIEW_RE.test(u)) {
    return u;
  }
  if (/\.small(?:[?#]|$)/i.test(u)) {
    return u;
  }
  if (!IMAGE_EXT_RE.test(u)) {
    return u;
  }
  // 七牛裸 URL（https/http 开头）→ 走 imageView2 query
  if (/^https?:\/\//i.test(u)) {
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}imageView2/2/w/${QINIU_THUMB_WIDTH}/q/75`;
  }
  // 老相对路径 → 加 .small 后缀（保留旧逻辑）
  return u.replace(IMAGE_EXT_RE, '.$1.small');
}

/**
 * originalImageUrl 把缩略图 URL 还原为原图 URL。
 *
 * 七牛形式：去掉 `?imageView2/...` query（后端 ToFullURL 只会加这一个 query，
 * 安全起见整个 query 字符串一起去掉）。
 * 本地形式：去掉 `.jpg.small` / `.small` 后缀。
 *
 * 已经是原图（无 query 也无 .small）→ 原样返回。
 */
export function originalImageUrl(url: string | undefined | null): string {
  if (url == null || typeof url !== 'string') {
    return '';
  }
  let u = url.trim();
  if (!u) {
    return '';
  }
  // 七牛 URL 带 imageView2 query → 整 query 去掉（保留 fragment）
  const qIdx = u.indexOf('?');
  if (qIdx >= 0 && QINIU_IMAGE_VIEW_RE.test(u.slice(qIdx))) {
    const fIdx = u.indexOf('#', qIdx);
    u = fIdx >= 0 ? u.slice(0, qIdx) + u.slice(fIdx) : u.slice(0, qIdx);
  }
  // 本地：path.jpg.small / path.png.small → path.jpg / path.png
  u = u.replace(/\.([a-z0-9]+)\.small$/i, '.$1');
  if (u.endsWith('.small')) {
    u = u.slice(0, -'.small'.length);
  }
  return u;
}
