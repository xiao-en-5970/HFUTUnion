import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';
import { clearCachedUserInfo } from '../utils/userCache';
import {
  clearRefreshToken,
  getRefreshToken as readRefreshToken,
  setRefreshToken as writeRefreshToken,
} from './refreshTokenStorage';

/**
 * 双 token 模型（与后端 package/util/jwt.go 对齐）：
 *
 *   - access_token  5 分钟。每次业务请求带它；过期后用 refresh_token 自动换发，
 *     由本文件的拦截器统一处理，业务层无感知。AccessToken 短命，泄漏窗口小，仍存
 *     AsyncStorage（普通沙盒明文）。
 *   - refresh_token 30 天。**敏感凭证**——存储抽离到 ./refreshTokenStorage.ts，
 *     当前临时落 AsyncStorage（混淆 key），TODO 升级到 react-native-keychain
 *     即 iOS Keychain / Android Keystore，硬件级加密，root 也读不到。详见
 *     refreshTokenStorage.ts 头部注释。
 *
 * 兼容：
 *
 *   - 旧客户端 / 早期版本只存了 'token' 字段——首次启动时一次性读出来当 access 复用，
 *     避免老用户被强制重新登录。
 *   - 后端 admin login 同时返回 token / access_token 字段；前端统一以 access_token 为准。
 */
const ACCESS_KEY = 'access_token';
const LEGACY_KEY = 'token';

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export async function getToken(): Promise<string | null> {
  const fresh = await AsyncStorage.getItem(ACCESS_KEY);
  if (fresh) return fresh;
  // 老 'token' key 兜底：只读不删，等用户实际刷一次 refresh 再升级到双 token 存储。
  return AsyncStorage.getItem(LEGACY_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return readRefreshToken();
}

/**
 * setToken 兼容旧调用方（LoginScreen 旧逻辑只传 access）；新代码请用 setTokens。
 */
export async function setToken(access: string): Promise<void> {
  await AsyncStorage.setItem(ACCESS_KEY, access);
  await AsyncStorage.removeItem(LEGACY_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await AsyncStorage.setItem(ACCESS_KEY, access);
  await AsyncStorage.removeItem(LEGACY_KEY);
  // refresh 走专用的安全存储，跟 access 隔离
  await writeRefreshToken(refresh);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, LEGACY_KEY]);
  await clearRefreshToken();
}

export type ApiEnvelope<T> = {
  code: number;
  message: string;
  data?: T;
};

export class ApiError extends Error {
  code: number;
  data?: unknown;
  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

async function parseJson(res: Response): Promise<ApiEnvelope<unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiEnvelope<unknown>;
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

/**
 * 业务码：access token 已过期。后端 middleware/jwt.go 给的统一标识。
 * 前端见到这个码就触发一次 refresh + 原请求重试。
 */
const CODE_ACCESS_EXPIRED = 4011;
/** 业务码：未登录 / token 无效 / refresh 也失效。 */
const CODE_UNAUTHORIZED = 401;

/**
 * refresh 全局并发去重：多请求同时 401 时只刷一次。
 * 同一时刻第 2~N 个请求都 await 同一个 promise。
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const refresh = await getRefreshToken();
      if (!refresh) return null;
      const res = await fetch(`${API_BASE}/user/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const json = await parseJson(res);
      if (json.code !== 200 || !json.data) return null;
      const data = json.data as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!data.access_token || !data.refresh_token) return null;
      await setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      return null;
    } finally {
      // 用 setTimeout 在下个 tick 释放，避免极端并发下两批请求都共享同一已 settle promise
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

async function fireSessionExpired() {
  await clearToken();
  try {
    await clearCachedUserInfo();
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    onSessionExpired?.();
  }, 0);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean; _retried?: boolean } = {},
): Promise<T> {
  const { skipAuth, headers: h, _retried, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(h as Record<string, string>),
  };
  if (!skipAuth) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (
    rest.body &&
    typeof rest.body === 'string' &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const method = (rest.method as string | undefined) || 'GET';
  if (__DEV__) {
    console.log(`[API] → ${method} ${url}`);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[API] fetch failed (no server log expected)', url, msg);
    throw e;
  }
  if (__DEV__) {
    console.log(`[API] ← HTTP ${res.status} ${url}`);
  }
  const json = await parseJson(res);

  if (json.code === 200) {
    return json.data as T;
  }

  // access 过期：尝试一次无感刷新 + 原请求重试。仅当：未跳过鉴权 + 还没重试过 + refresh 成功
  if (json.code === CODE_ACCESS_EXPIRED && !skipAuth && !_retried) {
    const fresh = await refreshAccessTokenOnce();
    if (fresh) {
      return apiRequest<T>(path, { ...init, _retried: true });
    }
    // refresh 失败 → 跳登录
    await fireSessionExpired();
    throw new ApiError('登录态已过期，请重新登录', CODE_UNAUTHORIZED, json.data);
  }

  // 401：未登录 / token 无效 / refresh 失效。统一清 token + 跳登录
  if (json.code === CODE_UNAUTHORIZED) {
    await fireSessionExpired();
  }
  throw new ApiError(json.message || '请求失败', json.code, json.data);
}

export function buildQuery(params: Record<string, string | number | undefined>) {
  const pairs: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') {
      pairs.push(
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      );
    }
  });
  return pairs.length ? `?${pairs.join('&')}` : '';
}
