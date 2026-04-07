import { apiRequest, buildQuery } from './client';

export type UserInfo = {
  id?: number;
  username?: string;
  avatar?: string;
  background?: string;
  bind_qq?: string;
  bind_wx?: string;
  bind_phone?: string;
  /** >0 表示已完成学籍认证绑定 */
  school_id?: number;
  school_name?: string;
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

export async function login(username: string, password: string) {
  return apiRequest<string>('/user/login', {
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
