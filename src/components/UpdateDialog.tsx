import React, { useState } from 'react';
import {
  Alert,
  Linking,
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
 *   - "更新"：Linking.openURL(apkUrl) 跳系统浏览器下载安装；成功后关闭弹窗
 *   - "下次再说"：关闭弹窗，下次启动还会再弹（强制更新版本不显示这个按钮）
 *   - "忽略此版本"：把 versionCode 写进 AsyncStorage，下次启动如果服务器最新还是
 *      这个版本就不再弹（强制更新版本不显示这个按钮）
 *
 * 强制更新（force_update=true）时：
 *   - 只显示"更新"按钮
 *   - 没有右上角关闭、没有 Android back 关闭（onRequestClose 空实现）
 *   - 用户必须更新或杀进程
 */
export default function UpdateDialog({ info, onClose }: Props) {
  const [opening, setOpening] = useState(false);
  if (!info) return null;

  const { force_update: forceUpdate } = info;

  const onUpdate = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const ok = await Linking.canOpenURL(info.apk_url);
      if (!ok) {
        Alert.alert('打开失败', '当前系统未找到可用浏览器，请手动复制链接');
        return;
      }
      await Linking.openURL(info.apk_url);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('打开失败', msg || '请稍后再试');
    } finally {
      setOpening(false);
    }
  };

  const onLater = () => {
    onClose();
  };

  const onIgnore = async () => {
    await addIgnoredVersion(info.version_code);
    onClose();
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!forceUpdate) onClose();
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

          <View style={styles.actions}>
            <PrimaryButton
              title={opening ? '正在打开浏览器...' : '更新'}
              onPress={onUpdate}
              loading={opening}
              style={styles.actionBtn}
            />
            {!forceUpdate ? (
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
  secondaryText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
