import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const TOKEN_KEY = 'token';

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
  const res = await fetch(url, { ...rest, headers });
  const json = await parseJson(res);

  if (json.code !== 200) {
    throw new Error(json.message || '请求失败');
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
