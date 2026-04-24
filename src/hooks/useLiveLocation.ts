import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ensureAndroidFineLocation,
  watchGpsPosition,
  type GpsPosition,
  type WatchOptions,
} from '../utils/locationGps';

export type UseLiveLocationOptions = WatchOptions & {
  /** 是否启用订阅。关闭后立即取消订阅。默认 true */
  enabled?: boolean;
  /** 初始值（例如 route 页传入路由参数里的 origin） */
  initial?: GpsPosition;
  /** 进入后台时自动暂停订阅，前台恢复时重新启用。默认 true */
  pauseInBackground?: boolean;
};

export type UseLiveLocationResult = {
  /** 最新位置（null 表示还没拿到过） */
  position: GpsPosition | null;
  /** 最近一次错误；成功时会被清空 */
  error: unknown | null;
  /** 订阅是否激活 */
  active: boolean;
};

/**
 * 订阅当前 GPS 位置，默认每 3 秒刷新一次。
 *
 * - 自动处理 Android 权限（未授权会停留在 error 态而不是抛出）
 * - 进入后台时暂停订阅，前台恢复后自动续订，减少耗电
 * - 卸载 / enabled 置 false 时清理订阅
 */
export function useLiveLocation(opts: UseLiveLocationOptions = {}): UseLiveLocationResult {
  const enabled = opts.enabled ?? true;
  const pauseInBackground = opts.pauseInBackground ?? true;

  const [position, setPosition] = useState<GpsPosition | null>(opts.initial ?? null);
  const [error, setError] = useState<unknown | null>(null);
  const [active, setActive] = useState(false);

  /** watchOptions 通过 ref 传入，避免因对象引用变化导致的重复订阅 */
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      const ok = await ensureAndroidFineLocation();
      if (cancelled) return;
      if (!ok) {
        setError(new Error('location permission denied'));
        setActive(false);
        return;
      }
      unsubscribe = watchGpsPosition(
        (pos) => {
          setPosition(pos);
          setError(null);
        },
        (err) => setError(err),
        {
          intervalMs: optsRef.current.intervalMs ?? 3000,
          highAccuracy: optsRef.current.highAccuracy ?? true,
          requestTimeoutMs: optsRef.current.requestTimeoutMs,
        },
      );
      setActive(true);
    };

    const stop = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      setActive(false);
    };

    // 首次启动
    start().catch((e) => setError(e));

    // 前后台切换：进入后台停，回前台开
    let appSub: { remove: () => void } | null = null;
    if (pauseInBackground) {
      appSub = AppState.addEventListener('change', (next) => {
        if (next === 'active') {
          if (!unsubscribe && !cancelled) start().catch((e) => setError(e));
        } else if (next === 'background' || next === 'inactive') {
          stop();
        }
      });
    }

    return () => {
      cancelled = true;
      stop();
      appSub?.remove();
    };
  }, [enabled, pauseInBackground]);

  return { position, error, active };
}
