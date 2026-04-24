import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation, {
  type GeolocationOptions,
  type GeolocationResponse,
} from '@react-native-community/geolocation';

/**
 * Android 请求精确定位权限；iOS 在首次 getCurrentPosition 时由系统弹窗。
 */
export async function ensureAndroidFineLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const r = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

function getCurrentPositionAsync(
  options: GeolocationOptions,
): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * 获取当前经纬度：先尝试网络/基站定位（室内更快、不易超时），失败再高精度 GPS。
 * 对应常见「location request timeout」：仅开高精度时室内等待 GPS 易超时。
 */
export async function requestGpsPosition(): Promise<{
  latitude: number;
  longitude: number;
}> {
  const networkOrCached: GeolocationOptions = {
    enableHighAccuracy: false,
    timeout: 45000,
    maximumAge: 300000,
  };
  const highAccuracy: GeolocationOptions = {
    enableHighAccuracy: true,
    timeout: 90000,
    maximumAge: 0,
  };

  try {
    const pos = await getCurrentPositionAsync(networkOrCached);
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch {
    const pos = await getCurrentPositionAsync(highAccuracy);
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  }
}

export type GpsPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
};

export type WatchOptions = {
  /** 轮询/订阅刷新间隔（ms），默认 3000 */
  intervalMs?: number;
  /** 高精度模式（Android 走 GPS 硬件），默认 true */
  highAccuracy?: boolean;
  /** 单次获取的超时（ms），默认为 intervalMs - 500 */
  requestTimeoutMs?: number;
};

/**
 * 持续订阅当前位置。
 *
 * 实现策略：
 * - 同时调用 Geolocation.watchPosition 和 setInterval 轮询 getCurrentPosition。
 *   - watchPosition：在移动时可能给出更高频率的更新（依平台/Play Services 而定）
 *   - setInterval(getCurrentPosition)：保证至少 intervalMs 内必有一次更新，
 *     在 Android 没有 Google Play Services / 模拟器环境下依然能按节奏刷新
 * - onUpdate 去抖：同一毫秒同一坐标不重复派发
 *
 * 返回取消订阅函数。
 */
export function watchGpsPosition(
  onUpdate: (pos: GpsPosition) => void,
  onError?: (err: unknown) => void,
  options: WatchOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 3000;
  const highAccuracy = options.highAccuracy ?? true;
  const requestTimeoutMs = options.requestTimeoutMs ?? Math.max(1000, intervalMs - 500);

  let canceled = false;
  let lastDispatchKey = '';

  const dispatch = (pos: GeolocationResponse) => {
    if (canceled) return;
    const key = `${pos.timestamp}|${pos.coords.latitude}|${pos.coords.longitude}`;
    if (key === lastDispatchKey) return;
    lastDispatchKey = key;
    onUpdate({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      timestamp: pos.timestamp,
    });
  };

  const dispatchErr = (err: unknown) => {
    if (canceled) return;
    onError?.(err);
  };

  let watchId: number | null = null;
  try {
    watchId = Geolocation.watchPosition(dispatch, dispatchErr, {
      enableHighAccuracy: highAccuracy,
      distanceFilter: 0,
      // interval / fastestInterval 仅当走 Google Play Services 时生效，作为友好提示
      interval: intervalMs,
      fastestInterval: Math.max(1000, Math.floor(intervalMs / 2)),
      useSignificantChanges: false,
    } as GeolocationOptions & {
      distanceFilter?: number;
      interval?: number;
      fastestInterval?: number;
      useSignificantChanges?: boolean;
    });
  } catch (e) {
    dispatchErr(e);
  }

  // 兜底轮询：保证 intervalMs 内至少一次刷新
  const timer = setInterval(() => {
    if (canceled) return;
    Geolocation.getCurrentPosition(dispatch, dispatchErr, {
      enableHighAccuracy: highAccuracy,
      timeout: requestTimeoutMs,
      maximumAge: 0,
    });
  }, intervalMs);

  // 订阅建立后立即触发一次，避免等首个周期
  Geolocation.getCurrentPosition(dispatch, dispatchErr, {
    enableHighAccuracy: false,
    timeout: requestTimeoutMs,
    maximumAge: intervalMs,
  });

  return () => {
    canceled = true;
    if (watchId != null) {
      try { Geolocation.clearWatch(watchId); } catch { /* noop */ }
    }
    clearInterval(timer);
  };
}

/** 用于 Alert 的简短说明（含超时码） */
export function formatGpsErrorMessage(err: unknown): string {
  const e = err as { code?: number; message?: string };
  const msg = e?.message || '';
  if (e?.code === 3 || /timeout/i.test(msg)) {
    return '定位超时。可稍后再试、到窗边或室外，或改用地址簿中的地址。';
  }
  if (e?.code === 1 || /denied/i.test(msg)) {
    return '定位权限被拒绝，请在系统设置中允许定位。';
  }
  return msg || '请检查定位权限与 GPS 开关';
}
