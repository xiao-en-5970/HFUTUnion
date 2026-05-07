/**
 * app 内更新功能 —— 两段式拉取：
 *
 *   1. GET /api/v1/app/release-info-url       (后端公开接口，无需 JWT)
 *      → { url: "https://oss.xiaoen.xyz/app-release/android/latest.json" | "" }
 *      url 为空时表示功能关闭，前端跳过更新检查。
 *
 *   2. GET <url>                              (OSS / GitHub Release / 任意 CDN)
 *      → { version_name, version_code, apk_url, release_notes?, force_update? }
 *
 * 这样换 OSS / 切到 GitHub Release / 紧急下线"更新弹窗"功能都靠后端环境变量控制，
 * 不需要重发前端。
 *
 * OSS JSON 契约（详见 hfut-front/APP-UPDATE.md）：
 *
 *   {
 *     "version_name":  "1.0.5",
 *     "version_code":  10005,
 *     "apk_url":       "https://oss.xiaoen.xyz/app-release/android/HFUTUnion-1.0.5.apk",
 *     "release_notes": "支持 app 内更新检查",
 *     "force_update":  false
 *   }
 *
 * 字段说明：
 *   - version_name: 语义版本号字符串，前端展示用
 *   - version_code: 整数版本号；前端比对用，必须跟 build.gradle::versionCode 一致
 *                   （build-apk.sh 自动算 X*10000 + Y*100 + Z）
 *   - apk_url:      apk 完整 URL；前端 Linking.openURL 跳浏览器下载（任意公开链接均可）
 *   - release_notes: 发布说明，纯文本或 markdown
 *   - force_update: true 时弹窗禁用"下次再说/忽略"按钮
 *
 * 兼容性：
 *   - 后端接口挂 / 返回空 url / OSS JSON 404 / 字段缺失 都返 null（不打扰主流程）
 */

import { apiRequest } from './client';

export type AppLatestVersion = {
  version_name: string;
  version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
};

/** 后端 /app/release-info-url 接口返回体。 */
type ReleaseInfoURLResp = {
  url: string;
};

/**
 * 拉最新版本元信息——先拿 OSS URL，再 fetch JSON。
 *
 * 任意一步失败都返 null（按"无更新"处理），不抛异常。
 */
export async function fetchAppLatestVersion(): Promise<AppLatestVersion | null> {
  // 第一步：找后端要 OSS URL
  let infoURL = '';
  try {
    const resp = await apiRequest<ReleaseInfoURLResp>('/app/release-info-url', {
      skipAuth: true,
    });
    infoURL = (resp?.url ?? '').trim();
  } catch (e) {
    if (__DEV__) {
      console.warn('[appUpdate] /app/release-info-url 失败', e);
    }
    return null;
  }
  if (!infoURL) {
    // 后端把功能关了（环境变量 APP_RELEASE_INFO_URL 设为空）；按设计静默
    return null;
  }

  // 第二步：fetch OSS 上的 JSON
  // 加 ?_=<ts> cache-buster 是为了对抗七牛 / 浏览器层的 HTTP 缓存——
  // latest.json 改了之后 CDN 边缘节点可能仍是旧版，加时间戳强制走源站。
  const sep = infoURL.includes('?') ? '&' : '?';
  const url = `${infoURL}${sep}_=${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (e) {
    if (__DEV__) {
      console.warn('[appUpdate] fetch failed', url, e);
    }
    return null;
  }
  if (!res.ok) {
    if (__DEV__) {
      console.warn('[appUpdate] non-2xx', res.status, url);
    }
    return null;
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    if (__DEV__) {
      console.warn('[appUpdate] JSON 解析失败', e);
    }
    return null;
  }
  if (!isAppLatestVersion(json)) {
    if (__DEV__) {
      console.warn('[appUpdate] JSON schema 不符', json);
    }
    return null;
  }
  return json;
}

/** 运行时校验——OSS JSON 是手动维护的，要防字段缺失/类型错。 */
function isAppLatestVersion(v: unknown): v is AppLatestVersion {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.version_name === 'string' &&
    typeof o.version_code === 'number' &&
    typeof o.apk_url === 'string' &&
    o.apk_url.length > 0 &&
    (typeof o.release_notes === 'string' ||
      typeof o.release_notes === 'undefined') &&
    (typeof o.force_update === 'boolean' ||
      typeof o.force_update === 'undefined')
  );
}
