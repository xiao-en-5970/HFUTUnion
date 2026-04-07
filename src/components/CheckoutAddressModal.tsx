import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { UserLocation } from '../api/user';
import { haversineMeters, formatDistance } from '../utils/geo';
import { colors, radius, space } from '../theme/colors';

export type PaymentProofPick = {
  uri: string;
  type?: string;
  fileName?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  locations: UserLocation[];
  loading?: boolean;
  /** 商品坐标（用于预览距离，与下单后服务端计算一致） */
  goodsLat?: number | null;
  goodsLng?: number | null;
  goodsTypeLabel?: string;
  /** 为 true 时须上传付款截图后才能提交，onConfirm 会带上凭证 */
  paymentProofRequired?: boolean;
  /** 为 true 时表示仅申请修改收货地址（不需付款截图），提交后由卖方确认 */
  proposalOnly?: boolean;
  onConfirm: (locationId: number, paymentProof?: PaymentProofPick) => void;
  /** 顶栏标题 */
  headerTitle?: string;
  /** 说明文案 */
  hint?: string;
  /** 主按钮文案 */
  submitLabel?: string;
};

export default function CheckoutAddressModal({
  visible,
  onClose,
  locations,
  loading,
  goodsLat,
  goodsLng,
  goodsTypeLabel,
  onConfirm,
  paymentProofRequired = false,
  proposalOnly = false,
  headerTitle = '确认订单 · 选择收货地址',
  hint,
  submitLabel = '确认下单并进入聊天',
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paymentProof, setPaymentProof] = useState<PaymentProofPick | null>(null);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? locations[0],
    [locations, selectedId],
  );

  const previewMeters = useMemo(() => {
    if (
      !selected ||
      goodsLat == null ||
      goodsLng == null ||
      selected.lat == null ||
      selected.lng == null
    ) {
      return null;
    }
    return haversineMeters(goodsLat, goodsLng, selected.lat, selected.lng);
  }, [selected, goodsLat, goodsLng]);

  React.useEffect(() => {
    if (visible && locations.length) {
      const def = locations.find((l) => l.is_default) || locations[0];
      setSelectedId(def.id);
    }
    if (!visible) {
      setPaymentProof(null);
    }
  }, [visible, locations]);

  const pickPaymentProof = async () => {
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (r.didCancel || !r.assets?.[0]?.uri) {
      return;
    }
    const a = r.assets[0];
    const uri = a.uri;
    if (!uri) {
      return;
    }
    setPaymentProof({
      uri,
      type: a.type || 'image/jpeg',
      fileName: a.fileName || 'payment.jpg',
    });
  };

  const needPaymentProof = paymentProofRequired && !proposalOnly;
  const canSubmit =
    !!selected &&
    (!needPaymentProof || (paymentProof != null && !!paymentProof.uri));

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>{headerTitle}</Text>
          <Text style={styles.hint}>
            {hint ??
              `聊天与订单绑定；创建订单后卖方可在订单中查看收货位置与距离。${
                goodsTypeLabel ? ` · ${goodsTypeLabel}` : ''
              }`}
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />
          ) : (
            <FlatList
              data={locations}
              keyExtractor={(i) => String(i.id)}
              style={styles.list}
              renderItem={({ item }) => {
                const on = item.id === (selectedId ?? selected?.id);
                const m =
                  goodsLat != null &&
                  goodsLng != null &&
                  item.lat != null &&
                  item.lng != null
                    ? haversineMeters(goodsLat, goodsLng, item.lat, item.lng)
                    : null;
                return (
                  <TouchableOpacity
                    style={[styles.addrRow, on && styles.addrRowOn]}
                    onPress={() => setSelectedId(item.id)}
                    activeOpacity={0.85}>
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={on ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.addrBody}>
                      <Text style={styles.addrLabel}>{item.label || '地址'}</Text>
                      <Text style={styles.addrText} numberOfLines={2}>
                        {item.addr}
                      </Text>
                      {m != null ? (
                        <Text style={styles.dist}>距商品 {formatDistance(m)}</Text>
                      ) : (
                        <Text style={styles.distMuted}>无坐标时服务端可能无法显示直线距离</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {needPaymentProof ? (
            <View style={styles.proofBlock}>
              <Text style={styles.proofLabel}>付款凭证（必填）</Text>
              <Text style={styles.proofHint}>
                请上传转账/付款截图，下单后会与文字说明一起发给卖家，用于核对。
              </Text>
              {paymentProof?.uri ? (
                <View style={styles.proofPreviewRow}>
                  <Image source={{ uri: paymentProof.uri }} style={styles.proofThumb} />
                  <TouchableOpacity style={styles.proofRepick} onPress={pickPaymentProof}>
                    <Text style={styles.proofRepickText}>重新选择</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.proofPickBtn} onPress={pickPaymentProof}>
                  <Ionicons name="image-outline" size={22} color={colors.primary} />
                  <Text style={styles.proofPickText}>选择付款截图</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {previewMeters != null ? (
            <View style={styles.previewBar}>
              <Ionicons name="navigate-outline" size={18} color={colors.primary} />
              <Text style={styles.previewText}>
                预计直线距离 {formatDistance(previewMeters)}（与下单后订单内距离一致）
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, !canSubmit && styles.btnDisabled]}
              disabled={!canSubmit}
              onPress={() => {
                if (!selected || !canSubmit) {
                  return;
                }
                if (proposalOnly) {
                  onConfirm(selected.id);
                } else if (needPaymentProof) {
                  if (!paymentProof) {
                    return;
                  }
                  onConfirm(selected.id, paymentProof);
                } else {
                  onConfirm(selected.id);
                }
              }}>
              <Text style={styles.btnPrimaryText}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.md,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 18,
    marginBottom: 8,
  },
  list: { maxHeight: 320 },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 10,
  },
  addrRowOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  addrBody: { flex: 1 },
  addrLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  addrText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  dist: { fontSize: 12, color: colors.primary, marginTop: 6, fontWeight: '600' },
  distMuted: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    marginTop: 4,
  },
  previewText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  proofBlock: { marginTop: 12 },
  proofLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  proofHint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  proofPickBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryLight,
  },
  proofPickText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  proofPreviewRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  proofThumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.border },
  proofRepick: { paddingVertical: 8, paddingHorizontal: 12 },
  proofRepickText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  actions: { marginTop: space.md, gap: 10 },
  btnGhost: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
  btnPrimary: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: 16, color: '#fff', fontWeight: '700' },
});
