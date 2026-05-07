/**
 * app 内更新功能 —— 直接从 OSS 拉手动维护的版本元信息 JSON。
 *
 * 之前用过"后端 admin 接口上传 apk"方案，撤回了；详见 src/config.ts 注释。
 *
 * OSS JSON 契约（详见 hfut-front/APP-UPDATE.md）：
 *
 *   GET https://oss.xiaoen.xyz/app-release/android/latest.json
 *     -> {
 *          "version_name":  "1.0.5",
 *          "version_code":  10005,
 *          "apk_url":       "https://oss.xiaoen.xyz/app-release/android/HFUTUnion-1.0.5.apk",
 *          "release_notes": "支持 app 内更新检查",
 *          "force_update":  false
 *        }
 *
 * 字段说明：
 *   - version_name: 语义版本号字符串，前端展示用
 *   - version_code: 整数版本号；前端比对用，必须跟 build.gradle::versionCode 一致
 *                   （build-apk.sh 自动算 X*10000 + Y*100 + Z）
 *   - apk_url:      apk 完整 URL；前端 Linking.openURL 跳浏览器下载
 *   - release_notes: 发布说明，纯文本或 markdown
 *   - force_update: true 时弹窗禁用"下次再说/忽略"按钮
 *
 * platform 字段不再由 JSON 给——改由 URL 路径区分（android/latest.json）；
 * 前端只 fetch 自己平台对应的 URL 即可。
 *
 * 兼容性：
 *   - 文件不存在时（404）返 null（首次部署 OSS 还没传文件是合理状态）
 *   - 其他网络/解析异常静默吞，下次启动再试
 */

import { APP_RELEASE_INFO_URL } from '../config';

export type AppLatestVersion = {
  version_name: string;
  version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
};

/**
 * 从 OSS 拉最新版本元信息。
 *
 * 加 ?_=<ts> cache-buster 是为了对抗七牛 / 浏览器层的 HTTP 缓存——
 * latest.json 改了之后 CDN 边缘节点可能仍是旧版，加时间戳强制走源站。
 *
 * 失败 / 404 都返 null（按"无更新"处理），不抛异常打扰主流程。
 */
export async function fetchAppLatestVersion(): Promise<AppLatestVersion | null> {
  const url = `${APP_RELEASE_INFO_URL}?_=${Date.now()}`;
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
