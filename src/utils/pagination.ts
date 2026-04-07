/** 列表分页与去重（按 id） */
export const PAGE_SIZE = 20;

export function mergeById<T extends { id: number }>(prev: T[], next: T[]): T[] {
  const seen = new Set(prev.map((p) => p.id));
  const merged = [...prev];
  for (const row of next) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

export function hasMorePages(
  lastBatchLen: number,
  pageSize: number,
  total: number | undefined,
  currentLen: number,
): boolean {
  if (lastBatchLen === 0) {
    return false;
  }
  if (lastBatchLen < pageSize) {
    return false;
  }
  // 仅当 total 为明确正数且已拉满时结束；total 为 0 与「本页满条」矛盾时视为计数异常，继续允许翻页
  if (total !== undefined && total > 0 && currentLen >= total) {
    return false;
  }
  return true;
}

/** 发现流：同 id 可能跨 type，用 type+id 去重 */
export function mergeSearchItems<T extends { id: number; type: number }>(
  prev: T[],
  next: T[],
): T[] {
  const key = (x: T) => `${x.type}-${x.id}`;
  const seen = new Set(prev.map(key));
  const merged = [...prev];
  for (const row of next) {
    const k = key(row);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(row);
    }
  }
  return merged;
}
