import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cache:';

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${key}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIX}${key}`, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export async function cacheRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    /* noop */
  }
}
