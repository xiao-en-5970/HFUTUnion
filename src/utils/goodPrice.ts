/**
 * 商品售价展示文案：后端 negotiable=true 时价格字段常为 0，应显示「面议」。
 */
export function formatGoodPrice(
  cents: number | undefined | null,
  negotiable?: boolean | null,
): string {
  if (negotiable) {
    return '面议';
  }
  const c = cents ?? 0;
  return `¥${(c / 100).toFixed(2)}`;
}
