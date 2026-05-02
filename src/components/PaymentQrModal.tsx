import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, radius, space } from '../theme/colors';
import { saveRemoteImageToGallery } from '../utils/saveImageToGallery';

type Props = {
  visible: boolean;
  /** 收款码图片完整 URL；为空/null 时显示兜底提示 */
  qrUrl?: string | null;
  /** 收款人昵称，用于标题展示 */
  payeeName?: string;
  /** 点「上传付款凭证」时由父页面打开 `launchImageLibrary` 并走聊天上传通道 */
  onPickProof?: () => void;
  onClose: () => void;
};

/**
 * 付款收款码大图弹窗。
 * - 有 QR：全屏展示大图 + 保存到相册 + 上传凭证
 * - 无 QR：引导用户在聊天中与对方联系，保证功能降级可用
 */
export default function PaymentQrModal({
  visible,
  qrUrl,
  payeeName,
  onPickProof,
  onClose,
}: Props) {
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!qrUrl) return;
    if (saving) return;
    try {
      setSaving(true);
      await saveRemoteImageToGallery(qrUrl);
      Alert.alert('已保存到相册', '打开相册即可使用收款码付款');
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {payeeName ? `${payeeName} 的收款码` : '卖家收款码'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {qrUrl ? (
            <>
              <View style={styles.qrFrame}>
                <Image source={{ uri: qrUrl }} style={styles.qr} resizeMode="contain" />
              </View>
              <Text style={styles.hint}>转账后把付款截图发到聊天作为凭证</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionSave, saving && styles.actionDisabled]}
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={onSave}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.actionSaveText}>保存到相册</Text>
                    </>
                  )}
                </TouchableOpacity>
                {onPickProof ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionGhost]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onClose();
                      // 让 Modal 先关，再打开图库选择
                      setTimeout(onPickProof, 200);
                    }}>
                    <Ionicons name="image-outline" size={18} color={colors.primary} />
                    <Text style={styles.actionGhostText}>上传付款凭证</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="qr-code" size={72} color={colors.border} />
              <Text style={styles.emptyTitle}>卖家未提供收款码</Text>
              <Text style={styles.emptySub}>
                请在聊天里和卖家商定付款方式，付款后发截图作为凭证
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={onClose}>
                <Text style={styles.emptyBtnText}>去聊天</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.md,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  qrFrame: {
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  qr: { width: '100%', height: '100%' },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.sm,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  actionSave: { backgroundColor: colors.primary },
  actionDisabled: { opacity: 0.7 },
  actionSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionGhost: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  actionGhostText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  emptySub: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: space.md,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
