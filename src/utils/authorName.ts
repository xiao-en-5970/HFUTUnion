/**
 * 作者展示统一工具
 *
 * 个人展示页改造后（详见 QQ-bot/skill/bot/SKILL.md "个人展示页"段）：
 *   - 后端给所有作者卡片都返回 nickname（旗下号是 QQ 昵称/群名片，普通用户是自填昵称）
 *   - 不再用"（来自用户 xxx）"后缀——主账号关联关系**只**在个人展示页里以"关联自「xxx」"
 *     子卡片的形式展示；列表 / 评论区作者名保持单纯，避免视觉噪声
 *   - 旗下号身份在前端通过 author.account_type == 2 单独打 "QQ 智能体" tag 标识，
 *     不再混入名字里
 *
 * 故意只导出一个 `formatAuthorName`，让各页面口径一致——nickname 优先、空时 fallback 到 username。
 */

/**
 * 作者基础信息（跟后端 vo.AuthorProfile / good.go::getUserBrief 字段口径一致）
 *
 * - `nickname` 优先展示；后端 enrich 时会按"nickname || username" fallback 填好，前端拿到通常非空
 * - `avatar` 是完整 URL（QQ 头像或上传头像，后端统一处理）
 * - `account_type` 1=普通 / 2=QQ 旗下号（用于打 tag）
 * - `parent_user_id` / `parent_nickname` 旗下号挂的主账号——仅在个人展示页用
 * - `from_user_id` / `from_username` 老字段，仅做兼容；新代码用 parent_*
 */
export type AuthorBrief = {
  id: number;
  username?: string;
  nickname?: string;
  avatar?: string;
  account_type?: number;
  parent_user_id?: number;
  parent_nickname?: string;
  from_user_id?: number;
  from_username?: string;
};

/** 作者名 fallback 文案 */
const FALLBACK_NAME = '用户';

/**
 * 格式化作者展示名——nickname 优先；不再添加任何后缀。
 *
 * @param author API 响应里的作者字段（可选）
 * @param fallback author 不存在时的占位（默认 "用户"）
 */
export function formatAuthorName(
  author?: AuthorBrief | null,
  fallback: string = FALLBACK_NAME,
): string {
  if (!author) return fallback;
  const nick = author.nickname?.trim();
  if (nick) return nick;
  const name = author.username?.trim();
  return name || fallback;
}

/**
 * 作者是否为 QQ 旗下号（"QQ 智能体"）。
 * 前端用来给作者卡片打 tag。
 */
export function isQQChildAuthor(author?: AuthorBrief | null): boolean {
  return !!author && author.account_type === 2;
}
