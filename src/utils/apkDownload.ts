/**
 * apk 下载管理器——后台下载 + 通知栏进度条 + 触发安装。
 *
 * 设计：
 *   1. 单例 + EventEmitter——下载状态对所有订阅者可见，UI 组件可以随时 unmount/重 mount
 *      不影响下载本身（满足"后台下载"诉求）
 *   2. notifee 通知栏：下载中显示进度条；下载完成换为"点击安装"提示；点通知触发 installApk
 *   3. 失败 / 取消 / 完成都通过事件广播；UpdateDialog 订阅事件实时刷新 UI
 *
 * 用法：
 *   import { apkDownload } from './apkDownload';
 *
 *   apkDownload.start({
 *     url: 'https://.../HFUTUnion-1.0.5.apk',
 *     versionName: '1.0.5',
 *   });
 *   const off = apkDownload.subscribe(state => { ... 渲染 ... });
 *
 *   apkDownload.installNow();   // 下载完成后调起系统安装界面
 *   apkDownload.cancel();        // 主动取消
 *
 * 通知栏点击行为：
 *   - 下载中 / 下载完成态：点通知都直接触发 installApk（下载未完成时是 no-op，会等到完成）
 *   - 详见 App.tsx 里的 notifee.onForegroundEvent / onBackgroundEvent 注册
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import {
  installApk,
  openInstallPermissionSettings,
} from '../native/appInfo';

// notifee 动态加载——首次接入时若未 rebuild apk，require 会抛错；
// 用 try/catch 退化为 no-op，避免崩溃
type NotifeeModule = {
  default: {
    requestPermission: () => Promise<unknown>;
    createChannel: (opts: {
      id: string;
      name: string;
      importance?: number;
    }) => Promise<string>;
    displayNotification: (opts: {
      id?: string;
      title?: string;
      body?: string;
      data?: Record<string, string>;
      android?: {
        channelId: string;
        smallIcon?: string;
        ongoing?: boolean;
        autoCancel?: boolean;
        progress?: { max: number; current: number; indeterminate?: boolean };
        pressAction?: { id: string };
        onlyAlertOnce?: boolean;
      };
    }) => Promise<string>;
    cancelNotification: (id: string) => Promise<void>;
  };
  AndroidImportance?: { LOW: number; DEFAULT: number; HIGH: number };
};

let notifee: NotifeeModule | null | undefined;
function loadNotifee(): NotifeeModule | null {
  if (notifee !== undefined) return notifee;
  try {
    notifee = require('@notifee/react-native') as NotifeeModule;
  } catch {
    notifee = null;
  }
  return notifee;
}

const CHANNEL_ID = 'hfut-app-update';
const NOTIFICATION_ID = 'hfut-apk-download';

export type DownloadStatus =
  | 'idle' // 未开始
  | 'downloading' // 下载中
  | 'finished' // 下载完成，等用户点安装
  | 'failed' // 下载失败
  | 'cancelled' // 用户取消
  | 'installing'; // 已调起系统安装界面

export type DownloadState = {
  status: DownloadStatus;
  /** 0~1，下载进度比例；finished/failed/cancelled 时分别为 1/最后值/最后值 */
  ratio: number;
  /** 已下载字节数 */
  bytesWritten: number;
  /** 总字节数；从 HTTP Content-Length 拿，未拿到时 = 0 */
  contentLength: number;
  /** 本地保存路径——finished 之后才是有效路径；failed/cancelled 时也保留以便清理 */
  localPath: string | null;
  /** 失败原因——status=failed 时填 */
  errorMessage: string | null;
  /** 当前下载源 URL */
  url: string | null;
  /** 当前下载的 versionName，用于通知栏文案 */
  versionName: string | null;
};

type Listener = (state: DownloadState) => void;

class ApkDownloadManager {
  private state: DownloadState = {
    status: 'idle',
    ratio: 0,
    bytesWritten: 0,
    contentLength: 0,
    localPath: null,
    errorMessage: null,
    url: null,
    versionName: null,
  };
  private listeners = new Set<Listener>();
  private currentJobId: number | null = null;
  private channelReady = false;

  /** 当前快照，调用方拿来初始化 UI 状态。 */
  getState(): DownloadState {
    return { ...this.state };
  }

  /**
   * 订阅状态变化；返回取消函数。
   *
   * 订阅时立即派发一次当前状态，方便 UI 同步初始值。
   */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn({ ...this.state });
    return () => {
      this.listeners.delete(fn);
    };
  }

  private setState(patch: Partial<DownloadState>): void {
    this.state = { ...this.state, ...patch };
    const snap = { ...this.state };
    this.listeners.forEach(l => {
      try {
        l(snap);
      } catch {
        /* 订阅者抛错不影响下载 */
      }
    });
  }

  private async ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (this.channelReady) return;
    const mod = loadNotifee();
    if (!mod) return;
    try {
      await mod.default.requestPermission();
    } catch {
      /* noop */
    }
    try {
      await mod.default.createChannel({
        id: CHANNEL_ID,
        name: 'app 更新',
        importance: mod.AndroidImportance?.LOW ?? 2,
      });
      this.channelReady = true;
    } catch {
      /* 通道创建失败也允许继续，notifee 会自动用默认 channel */
    }
  }

  /**
   * 启动下载。如果已有任务在跑，本次调用是 no-op（避免并发下载同一 apk）。
   *
   * 返回 promise 仅表示"启动是否成功"——实际下载完成靠订阅 status 监听。
   */
  async start(opts: { url: string; versionName: string }): Promise<void> {
    if (
      this.state.status === 'downloading' ||
      this.state.status === 'finished' ||
      this.state.status === 'installing'
    ) {
      return;
    }
    if (Platform.OS !== 'android') {
      throw new Error('apk 下载仅支持 Android');
    }

    const { url, versionName } = opts;
    const safeName = versionName.replace(/[^0-9A-Za-z._-]/g, '_');
    const dir = `${RNFS.CachesDirectoryPath}/apk`;
    const path = `${dir}/HFUTUnion-${safeName}.apk`;

    try {
      await RNFS.mkdir(dir);
    } catch {
      /* mkdir 已存在不算错 */
    }
    // 删掉旧的同名残留——上次下载到一半可能留了脏数据
    try {
      await RNFS.unlink(path);
    } catch {
      /* 不存在也 OK */
    }

    this.setState({
      status: 'downloading',
      ratio: 0,
      bytesWritten: 0,
      contentLength: 0,
      localPath: path,
      errorMessage: null,
      url,
      versionName,
    });

    await this.ensureChannel();
    await this.updateProgressNotification();

    const job = RNFS.downloadFile({
      fromUrl: url,
      toFile: path,
      // progressDivider=2 表示每 2% 才触发一次回调，省事件 + 省 RN bridge
      progressDivider: 2,
      begin: res => {
        this.setState({
          contentLength: res.contentLength ?? 0,
        });
        this.updateProgressNotification();
      },
      progress: res => {
        const cl = res.contentLength ?? 0;
        const ratio = cl > 0 ? res.bytesWritten / cl : 0;
        this.setState({
          bytesWritten: res.bytesWritten,
          contentLength: cl,
          ratio,
        });
        this.updateProgressNotification();
      },
    });
    this.currentJobId = job.jobId;

    try {
      const result = await job.promise;
      if (result.statusCode >= 200 && result.statusCode < 300) {
        this.setState({
          status: 'finished',
          ratio: 1,
        });
        await this.showFinishedNotification();
      } else {
        await this.handleFailure(`HTTP ${result.statusCode}`);
      }
    } catch (e) {
      // RNFS.stopDownload 会让 promise reject——通过 status 区分用户取消还是真失败
      if (this.state.status === 'cancelled') {
        // 已经在 cancel() 中 setState 过了，这里不再覆盖
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await this.handleFailure(msg);
    } finally {
      this.currentJobId = null;
    }
  }

  /** 主动取消正在进行的下载；幂等。 */
  async cancel(): Promise<void> {
    const jobId = this.currentJobId;
    if (jobId === null) return;
    this.setState({
      status: 'cancelled',
      errorMessage: null,
    });
    try {
      RNFS.stopDownload(jobId);
    } catch {
      /* ignore */
    }
    // 清掉部分下载文件
    if (this.state.localPath) {
      try {
        await RNFS.unlink(this.state.localPath);
      } catch {
        /* ignore */
      }
    }
    await this.cancelNotification();
  }

  /**
   * 调起系统 apk 安装界面——下载完成后调用。
   *
   * 没下载完调用是 no-op；权限不足时会跳系统设置页让用户授权（详见原生模块）。
   */
  async installNow(): Promise<void> {
    if (this.state.status !== 'finished' && this.state.status !== 'installing') {
      return;
    }
    if (!this.state.localPath) return;

    this.setState({ status: 'installing' });
    try {
      await installApk(this.state.localPath);
      // 安装界面被系统接管了；保持 installing 状态，用户取消安装时回 app 界面也不再弹更新弹窗
      // （UpdateDialog 监听到 status=installing 会自动关闭）
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string } | undefined;
      if (err?.code === 'E_INSTALL_NEEDS_PERMISSION') {
        // 跳系统设置页让用户给"未知来源安装"权限；回 app 后再次点击通知或弹窗按钮即可
        try {
          await openInstallPermissionSettings();
        } catch {
          /* ignore */
        }
        // 状态保持 finished，让用户授权后能再次触发安装
        this.setState({ status: 'finished' });
      } else {
        // 其他失败回到 finished 让用户重试
        this.setState({ status: 'finished' });
      }
    }
  }

  /** 把状态彻底重置——用户关掉弹窗 / 装完 app 时调。 */
  reset(): void {
    this.currentJobId = null;
    this.setState({
      status: 'idle',
      ratio: 0,
      bytesWritten: 0,
      contentLength: 0,
      localPath: null,
      errorMessage: null,
      url: null,
      versionName: null,
    });
    this.cancelNotification().catch(() => {
      /* 通知清理失败不影响主流程 */
    });
  }

  private async handleFailure(message: string): Promise<void> {
    this.setState({
      status: 'failed',
      errorMessage: message,
    });
    await this.showFailedNotification(message);
    if (this.state.localPath) {
      try {
        await RNFS.unlink(this.state.localPath);
      } catch {
        /* ignore */
      }
    }
  }

  // ─── notifee 通知栏交互 ───────────────────────────────────────

  private async updateProgressNotification(): Promise<void> {
    const mod = loadNotifee();
    if (!mod) return;
    const ratio = this.state.ratio;
    const pct = Math.round(ratio * 100);
    const versionName = this.state.versionName ?? '';
    try {
      await mod.default.displayNotification({
        id: NOTIFICATION_ID,
        title: `正在下载新版本 v${versionName}`,
        body: this.state.contentLength > 0
          ? `${pct}%（${formatSize(this.state.bytesWritten)} / ${formatSize(this.state.contentLength)}）`
          : '准备下载...',
        android: {
          channelId: CHANNEL_ID,
          smallIcon: 'ic_launcher',
          ongoing: true,
          autoCancel: false,
          onlyAlertOnce: true,
          progress:
            this.state.contentLength > 0
              ? { max: 100, current: pct, indeterminate: false }
              : { max: 100, current: 0, indeterminate: true },
          pressAction: { id: 'apk-download' },
        },
      });
    } catch {
      /* notifee 写入失败不影响下载主流程 */
    }
  }

  private async showFinishedNotification(): Promise<void> {
    const mod = loadNotifee();
    if (!mod) return;
    const versionName = this.state.versionName ?? '';
    try {
      await mod.default.displayNotification({
        id: NOTIFICATION_ID,
        title: `新版本 v${versionName} 已下载`,
        body: '点击安装',
        android: {
          channelId: CHANNEL_ID,
          smallIcon: 'ic_launcher',
          ongoing: false,
          autoCancel: true,
          pressAction: { id: 'apk-install' },
        },
      });
    } catch {
      /* ignore */
    }
  }

  private async showFailedNotification(message: string): Promise<void> {
    const mod = loadNotifee();
    if (!mod) return;
    try {
      await mod.default.displayNotification({
        id: NOTIFICATION_ID,
        title: '下载失败',
        body: message,
        android: {
          channelId: CHANNEL_ID,
          smallIcon: 'ic_launcher',
          ongoing: false,
          autoCancel: true,
        },
      });
    } catch {
      /* ignore */
    }
  }

  private async cancelNotification(): Promise<void> {
    const mod = loadNotifee();
    if (!mod) return;
    try {
      await mod.default.cancelNotification(NOTIFICATION_ID);
    } catch {
      /* ignore */
    }
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 全局单例，组件直接 import 使用。 */
export const apkDownload = new ApkDownloadManager();

/** 通知栏点击事件 id；App.tsx 注册 notifee 监听时识别用。 */
export const APK_DOWNLOAD_PRESS_ACTION_DOWNLOADING = 'apk-download';
export const APK_DOWNLOAD_PRESS_ACTION_INSTALL = 'apk-install';
