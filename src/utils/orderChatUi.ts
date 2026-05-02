/** 买方下单/确认付款后发出的固定说明（后接付款凭证图） */
export const ORDER_CHAT_BUYER_PAYMENT_CONFIRM =
  '我已向卖家付款，请核对收款凭证（下图）。';

/** 卖方点击「确认收款」后发出的固定说明（后接收款证明图） */
export const ORDER_CHAT_SELLER_RECEIPT_CONFIRM =
  '我已确认收款，将按约定履约。';

/** goods_category 2 = 有偿求助；其他视为二手商品 */
export const GOODS_CATEGORY_HELP = 2;

/**
 * 与后端 constant/order.go、orderToMap 状态文案对齐的聊天列表角标（分买家/卖家视角）
 * goods_type: 1 送货上门 2 自提 3 在线
 * goods_category: 2 求助时走独立三步流程（发布者=schema seller）
 */
export function chatListStatusLabel(
  perspective: 'buyer' | 'seller',
  orderStatus: number,
  goodsType?: number,
  goodsCategory?: number,
): string {
  if (goodsCategory === GOODS_CATEGORY_HELP) {
    // 对求助：schema seller=发布者（出酬劳），schema buyer=接单者（收酬劳）
    if (perspective === 'buyer') {
      switch (orderStatus) {
        case 1:
          return '进行中 · 对方将付酬';
        case 3:
          return '待确认收到酬劳';
        case 4:
          return '已完成';
        case 5:
          return '已取消';
        default:
          return '';
      }
    }
    switch (orderStatus) {
      case 1:
        return '进行中 · 待付酬';
      case 3:
        return '已付酬 · 待对方确认';
      case 4:
        return '已完成';
      case 5:
        return '已取消';
      default:
        return '';
    }
  }
  const gt = goodsType ?? 0;
  if (perspective === 'buyer') {
    switch (orderStatus) {
      case 6:
        return '待完善地址与付款';
      case 1:
        return '待卖方确认收款';
      case 2:
        if (gt === 2) {
          return '待卖方送达/自提';
        }
        if (gt === 1) {
          return '待卖方送达';
        }
        return '履约中';
      case 3:
        return '待收货';
      case 4:
        return '售后中';
      case 5:
        return '已取消';
      default:
        return '';
    }
  }
  switch (orderStatus) {
    case 6:
      return '待买方完善地址';
    case 1:
      return '待确认收款';
    case 2:
      if (gt === 2) {
        return '待买方自提';
      }
      if (gt === 1) {
        return '待送达';
      }
      return '履约中';
    case 3:
      return '待买方收货';
    case 4:
      return '售后中';
    case 5:
      return '已取消';
    default:
      return '';
  }
}
