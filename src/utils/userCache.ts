import type { UserInfo } from '../api/user';
import { cacheGet, cacheRemove, cacheSet } from './cacheStorage';

const USER_INFO_KEY = 'user:info:v1';

export async function readCachedUserInfo(): Promise<UserInfo | null> {
  return cacheGet<UserInfo>(USER_INFO_KEY);
}

export async function writeCachedUserInfo(u: UserInfo): Promise<void> {
  await cacheSet(USER_INFO_KEY, u);
}

export async function clearCachedUserInfo(): Promise<void> {
  await cacheRemove(USER_INFO_KEY);
}
