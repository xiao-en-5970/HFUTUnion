import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 本地「已看过」跟踪器：当用户点击列表卡片进入详情时打标，列表再次渲染时用灰字提示。
 *
 * 设计要点：
 * - 内存 Set + AsyncStorage 落盘，读是同步（hook 订阅），写是异步（markViewed）
 * - 每类最多保留 MAX_PER_KIND 条，超限按插入顺序 LRU 丢弃最老的
 * - 订阅者统一收到变更通知，不同屏幕都能即时变灰
 * - 纯本地，不依赖登录态；卸载重装或清数据即重置
 */

export type ViewedKind = 'post' | 'question' | 'answer' | 'good';

const MAX_PER_KIND = 5000;
const STORAGE_KEY = (k: ViewedKind) => `viewed:${k}:v1`;

/** 内存快照；首次读取某类时从 AsyncStorage 加载一次 */
const memory: Record<ViewedKind, Set<number> | undefined> = {
  post: undefined,
  question: undefined,
  answer: undefined,
  good: undefined,
};
const loading: Partial<Record<ViewedKind, Promise<Set<number>>>> = {};
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* listener 异常不影响其它订阅者 */
    }
  });
}

async function loadFromStorage(kind: ViewedKind): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY(kind));
    if (!raw) {
      return new Set();
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      return new Set();
    }
    return new Set(
      arr.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[],
    );
  } catch {
    return new Set();
  }
}

export async function ensureViewedLoaded(kind: ViewedKind): Promise<Set<number>> {
  const cached = memory[kind];
  if (cached) {
    return cached;
  }
  const pending = loading[kind];
  if (pending) {
    return pending;
  }
  const p = loadFromStorage(kind).then((set) => {
    memory[kind] = set;
    delete loading[kind];
    notify();
    return set;
  });
  loading[kind] = p;
  return p;
}

/** 同步查询；memory 未加载时返回 false，hook 加载完毕后会触发重渲 */
export function isViewed(kind: ViewedKind, id: number): boolean {
  const set = memory[kind];
  return set ? set.has(id) : false;
}

/** 异步打标；失败不阻断 UI，只打日志 */
export async function markViewed(kind: ViewedKind, id: number): Promise<void> {
  if (!id || !Number.isFinite(id)) {
    return;
  }
  const set = await ensureViewedLoaded(kind);
  if (set.has(id)) {
    return;
  }
  set.add(id);
  // LRU：按插入顺序丢弃最老的，Set 迭代顺序就是插入顺序
  if (set.size > MAX_PER_KIND) {
    const overflow = set.size - MAX_PER_KIND;
    const it = set.values();
    for (let i = 0; i < overflow; i += 1) {
      const next = it.next();
      if (next.done) {
        break;
      }
      set.delete(next.value);
    }
  }
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY(kind),
      JSON.stringify(Array.from(set)),
    );
  } catch {
    /* 磁盘满 / 配额耗尽：忽略，下次还会再写 */
  }
  notify();
}

/** React hook：返回指定类别的已看 Set；新增打标时自动触发重渲 */
export function useViewedSet(kind: ViewedKind): Set<number> {
  const [snapshot, setSnapshot] = useState<Set<number>>(
    () => memory[kind] ?? new Set<number>(),
  );
  useEffect(() => {
    let active = true;
    ensureViewedLoaded(kind).then((set) => {
      if (active) {
        setSnapshot(new Set(set));
      }
    });
    const off = () => {
      if (!active) {
        return;
      }
      const set = memory[kind];
      if (set) {
        setSnapshot(new Set(set));
      }
    };
    listeners.add(off);
    return () => {
      active = false;
      listeners.delete(off);
    };
  }, [kind]);
  return snapshot;
}
