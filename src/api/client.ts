import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';
import { clearCachedUserInfo } from '../utils/userCache';

const TOKEN_KEY = 'token';

/** 登录态失效（如接口返回 401）时跳转登录页，由 Navigation 注册 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export type ApiEnvelope<T> = {
  code: number;
  message: string;
  data?: T;
};

/**
 * apiRequest 在 code !== 200 时抛出的 Error，附带后端 envelope 的 code + data。
 *
 * 历史 catch 块都靠 `e?.message` 拿文案——本类继承 Error 不破坏旧路径；
 * 需要拿 retry_after_seconds / 区分 4291 锁定的页面（如 QQ 认证）可以 instanceof
 * 检查后读取 `code` / `data`。
 */
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

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, headers: h, ...rest } = init;
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
    // 未到达服务器时（DNS/断网/超时），后端不会有日志；看 Logcat 里 ReactNativeJS 是否有本行
    console.warn('[API] fetch failed (no server log expected)', url, msg);
    throw e;
  }
  if (__DEV__) {
    console.log(`[API] ← HTTP ${res.status} ${url}`);
  }
  const json = await parseJson(res);

  if (json.code !== 200) {
    if (json.code === 401) {
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
    throw new ApiError(json.message || '请求失败', json.code, json.data);
  }
  return json.data as T;
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
