import { apiRequest, buildQuery } from './client';

export type UserInfo = {
  id?: number;
  username?: string;
  /** 展示名；后端 fallback 到 username 永远非空 */
  nickname?: string;
  avatar?: string;
  /** 个性签名/一句话介绍（B 站个人页风格）；空串表示未填 */
  bio?: string;
  background?: string;
  follow_count?: number;
  fans_count?: number;
  /** >0 表示已完成学籍认证绑定 */
  school_id?: number;
  school_name?: string;
  /**
   * 当前主账号绑定的 QQ 旗下账号 user_id。
   * 后端在 /user/info 里返回（详见 vo/response.UserInfo + QQ-bot/skill/bot/SKILL.md
   * "数据聚合 / 操作权限"段）；非零即表示当前主账号已挂着一个 QQ 旗下账号。
   * 前端用来在 "QQ 认证" 页区分 已绑 / 未绑 状态。
   */
  qq_child_user_id?: number;
  /** 已绑 QQ 号字符串展示用；当 qq_child_user_id > 0 时有值 */
  qq_child_qq_number?: string;
};

/** GET /user/:id 返回的公开个人展示页信息——B 站风格 */
export type UserProfile = {
  id: number;
  username: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  background?: string;
  follow_count: number;
  fans_count: number;
  created_at: string;
  /** 1 普通账号 / 2 QQ 旗下号 */
  account_type: number;
  /** 旗下号挂的主账号（非孤儿） */
  parent_user_id?: number;
  parent_nickname?: string;
  /** viewer 是否关注此 user */
  is_following: boolean;
  /** 此 user 是否关注 viewer（与 is_following 同真 = 互关） */
  is_followed_by: boolean;
  /** viewer 就是这个 user 本人 */
  is_self: boolean;
};

/** 关注 / 取关 / 列表项里的"用户简略" */
export type FollowedUserBrief = {
  id: number;
  username: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  account_type: number;
  is_following: boolean;
  is_followed_by: boolean;
};

export type FollowResult = {
  is_following: boolean;
  fans_count: number;
  follow_count: number;
};

export type SchoolItem = { id: number; name: string; code: string };

/** 与后端 model.FormFieldItem、管理后台「绑定学校」一致 */
export type FormFieldItem = {
  key: string;
  label_zh?: string;
  label_en?: string;
};

/** GET /schools/:id 用于动态表单 */
export type SchoolBindDetail = {
  id: number;
  name?: string;
  code?: string;
  form_fields: FormFieldItem[];
  captcha_url?: string | null;
  login_url?: string | null;
};

/** GET /schools/:id/captcha — 与后台一致：base64 图片 + token */
export type SchoolCaptchaPayload = {
  image: string;
  token: string;
};

export type UserLocation = {
  id: number;
  label?: string;
  addr: string;
  lat?: number | null;
  lng?: number | null;
  is_default?: boolean;
};

/**
 * 后端 POST /user/login 在双 token 模型下返回：
 *
 *   { access_token, refresh_token, expires_in, token_type }
 *
 * 旧接口签名是 `Promise<string>`（直接是 token 字符串）；为兼容 RN 早期登录页，本函数
 * 仍允许调用方按 string 解构（取 access_token），后续切到 setTokens 会更稳。
 */
export type LoginTokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export async function login(username: string, password: string) {
  return apiRequest<LoginTokenPair>('/user/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuth: true,
  });
}

export async function register(
  username: string,
  password: string,
  re_password: string,
) {
  return apiRequest<{ user_id: number }>('/user/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, re_password }),
    skipAuth: true,
  });
}

export async function fetchUserInfo() {
  return apiRequest<UserInfo>('/user/info');
}

export async function updateUser(body: Record<string, unknown>) {
  return apiRequest<unknown>('/user/update', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function logout() {
  return apiRequest<unknown>('/user/logout');
}

export async function fetchSchools(page = 1, pageSize = 100) {
  return apiRequest<{ list: SchoolItem[]; total: number }>(
    `/schools${buildQuery({ page, pageSize })}`,
  );
}

export async function fetchSchoolDetail(id: number) {
  return apiRequest<SchoolBindDetail>(`/schools/${id}`);
}

export async function fetchSchoolCaptcha(schoolId: number) {
  return apiRequest<SchoolCaptchaPayload>(`/schools/${schoolId}/captcha`);
}

export async function bindSchool(body: {
  school_id: number;
  username: string;
  password: string;
  captcha?: string;
  captcha_token?: string;
}) {
  return apiRequest<unknown>('/user/bind/school', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchUserLocations() {
  const data = await apiRequest<{ list: UserLocation[] }>('/user/locations');
  return data.list ?? [];
}

export async function createUserLocation(body: {
  label?: string;
  addr: string;
  lat?: number | null;
  lng?: number | null;
  is_default?: boolean;
}) {
  return apiRequest<{ id: number }>('/user/locations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteUserLocation(id: number) {
  return apiRequest<unknown>(`/user/locations/${id}`, { method: 'DELETE' });
}

export async function setDefaultLocation(id: number) {
  return apiRequest<unknown>(`/user/locations/${id}/default`, {
    method: 'POST',
  });
}

// =============================================================================
// 个人展示页 / 关注关系（详见后端 controller/follow.go + service/follow.go）
// =============================================================================

/** GET /user/:id —— 个人展示页核心接口 */
export async function fetchUserProfile(userId: number) {
  return apiRequest<UserProfile>(`/user/${userId}`);
}

/** POST /user/:id/follow —— 关注 */
export async function followUser(userId: number) {
  return apiRequest<FollowResult>(`/user/${userId}/follow`, { method: 'POST' });
}

/** DELETE /user/:id/follow —— 取关 */
export async function unfollowUser(userId: number) {
  return apiRequest<FollowResult>(`/user/${userId}/follow`, { method: 'DELETE' });
}

export type FollowListResp = {
  list: FollowedUserBrief[];
  total: number;
  page: number;
  page_size: number;
};

/** GET /user/:id/following —— 列出 user :id 关注的人 */
export async function listFollowing(userId: number, page = 1, pageSize = 30) {
  return apiRequest<FollowListResp>(
    `/user/${userId}/following${buildQuery({ page, pageSize })}`,
  );
}

/** GET /user/:id/followers —— 列出 user :id 的粉丝 */
export async function listFollowers(userId: number, page = 1, pageSize = 30) {
  return apiRequest<FollowListResp>(
    `/user/${userId}/followers${buildQuery({ page, pageSize })}`,
  );
}
