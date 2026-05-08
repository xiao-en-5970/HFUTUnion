/**
 * 商品 / 求物品售价展示规则（与产品形态对齐）：
 *
 *   - negotiable=true → 「面议」
 *   - price > 0       → 标价 ¥X.XX
 *   - cat=2 (求物品) + price=0 + !negotiable → 返回空串（前端隐藏整个价格区，对应"无偿求物品"）
 *   - 其它（如 cat=1 二手 + price=0 + !negotiable） → 「免费」
 *
 * 调用方应当判断返回值是否为空决定渲染：
 *
 *   const text = formatGoodPrice(g.price, g.negotiable, g.goods_category);
 *   {text ? <Text style={styles.price}>{text}</Text> : null}
 */
export function formatGoodPrice(
  cents: number | undefined | null,
  negotiable?: boolean | null,
  category?: number | null,
): string {
  if (negotiable) {
    return '面议';
  }
  const c = cents ?? 0;
  if (c > 0) {
    return `¥${(c / 100).toFixed(2)}`;
  }
  // 求物品 (cat=2) 且无价、无面议 → 不展示价格
  if (Number(category) === 2) {
    return '';
  }
  return '免费';
}
