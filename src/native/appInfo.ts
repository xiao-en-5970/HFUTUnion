/**
 * AppInfo 原生模块的 JS 端封装。
 *
 * Android 原生实现见 android/app/src/main/java/com/hfutunion/AppInfoModule.kt：
 * 暴露 BuildConfig.VERSION_NAME / VERSION_CODE（apk 真实版本号，**不是** package.json
 * 里的字符串），以及 installApk / 跳"未知来源"权限设置页能力。
 *
 * iOS 暂未实现——本项目只面向 Android，调用方按 Platform.OS 自行兜底。
 */

import { NativeModules, Platform } from 'react-native';

type AppInfoNative = {
  // Android constants（getConstants）：同步可读，启动时即填入 NativeModules
  versionName?: string;
  versionCode?: number;
  applicationId?: string;

  // 异步方法
  getVersionName: () => Promise<string>;
  getVersionCode: () => Promise<number>;
  installApk: (opts: { path: string; authority?: string }) => Promise<boolean>;
  openInstallPermissionSettings: () => Promise<boolean>;
};

const Native = (NativeModules.AppInfo ?? {}) as AppInfoNative;

/**
 * 获取 apk 真实 versionName（同步）。
 *
 * 优先读 NativeModules.AppInfo.versionName 这个 constant（启动时已塞进 bridge），
 * 拿不到则返 "0.0.0"——用于非 Android 平台 / 模块没注册成功的兜底。
 */
export function getNativeVersionName(): string {
  if (Platform.OS !== 'android') return '0.0.0';
  return Native.versionName ?? '0.0.0';
}

/** 获取 apk 真实 versionCode（同步）；非 Android 返 0。 */
export function getNativeVersionCode(): number {
  if (Platform.OS !== 'android') return 0;
  return Native.versionCode ?? 0;
}

/**
 * 调起系统 apk 安装界面（用户点确认后才真正安装）。
 *
 * @param path  本地 apk 文件绝对路径
 * @returns true 表示成功跳到系统安装 UI；后续是否安装由系统决定，无法感知
 *
 * 抛错（reject）的 code：
 *   E_FILE_NOT_FOUND          apk 不存在
 *   E_INSTALL_NEEDS_PERMISSION 用户未给"未知来源安装"权限——调用 openInstallPermissionSettings 引导
 *   E_INSTALL_LAUNCH          其他系统级失败
 */
export async function installApk(path: string): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('installApk 仅支持 Android');
  }
  if (!Native.installApk) {
    throw new Error('AppInfo 原生模块未注册（确认 MainApplication 已 add AppInfoPackage）');
  }
  return Native.installApk({ path });
}

/** 跳到"未知来源应用安装"系统设置页；用户授权后回到 app 再调 installApk。 */
export async function openInstallPermissionSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!Native.openInstallPermissionSettings) return false;
  return Native.openInstallPermissionSettings();
}

/** 模块是否就绪——非 Android 或原生没注册时返 false，调用方可隐藏更新功能。 */
export function isAppInfoReady(): boolean {
  return Platform.OS === 'android' && typeof Native.versionName === 'string';
}
