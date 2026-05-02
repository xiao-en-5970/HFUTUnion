/**
 * deadline 倒计时展示工具。
 *
 * 后端返回：
 *   - has_deadline:   boolean
 *   - deadline:       ISO 字符串 | null
 *   - deadline_remaining_seconds: number | null（基于服务端 NOW() 计算；负数=已过期）
 *
 * 考虑到列表可能被客户端在前台挂很久，我们优先基于 `deadline` 当前时刻现算；
 * 若后端只给了 `deadline_remaining_seconds` 而未给 `deadline`，再用它做兜底。
 */

export type DeadlineLike = {
  has_deadline?: boolean;
  deadline?: string | null;
  deadline_remaining_seconds?: number | null;
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 毫秒差（可能为负）→ 展示字符串。
 *
 * 单位策略（按用户约定，仅展示「天 / 小时」两档，不显示分钟、不回退到具体日期）：
 *   - ms ≤ 0：已截止
 *   - ms < 24h：按小时向上取整（不足 1 小时也显示「还剩 1 小时」，避免「0 小时」噪声）
 *   - 其它：按天向下取整，直接 `还剩 N 天`（即便 N > 30 也不回退到日期）
 */
function humanizeDiff(ms: number): string {
  if (ms <= 0) {
    return '已截止';
  }
  if (ms < DAY) {
    const h = Math.max(1, Math.ceil(ms / HOUR));
    return `还剩 ${h} 小时`;
  }
  const d = Math.floor(ms / DAY);
  return `还剩 ${d} 天`;
}

/** 计算给定商品的 deadline 剩余展示；无截止时间时返回 null */
export function renderDeadlineBadge(g: DeadlineLike | undefined | null): string | null {
  if (!g || !g.has_deadline) {
    return null;
  }
  let diff: number | null = null;
  if (g.deadline) {
    const t = new Date(g.deadline).getTime();
    if (!Number.isNaN(t)) {
      diff = t - Date.now();
    }
  }
  if (diff == null && typeof g.deadline_remaining_seconds === 'number') {
    diff = g.deadline_remaining_seconds * 1000;
  }
  if (diff == null) {
    return null;
  }
  return humanizeDiff(diff);
}

/** 判断 deadline 是否已过期（用于样式降级） */
export function isDeadlineExpired(g: DeadlineLike | undefined | null): boolean {
  if (!g || !g.has_deadline) return false;
  if (g.deadline) {
    const t = new Date(g.deadline).getTime();
    if (!Number.isNaN(t)) {
      return t <= Date.now();
    }
  }
  if (typeof g.deadline_remaining_seconds === 'number') {
    return g.deadline_remaining_seconds <= 0;
  }
  return false;
}
