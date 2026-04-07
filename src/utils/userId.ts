import type { UserInfo } from '../api/user';

export function resolveCurrentUserId(
  u: UserInfo | Record<string, unknown> | null | undefined,
): number | null {
  if (u == null || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  const raw = o.id ?? o.user_id;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export default resolveCurrentUserId;
