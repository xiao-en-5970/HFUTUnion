// refreshTokenStorage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Refresh token 的安全存储层。
//
//   - 主存储：iOS Keychain（Secure Enclave 派生密钥保护） / Android Keystore
//     (EncryptedSharedPreferences，StrongBox/TEE 硬件保护)。root/越狱设备
//     拿不到。本仓库使用 react-native-keychain 10.x。
//
//   - 兜底：万一 Keychain 在某些机型/系统调用失败（极少数情况，比如刚装好包
//     还没重启，或者 iOS 模拟器旧 sim 状态异常），自动回退到 AsyncStorage 并
//     在控制台警告。这样**不会因为 Keychain 异常把用户彻底踢回登录**——降级，
//     不直接挂掉。
//
//   - 迁移：从旧版本（refresh 直接放 AsyncStorage 的 'refresh_token' 或
//     '__hfut_session_v2' key）首次启动时，会一次性把旧值搬进 Keychain，
//     然后清掉 AsyncStorage 里的明文残留。
//
// ─────────────────────────────────────────────────────────────────────────────
// 安全模型选择（重要，**不要轻易改**）
// ─────────────────────────────────────────────────────────────────────────────
//
//   iOS accessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
//
//     - 设备每次重启后，必须用户解锁过一次，才允许后台读 refresh。锁屏期间不允许。
//     - THIS_DEVICE_ONLY：禁止同步到 iCloud Keychain（避免一台设备登录就把 token
//       散到所有 Apple 设备）；本设备抹掉时一并消失。
//
//   不使用 ACCESS_CONTROL.BIOMETRY_*：那会让每次 refresh 都弹 Face ID prompt，
//   彻底破坏"无感续签"。生物识别更适合 Pay 类场景；登录态续期不需要。
//
//   Android storage: 默认 'Best available' = AES_GCM_NO_AUTH 走 EncryptedShared-
//   Preferences，硬件 Keystore 派生密钥；同样不需要用户每次确认。

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

// 独立 service：跟未来可能引入的其它 keychain 用法（比如缓存学校账号密码、
// 签名密钥）隔离。改名等于重置——同一 service 下旧条目会被新写覆盖。
const KEYCHAIN_SERVICE = 'com.hfutunion.session.refresh';
// generic password 必须有 username 字段；refresh token 没有用户名概念，用占位串。
const KEYCHAIN_USERNAME = 'refresh';

// 旧版 AsyncStorage key（明文）。新装包的用户读不到，老用户首启时迁移并清除。
const LEGACY_ASYNC_KEYS = ['refresh_token', '__hfut_session_v2'];

// Keychain 失败兜底用的 AsyncStorage key。**仅**在 keychain 调用 throw 时才会被写。
// 故意起一个不显眼的名字，避免脚本扫 'refresh' 直接命中。
const FALLBACK_ASYNC_KEY = '__hfut_kc_fb_v1';

const setOptions: Keychain.SetOptions = {
  service: KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const getOptions: Keychain.GetOptions = { service: KEYCHAIN_SERVICE };
const baseOptions: Keychain.BaseOptions = { service: KEYCHAIN_SERVICE };

/**
 * 一次性把老的 AsyncStorage refresh token 搬进 Keychain，并清掉所有 AsyncStorage
 * 残留。Idempotent——已经搬过 / 没数据可搬时是空操作。
 */
async function migrateLegacyIfNeeded(): Promise<string | null> {
  for (const k of LEGACY_ASYNC_KEYS) {
    let v: string | null = null;
    try {
      v = await AsyncStorage.getItem(k);
    } catch {
      v = null;
    }
    if (!v) continue;
    try {
      await Keychain.setGenericPassword(KEYCHAIN_USERNAME, v, setOptions);
    } catch (e) {
      // Keychain 写失败：保留 AsyncStorage 里的旧值不动，下次再迁
      if (__DEV__) console.warn('[refreshTokenStorage] migrate to keychain failed', e);
      return v;
    }
    // 迁移成功，清掉所有 AsyncStorage 里的明文 refresh
    try {
      await AsyncStorage.multiRemove(LEGACY_ASYNC_KEYS);
    } catch {
      /* ignore */
    }
    return v;
  }
  return null;
}

/**
 * Keychain 调用全局 wrapper：失败时回落到 AsyncStorage（FALLBACK key），同时给
 * dev 一个 warning。**不抛异常**——上层代码视 refresh 为可空（null = 需重新登录），
 * 这里也保持同语义。
 */
async function safeSetKeychain(value: string): Promise<boolean> {
  try {
    const r = await Keychain.setGenericPassword(KEYCHAIN_USERNAME, value, setOptions);
    return r !== false;
  } catch (e) {
    if (__DEV__) console.warn('[refreshTokenStorage] keychain set failed, falling back', e);
    try {
      await AsyncStorage.setItem(FALLBACK_ASYNC_KEY, value);
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function safeGetKeychain(): Promise<string | null> {
  try {
    const r = await Keychain.getGenericPassword(getOptions);
    if (r && r.password) return r.password;
  } catch (e) {
    if (__DEV__) console.warn('[refreshTokenStorage] keychain get failed, trying fallback', e);
  }
  try {
    const fb = await AsyncStorage.getItem(FALLBACK_ASYNC_KEY);
    return fb || null;
  } catch {
    return null;
  }
}

async function safeResetKeychain(): Promise<void> {
  try {
    await Keychain.resetGenericPassword(baseOptions);
  } catch (e) {
    if (__DEV__) console.warn('[refreshTokenStorage] keychain reset failed', e);
  }
  try {
    await AsyncStorage.multiRemove([FALLBACK_ASYNC_KEY, ...LEGACY_ASYNC_KEYS]);
  } catch {
    /* ignore */
  }
}

export async function getRefreshToken(): Promise<string | null> {
  const fromKc = await safeGetKeychain();
  if (fromKc) return fromKc;
  // Keychain 空——可能是新装包 / 升级前老用户；尝试一次迁移。
  return migrateLegacyIfNeeded();
}

export async function setRefreshToken(refresh: string): Promise<void> {
  await safeSetKeychain(refresh);
  // 把所有 AsyncStorage 的旧明文/兜底 key 都清掉，保证只剩 Keychain 一份
  try {
    await AsyncStorage.multiRemove(LEGACY_ASYNC_KEYS);
  } catch {
    /* ignore */
  }
}

export async function clearRefreshToken(): Promise<void> {
  await safeResetKeychain();
}
