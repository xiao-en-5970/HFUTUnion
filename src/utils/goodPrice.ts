/**
 * 商品售价展示：negotiable=true →「面议」。否则按分标价（含免费送 ¥0.00，negotiable=false）。
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
