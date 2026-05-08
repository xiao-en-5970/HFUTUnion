import { apiRequest, buildQuery } from './client';

export type UserInfo = {
  id?: number;
  username?: string;
  avatar?: string;
  background?: string;
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
