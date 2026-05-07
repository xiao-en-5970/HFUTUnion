/**
 * QQ 认证 / 绑定 / 解绑 API。
 *
 * 后端契约（详见 HFUT-Graduation-Project/app/controller/qq_bind.go +
 * QQ-bot/skill/bot/SKILL.md "QQ 旗下账号" 段）：
 *
 *   POST /user/qq-bind/request-code   { qq_number } -> { ttl_seconds }
 *   POST /user/qq-bind/confirm        { qq_number, code }
 *   POST /user/qq-unbind/request-code (空 body)      -> { ttl_seconds }
 *   POST /user/qq-unbind/confirm      { code }
 *
 * 错误码（用 ApiError.code 区分；详见 service/qq_bind.go::ThrottledError /
 * BindLockedError）：
 *
 *   400  普通业务错（QQ 格式 / 未绑学校 / 已绑 / 验证码错 …）
 *   404  bot 还不是该 QQ 的好友 → 提示用户先去加好友
 *   429  限流（普通节流；data.retry_after_seconds 给前端做倒计时）
 *   4291 锁定（5 次错码 → 30min 锁；P3.4 错码锁逻辑）
 *   502  bot 服务不可达
 */

import { apiRequest } from './client';

export async function qqBindRequestCode(qqNumber: string) {
  return apiRequest<{ ttl_seconds: number }>('/user/qq-bind/request-code', {
    method: 'POST',
    body: JSON.stringify({ qq_number: qqNumber }),
  });
}

export async function qqBindConfirm(qqNumber: string, code: string) {
  return apiRequest<unknown>('/user/qq-bind/confirm', {
    method: 'POST',
    body: JSON.stringify({ qq_number: qqNumber, code }),
  });
}

export async function qqUnbindRequestCode() {
  return apiRequest<{ ttl_seconds: number }>('/user/qq-unbind/request-code', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function qqUnbindConfirm(code: string) {
  return apiRequest<unknown>('/user/qq-unbind/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
