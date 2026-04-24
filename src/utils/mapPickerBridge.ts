import type { LngLat } from './mapHtml';

/**
 * 地图选点 Screen 与调用方的跨屏结果桥。
 *
 * RN Navigation 原生栈不允许通过 params 传回调（会破坏序列化、崩掉 deep-link 与持久化）。
 * 这里用一个最简的一次性「挂起 resolver」：调用方在 navigate 前注册，picker 在 goBack 前 resolve。
 * 同一时刻只允许存在一个挂起的选点流程，足够满足 UI 交互（用户无法同时打开两个 picker）。
 */

type PickResult = LngLat | null;

let pending: ((value: PickResult) => void) | null = null;

/** 调用方：在 navigate 到 MapPicker 之前调用，得到一个可 await 的结果 Promise */
export function awaitMapPickerResult(): Promise<PickResult> {
  // 同时只允许一个 pending；如果有遗留就先 reject 掉避免内存泄漏
  if (pending) {
    const stale = pending;
    pending = null;
    try {
      stale(null);
    } catch {
      // noop
    }
  }
  return new Promise<PickResult>((resolve) => {
    pending = resolve;
  });
}

/** Picker 端在确认/取消/onBeforeRemove 时调用；只要有 pending 就消费一次 */
export function resolveMapPickerResult(value: PickResult): void {
  if (pending) {
    const r = pending;
    pending = null;
    try {
      r(value);
    } catch {
      // noop
    }
  }
}

/** 把米数格式化成人类友好的距离字符串 */
export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} 米`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} 公里`;
  return `${Math.round(meters / 1000)} 公里`;
}

/** 毫秒转「X 分钟 / X 小时 Y 分钟」 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `约 ${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin - h * 60;
  return m === 0 ? `约 ${h} 小时` : `约 ${h} 小时 ${m} 分`;
}

/** 两点间大圆距离（Haversine，米） */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
