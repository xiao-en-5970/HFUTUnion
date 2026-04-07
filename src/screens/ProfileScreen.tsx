import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ImageViewing from 'react-native-image-viewing';
import ImagePicker from 'react-native-image-crop-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { fetchUserInfo, logout, type UserInfo } from '../api/user';
import { getToken, clearToken } from '../api/client';
import { readCachedUserInfo, writeCachedUserInfo, clearCachedUserInfo } from '../utils/userCache';
import { API_BASE } from '../config';
import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';

const defaultAvatar = require('../assets/default-avatar.png');
const defaultBg = require('../assets/default-bg.jpg');

const menuAll = [
  { key: 'edit', label: '编辑资料', icon: 'person-outline', nav: 'EditProfile' as const },
  { key: 'school', label: '学籍认证', icon: 'school-outline', nav: 'SchoolBind' as const },
  { key: 'addr', label: '收货地址', icon: 'location-outline', nav: 'AddressList' as const },
] as const;

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewType, setPreviewType] = useState<'avatar' | 'background'>('avatar');

  const loadUserInfo = useCallback(async () => {
    let cached: UserInfo | null = null;
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      cached = await readCachedUserInfo();
      if (cached) {
        setUser(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const u = await fetchUserInfo();
        setUser(u);
        await writeCachedUserInfo(u);
      } catch {
        if (!cached) {
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserInfo();
    }, [loadUserInfo]),
  );

  const pickAndCropImage = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: previewType === 'avatar' ? 400 : 1200,
        height: previewType === 'avatar' ? 400 : 600,
        cropping: true,
        cropperCircleOverlay: previewType === 'avatar',
        mediaType: 'photo',
      });

      const formData = new FormData();
      formData.append('file', {
        uri: image.path,
        type: image.mime,
        name: 'upload.jpg',
      } as any);

      const token = await getToken();
      if (!token) {
        return;
      }

      const url =
        previewType === 'avatar'
          ? `${API_BASE}/user/avatar`
          : `${API_BASE}/user/background`;

      setUploading(true);
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (json.code === 200) {
        Alert.alert('上传成功');
        loadUserInfo();
      } else {
        Alert.alert('上传失败', json.message);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setUploading(false);
      setPreviewVisible(false);
    }
  };

  const doLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    await clearToken();
    await clearCachedUserInfo();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>未登录</Text>
        </View>
      </Screen>
    );
  }

  const avatarSource = user.avatar
    ? { uri: `${user.avatar}?t=${Date.now()}` }
    : defaultAvatar;
  const bgSource = user.background
    ? { uri: `${user.background}?t=${Date.now()}` }
    : defaultBg;

  const schoolVerified = Number(user.school_id) > 0;
  const menu = menuAll.filter((m) => m.key !== 'school' || !schoolVerified);

  return (
    <Screen scroll={false}>
      <ScrollView
        nestedScrollEnabled
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => { setPreviewType('background'); setPreviewVisible(true); }}>
          <Image source={bgSource} style={styles.bg} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={() => { setPreviewType('avatar'); setPreviewVisible(true); }}>
          <Image source={avatarSource} style={styles.avatar} />
        </TouchableOpacity>
        <Text style={styles.username}>{user.username}</Text>
        {schoolVerified ? (
          <View style={styles.schoolBlock}>
            <Text style={styles.school}>{user.school_name || '已绑定学校'}</Text>
            <View style={styles.certBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#047857" />
              <Text style={styles.certBadgeText}>已认证</Text>
            </View>
          </View>
        ) : user.school_name ? (
          <Text style={styles.school}>{user.school_name}</Text>
        ) : (
          <Text style={styles.warn}>未绑定学校 · 部分功能受限</Text>
        )}

        <TouchableOpacity
          style={styles.orderEntry}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('MyOrders')}>
          <View style={styles.orderEntryRow}>
            <View style={styles.orderIconWrap}>
              <Ionicons name="receipt-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.orderEntryText}>
              <Text style={styles.orderEntryTitle}>我的订单</Text>
              <Text style={styles.orderEntrySub}>我买到的 · 我卖出的 · 查看详情</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        <View style={styles.menu}>
          {menu.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={styles.menuItem}
              onPress={() => navigation.navigate(m.nav, { user })}>
              <Ionicons name={m.icon as any} size={22} color={colors.text} />
              <Text style={styles.menuLabel}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.menuItem} onPress={doLogout}>
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={[styles.menuLabel, { color: colors.danger }]}>退出登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ImageViewing
        images={[previewType === 'avatar' ? avatarSource : bgSource]}
        imageIndex={0}
        visible={previewVisible}
        onRequestClose={() => setPreviewVisible(false)}
        HeaderComponent={() => (
          <View style={styles.header}>
            <TouchableOpacity onPress={pickAndCropImage}>
              <Text style={styles.changeText}>
                {uploading ? '上传中…' : '更换'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: colors.textMuted },
  bg: { width: '100%', height: 140, borderRadius: 0 },
  avatarWrap: { marginTop: -48, alignSelf: 'center' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  username: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
  },
  schoolBlock: {
    marginTop: 8,
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  school: { textAlign: 'center', color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  certBadgeText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  warn: { textAlign: 'center', marginTop: 6, color: colors.accent, fontSize: 13 },
  orderEntry: {
    marginTop: space.lg,
    marginHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  orderEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: space.md,
    gap: 12,
  },
  orderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderEntryText: { flex: 1 },
  orderEntryTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  orderEntrySub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  menu: {
    marginTop: space.lg,
    marginHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  menuLabel: { flex: 1, fontSize: 16, color: colors.text },
  header: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  changeText: { color: '#fff', fontSize: 16 },
});
