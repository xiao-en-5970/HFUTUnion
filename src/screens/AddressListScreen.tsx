import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  fetchUserLocations,
  createUserLocation,
  deleteUserLocation,
  setDefaultLocation,
} from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { awaitMapPickerResult } from '../utils/mapPickerBridge';

function hasValidCoords(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln);
}

export default function AddressListScreen() {
  const navigation = useNavigation<any>();
  const [list, setList] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState('');
  const [saving, setSaving] = useState(false);
  /** 地图选点坐标，存在时保存流程跳过 GPS 请求 */
  const [pickedCoord, setPickedCoord] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    try {
      const rows = await fetchUserLocations();
      setList(rows);
    } catch {
      setList([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const pickOnMap = async () => {
    const waiter = awaitMapPickerResult();
    navigation.navigate('MapPicker', {
      title: '地图选点',
      ...(pickedCoord ? { initCenter: pickedCoord } : {}),
    });
    const r = await waiter;
    if (r) {
      setPickedCoord({ lat: r.lat, lng: r.lng });
    }
  };

  const add = async () => {
    if (!addr.trim()) {
      Alert.alert('提示', '请填写地址');
      return;
    }
    setSaving(true);
    try {
      let lat: number;
      let lng: number;
      if (pickedCoord) {
        // 地图选点：跳过 GPS 请求（用户可能就是在沙盘模式手动定位）
        lat = pickedCoord.lat;
        lng = pickedCoord.lng;
      } else {
        const ok = await ensureAndroidFineLocation();
        if (!ok) {
          Alert.alert('提示', '需要定位权限才能保存收货地址，或改用「地图选点」');
          return;
        }
        try {
          const pos = await requestGpsPosition();
          lat = pos.latitude;
          lng = pos.longitude;
        } catch (e) {
          Alert.alert('定位失败', formatGpsErrorMessage(e) + '\n可改用「地图选点」手动标记位置');
          return;
        }
      }
      await createUserLocation({
        label: label.trim() || '地址',
        addr: addr.trim(),
        lat,
        lng,
        is_default: list.length === 0,
      });
      setModal(false);
      setLabel('');
      setAddr('');
      setPickedCoord(null);
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false}>
      <PrimaryButton title="新增地址" onPress={() => setModal(true)} style={styles.top} />
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>暂无地址，下单前请先添加</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{item.label || '地址'}</Text>
              {item.is_default ? (
                <Text style={styles.def}>默认</Text>
              ) : (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await setDefaultLocation(item.id);
                      load();
                    } catch (e: any) {
                      Alert.alert(e?.message);
                    }
                  }}>
                  <Text style={styles.link}>设为默认</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.addr}>{item.addr}</Text>
            {hasValidCoords(item.lat, item.lng) ? (
              <Text style={styles.coords}>
                已定位 · {Number(item.lat).toFixed(5)},{' '}
                {Number(item.lng).toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.coordsMissing}>
                未记录经纬度（老数据可删除后按新流程重加）
              </Text>
            )}
            <TouchableOpacity
              onPress={() =>
                Alert.alert('删除', '确认删除？', [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '删除',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteUserLocation(item.id);
                        load();
                      } catch (e: any) {
                        Alert.alert(e?.message);
                      }
                    },
                  },
                ])
              }>
              <Text style={styles.del}>删除</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>新地址</Text>
            <TextInput
              style={styles.input}
              placeholder="标签（家/宿舍）"
              placeholderTextColor={colors.textMuted}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              style={[styles.input, styles.area]}
              placeholder="详细地址"
              placeholderTextColor={colors.textMuted}
              value={addr}
              onChangeText={setAddr}
              multiline
            />
            <Text style={styles.hint}>
              保存时使用下方坐标：默认读取当前 GPS，或先「地图选点」手动标记。
            </Text>
            <TouchableOpacity
              style={styles.mapPickRow}
              onPress={() => {
                pickOnMap().catch(() => {});
              }}
              activeOpacity={0.85}>
              <Ionicons name="map-outline" size={18} color={colors.primary} />
              <Text style={styles.mapPickText}>
                {pickedCoord
                  ? `已选坐标：${pickedCoord.lat.toFixed(5)}, ${pickedCoord.lng.toFixed(5)}（点击重新选）`
                  : '在地图上选点（可选，替代 GPS 自动获取）'}
              </Text>
            </TouchableOpacity>
            <PrimaryButton title="保存" onPress={add} loading={saving} />
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => {
                setModal(false);
                setPickedCoord(null);
              }}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { margin: space.md },
  list: { paddingHorizontal: space.md, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  def: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  link: { fontSize: 13, color: colors.primary },
  addr: { marginTop: 8, fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  coords: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  coordsMissing: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  del: { marginTop: 10, fontSize: 13, color: colors.danger },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.md,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: space.md, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: space.md,
    color: colors.text,
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  cancel: { marginTop: 12, alignItems: 'center' },
  cancelText: { color: colors.textSecondary },
  mapPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: '#F1FBF8',
  },
  mapPickText: { color: colors.primary, fontSize: 12, flex: 1 },
});
