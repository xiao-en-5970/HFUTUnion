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
