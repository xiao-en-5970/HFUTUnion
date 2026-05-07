/**
 * 作者展示统一工具
 *
 * 设计动机（详见 QQ-bot/skill/bot/SKILL.md "数据聚合 / 操作权限"段）：
 *   QQ 旗下号挂在某个主账号下时，作者展示要带"（来自用户 xxx）"——让别人看到这条
 *   内容是**主账号 xxx 通过 QQ 渠道发的**，主账号身份不会丢失。
 *
 * 后端在 enrich 时（controller/enrich.go::buildAuthorVO + good.go::getUserBrief）
 * 会自动把非孤儿 QQ 旗下号的 parent 信息填到 from_user_id / from_username；
 * 普通账号 / 孤儿旗下号则不填。前端只要透传 author 字段调本工具即可。
 *
 * 故意只导出一个 `formatAuthorName`：避免各页面手写"username（来自用户 xxx）"
 * 拼接逻辑造成口径漂移。
 */

/**
 * 作者基础信息（跟后端 vo.AuthorProfile / good.go::getUserBrief map 字段口径一致）
 *
 * - `username` 必填，`avatar` 通常有
 * - `from_user_id` / `from_username` 仅在该作者是非孤儿 QQ 旗下号时由后端填入
 */
export type AuthorBrief = {
  id: number;
  username?: string;
  avatar?: string;
  /** 主账号 id（仅当作者为非孤儿 QQ 旗下号时由后端填） */
  from_user_id?: number;
  /** 主账号 username；前端用来拼"（来自用户 xxx）"后缀 */
  from_username?: string;
};

/** 作者名 fallback 文案（评论 / 帖子 / 商品场景共享） */
const FALLBACK_NAME = '用户';

/**
 * 格式化作者展示名。
 *
 * 规则：
 *   - 没传 author 或 username 为空 → 返回 fallback（默认 "用户"）
 *   - 有 from_username（非孤儿 QQ 旗下号）→ "username（来自用户 from_username）"
 *   - 其它（普通账号 / 孤儿旗下号）→ 直接返回 username
 *
 * @param author API 响应里的作者字段（可选）
 * @param fallback author 不存在时的占位（默认 "用户"）
 */
export function formatAuthorName(
  author?: AuthorBrief | null,
  fallback: string = FALLBACK_NAME,
): string {
  const name = author?.username?.trim();
  if (!name) {
    return fallback;
  }
  const fromName = author?.from_username?.trim();
  if (fromName) {
    return `${name}（来自用户 ${fromName}）`;
  }
  return name;
}
