/** 分页追加时按 id 去重合并 */
export function mergeById<T extends { id: number }>(prev: T[], batch: T[]): T[] {
  const ids = new Set(prev.map((x) => x.id));
  const next = [...prev];
  for (const r of batch) {
    if (!ids.has(r.id)) {
      next.push(r);
      ids.add(r.id);
    }
  }
  return next;
}
