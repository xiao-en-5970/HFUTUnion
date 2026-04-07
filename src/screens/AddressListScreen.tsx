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
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchUserLocations,
  createUserLocation,
  deleteUserLocation,
  setDefaultLocation,
} from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

export default function AddressListScreen() {
  const [list, setList] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState('');

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

  const add = async () => {
    if (!addr.trim()) {
      Alert.alert('提示', '请填写地址');
      return;
    }
    try {
      await createUserLocation({
        label: label.trim() || '地址',
        addr: addr.trim(),
        is_default: list.length === 0,
      });
      setModal(false);
      setLabel('');
      setAddr('');
      load();
    } catch (e: any) {
      Alert.alert('失败', e?.message);
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
            <PrimaryButton title="保存" onPress={add} />
            <TouchableOpacity style={styles.cancel} onPress={() => setModal(false)}>
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
  del: { marginTop: 10, fontSize: 13, color: colors.danger },
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
});
