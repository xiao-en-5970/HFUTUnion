// listInvalidate.ts
// ─────────────────────────────────────────────────────────────────────────────
// 列表"失效信号"中心。解决以下问题：
//
//   - 商品列表用推荐分排序（含 view_count），用户每点开一次详情 view_count++，
//     回到列表 useFocusEffect 又重新拉第一页，分数变了 → 顺序抖动。
//   - 用户的真实诉求："只有我主动下拉 / 切排序 / 进了创建页等显式动作之后，
//     列表才需要刷新；从详情页普通返回时不要重排"。
//
// 所以默认行为是：focus 不再无脑触发 reload。改成"任何会**确实改变列表内容**
// 的动作（创建商品、下架成功……）显式调 markListDirty(kind)；列表 focus 时
// 只在 dirty 被置位时才 consume 并 reload"。
//
// 简单的进程内 dirty bit + 订阅模型，刻意不持久化——重启 app 一切归位是合理的。
// ─────────────────────────────────────────────────────────────────────────────

export type ListKind = 'goodMarket' | 'helpFeed';

const dirty: Record<ListKind, boolean> = {
  goodMarket: false,
  helpFeed: false,
};

/** 显式标记某类列表"内容已变"，下次 focus 时该列表会 reload 一次。 */
export function markListDirty(kind: ListKind): void {
  dirty[kind] = true;
}

/**
 * 取出并清零某类列表的 dirty 标记。
 * @returns 取出前是否为 true（true → 调用方应该 reload）
 */
export function consumeListDirty(kind: ListKind): boolean {
  const v = dirty[kind];
  dirty[kind] = false;
  return v;
}
