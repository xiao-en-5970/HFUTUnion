/**
 * app 内更新——版本比对 + AsyncStorage 忽略列表 + checkForUpdate 主入口。
 *
 * 业务流：
 *
 *   1. App 启动时 useEffect 调 checkForUpdate()，拿到 result：
 *      - null  → 无更新（或网络挂、或当前已最新、或被忽略）；不弹
 *      - obj   → 弹 UpdateDialog
 *
 *   2. 当前版本号读法：从 Android 原生 BuildConfig.VERSION_NAME / VERSION_CODE 读
 *      （详见 src/native/appInfo.ts + AppInfoModule.kt）。
 *      **不**用 package.json::version——那是源码字段，存在跟实际 apk 错位的风险
 *      （例如 build 时 package.json 没及时同步、metro bundle 缓存命中旧版）。
 *      BuildConfig 是 gradle 编译时生成的常量，跟 apk 一一对应，不会错。
 *
 *   3. "忽略此版本"语义：用户点忽略后，AsyncStorage 记录这个 versionCode；
 *      后续启动如果 OSS 最新版本 == 已忽略的 versionCode，不再弹（高于的话还会弹）。
 *      → 详见 isVersionIgnored。
 *
 *   4. 版本元信息来源：直接 fetch OSS 上手动维护的 latest.json。
 *      详见 src/api/appUpdate.ts + hfut-front/APP-UPDATE.md。
 *
 * 设计取舍：
 *   - 不做"in-app 静默安装"——Android 静默装需要系统签名/特殊权限，学生项目不合适；
 *     用 Linking.openURL 让系统浏览器接管下载和安装确认对话框，最稳妥。
 *   - 强制更新（force_update=true）时跳过忽略列表+无关闭按钮，由弹窗组件实现。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAppLatestVersion,
  type AppLatestVersion,
} from '../api/appUpdate';
import {
  getNativeVersionCode,
  getNativeVersionName,
} from '../native/appInfo';

const IGNORED_VERSIONS_KEY = 'app_update_ignored_versions';

/**
 * versionToCode 把 "X.Y.Z" 风格语义版本号转成整数版本号——必须跟
 * hfut-front/build-apk.sh 里的算法一致：X*10000 + Y*100 + Z。
 *
 * 容错：
 *   - 末尾带 -alpha / -rc1 / +meta 等后缀的，丢掉再算
 *   - 段不够 3 个的补 0（比如 "1.2" → 1.2.0）
 *   - 解析失败返 0（调用方按"不弹更新"处理）
 *
 * 仍然导出（而不是只内部用）——给 latest.json 维护方做版本号校验时方便复用。
 */
export function versionToCode(version: string): number {
  if (!version) return 0;
  const cleaned = version.split(/[-+]/, 1)[0].trim();
  const parts = cleaned.split('.');
  const x = parseInt(parts[0] || '0', 10) || 0;
  const y = parseInt(parts[1] || '0', 10) || 0;
  const z = parseInt(parts[2] || '0', 10) || 0;
  return x * 10000 + y * 100 + z;
}

/** 当前 app 的语义版本号——直接读 Android BuildConfig.VERSION_NAME。 */
export function getCurrentVersionName(): string {
  return getNativeVersionName();
}

/** 当前 app 的整数版本号——直接读 Android BuildConfig.VERSION_CODE，不再用 versionToCode 推算。 */
export function getCurrentVersionCode(): number {
  return getNativeVersionCode();
}

/** 读忽略列表；解析失败返空数组（不阻断启动）。 */
export async function getIgnoredVersions(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(IGNORED_VERSIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v: unknown) => Number(v))
      .filter((v: number) => Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

/**
 * 把指定 versionCode 加进忽略列表；保留最近 10 个，避免无限增长。
 *
 * 不再弹的判定见 isVersionIgnored。
 */
export async function addIgnoredVersion(versionCode: number): Promise<void> {
  if (!Number.isFinite(versionCode) || versionCode <= 0) return;
  try {
    const list = await getIgnoredVersions();
    if (list.includes(versionCode)) return;
    const next = [versionCode, ...list].slice(0, 10);
    await AsyncStorage.setItem(IGNORED_VERSIONS_KEY, JSON.stringify(next));
  } catch {
    /* AsyncStorage 写失败不影响主流程——下次启动还会再弹一次而已 */
  }
}

/**
 * 是否该忽略这个版本。
 *
 * 语义：用户曾经点过"忽略此版本"且服务器最新版本 == 该 versionCode；
 * 严格 == 而不是 <=，是为了"忽略 1.2.0 后又发了 1.3.0"时还要弹。
 */
export async function isVersionIgnored(versionCode: number): Promise<boolean> {
  const list = await getIgnoredVersions();
  return list.includes(versionCode);
}

/** checkForUpdate 返回：null=无需弹；非 null=应该弹的版本元信息 */
export type UpdateCheckResult =
  | (AppLatestVersion & {
      currentVersionName: string;
      currentVersionCode: number;
    })
  | null;

/**
 * 检查更新——给 App.tsx / 顶层布局 useEffect 调用。
 *
 * 返回 null 的几种情况（前端都按"不弹"处理）：
 *   - OSS latest.json 不存在或格式不对（首次部署 / 维护错误）
 *   - OSS 最新版本 ≤ 当前版本（已最新）
 *   - OSS 最新版本被用户忽略过且非强制更新
 *   - 网络异常（静默吞掉，下次启动再试）
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  // fetchAppLatestVersion 已经把所有异常吞成 null（含 404/JSON 错/字段缺失），
  // 这里不需要再 try/catch
  const latest = await fetchAppLatestVersion();
  if (!latest) return null;

  const currentVersionName = getCurrentVersionName();
  const currentVersionCode = getCurrentVersionCode();
  if (latest.version_code <= currentVersionCode) return null;

  if (!latest.force_update && (await isVersionIgnored(latest.version_code))) {
    return null;
  }

  return {
    ...latest,
    currentVersionName,
    currentVersionCode,
  };
}
