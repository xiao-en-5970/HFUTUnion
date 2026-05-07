import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, space } from '../theme/colors';
import PrimaryButton from './PrimaryButton';
import { addIgnoredVersion, type UpdateCheckResult } from '../utils/appUpdate';
import { apkDownload, type DownloadState } from '../utils/apkDownload';

type Props = {
  /** 更新弹窗的版本元信息；为 null 时不渲染 Modal */
  info: UpdateCheckResult;
  /** 关闭弹窗的回调（"下次再说" / "忽略此版本" / "更新"打开浏览器后都会调） */
  onClose: () => void;
};

/**
 * UpdateDialog 三按钮更新弹窗——给 App.tsx 顶层挂用。
 *
 * 业务规则：
 *   - "更新"：触发 apkDownload.start()，弹窗内显示进度条；下载完成后按钮变为"立即安装"，
 *     调起系统安装界面。下载过程中关掉弹窗也不影响下载——通知栏仍显示进度，可点击恢复。
 *   - "下次再说"：关闭弹窗，下次启动还会再弹（强制更新版本不显示这个按钮）
 *   - "忽略此版本"：把 versionCode 写进 AsyncStorage，下次启动如果服务器最新还是
 *      这个版本就不再弹（强制更新版本不显示这个按钮）
 *
 * 强制更新（force_update=true）时：
 *   - 只显示"更新"/"立即安装"按钮
 *   - 没有右上角关闭、没有 Android back 关闭（onRequestClose 空实现）
 *   - 用户必须更新或杀进程
 */
export default function UpdateDialog({ info, onClose }: Props) {
  const [dl, setDl] = useState<DownloadState>(() => apkDownload.getState());

  useEffect(() => {
    return apkDownload.subscribe(setDl);
  }, []);

  // 安装界面已被系统接管，弹窗自动关闭——避免用户回到 app 还看到老弹窗
  useEffect(() => {
    if (dl.status === 'installing') {
      onClose();
    }
  }, [dl.status, onClose]);

  if (!info) return null;

  const { force_update: forceUpdate } = info;
  const downloading = dl.status === 'downloading';
  const finished = dl.status === 'finished';
  const failed = dl.status === 'failed';
  const cancelled = dl.status === 'cancelled';

  const onUpdate = async () => {
    if (downloading) return;
    if (finished) {
      // 已下完，直接安装
      await apkDownload.installNow();
      return;
    }
    try {
      await apkDownload.start({
        url: info.apk_url,
        versionName: info.version_name,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('下载失败', msg || '请稍后再试');
    }
  };

  const onLater = () => {
    onClose();
  };

  const onIgnore = async () => {
    await addIgnoredVersion(info.version_code);
    onClose();
  };

  const onCancelDownload = async () => {
    await apkDownload.cancel();
  };

  const pct = Math.round((dl.ratio || 0) * 100);

  // 主按钮文案 + loading 态
  let primaryTitle: string;
  if (downloading) {
    primaryTitle = `下载中 ${pct}%`;
  } else if (finished) {
    primaryTitle = '立即安装';
  } else if (failed) {
    primaryTitle = '重试';
  } else if (cancelled) {
    primaryTitle = '重新下载';
  } else {
    primaryTitle = '更新';
  }

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!forceUpdate && !downloading) onClose();
      }}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>发现新版本</Text>
            <View style={styles.versionRow}>
              <Text style={styles.versionFrom}>
                v{info.currentVersionName}
              </Text>
              <Text style={styles.versionArrow}>→</Text>
              <Text style={styles.versionTo}>v{info.version_name}</Text>
            </View>
          </View>

          {info.release_notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>更新内容</Text>
              <ScrollView
                style={styles.notesScroll}
                showsVerticalScrollIndicator={false}>
                <Text style={styles.notesText}>{info.release_notes}</Text>
              </ScrollView>
            </View>
          ) : null}

          {forceUpdate ? (
            <View style={styles.forceTip}>
              <Text style={styles.forceTipText}>
                此版本为强制更新，请安装后继续使用
              </Text>
            </View>
          ) : null}

          {/* 下载进度条——仅在 downloading 时显示 */}
          {downloading ? (
            <View style={styles.progressBox}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${
                        dl.contentLength > 0 ? Math.max(2, pct) : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {dl.contentLength > 0
                  ? `${pct}% · ${formatSize(dl.bytesWritten)} / ${formatSize(
                      dl.contentLength,
                    )}`
                  : '准备下载...'}
              </Text>
            </View>
          ) : null}

          {/* 失败提示 */}
          {failed && dl.errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>下载失败：{dl.errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              title={primaryTitle}
              onPress={onUpdate}
              loading={downloading}
              style={styles.actionBtn}
            />
            {downloading ? (
              <TouchableOpacity
                onPress={onCancelDownload}
                style={[styles.secondaryBtn, styles.secondaryBtnFull]}
                activeOpacity={0.7}>
                <Text style={styles.secondaryText}>取消下载</Text>
              </TouchableOpacity>
            ) : !forceUpdate ? (
              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  onPress={onLater}
                  style={[styles.secondaryBtn, styles.secondaryBtnLeft]}
                  activeOpacity={0.7}>
                  <Text style={styles.secondaryText}>下次再说</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onIgnore}
                  style={styles.secondaryBtn}
                  activeOpacity={0.7}>
                  <Text style={styles.secondaryText}>忽略此版本</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: space.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.xs,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionFrom: {
    fontSize: 14,
    color: colors.textMuted,
  },
  versionArrow: {
    fontSize: 14,
    color: colors.textMuted,
    marginHorizontal: space.sm,
  },
  versionTo: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  notesBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  notesLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  notesScroll: {
    maxHeight: 200,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  forceTip: {
    backgroundColor: '#FFF7ED',
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  forceTipText: {
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
  },
  progressBox: {
    marginBottom: space.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  actions: {
    marginTop: space.xs,
  },
  actionBtn: {
    marginBottom: space.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  secondaryBtnFull: {
    flex: undefined,
    width: '100%',
  },
  secondaryText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
