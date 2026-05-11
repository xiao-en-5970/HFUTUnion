// FollowListScreen —— 关注列表 / 粉丝列表通用页面。
//
// 入参：route.params.userId + route.params.mode（'followers' | 'following'）
//
// 单个用户行 = 头像 + 昵称 + bio + "关注/已关注/互相关注" 按钮（仅当不是自己时显示）。
// 点头像或名字都能跳到对方的 UserProfileScreen。
//
// 设计动机：B 站个人页那种"我关注的人 / 我的粉丝"竖滚动列表；交互比 UserProfile 简单——
// 单条按钮即可关注/取关，没有 cover 图。
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import {
  followUser,
  unfollowUser,
  listFollowing,
  listFollowers,
  type FollowedUserBrief,
} from '../api/user';
import type { RootStackParamList } from '../navigation/RootStack';

const defaultAvatar = require('../assets/default-avatar.png');

type Nav = NativeStackNavigationProp<RootStackParamList, 'FollowList'>;
type Rt = RouteProp<RootStackParamList, 'FollowList'>;

export default function FollowListScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const userId = params?.userId ?? 0;
  const mode = params?.mode ?? 'following';

  const [list, setList] = useState<FollowedUserBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchPage = useCallback(
    async (p: number, replace: boolean) => {
      if (!userId) {
        return;
      }
      setLoading(true);
      try {
        const fn = mode === 'followers' ? listFollowers : listFollowing;
        const res = await fn(userId, p, 30);
        const rows = res.list || [];
        setList((prev) => (replace ? rows : prev.concat(rows)));
        const newTotal = res.total || 0;
        const loaded = (replace ? 0 : list.length) + rows.length;
        setHasMore(loaded < newTotal);
        setPage(p);
      } catch {
        if (replace) setList([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, mode, list.length],
  );

  useEffect(() => {
    fetchPage(1, true);
    navigation.setOptions({ title: mode === 'followers' ? '粉丝' : '关注' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPage(1, true);
  };

  const onEndReached = () => {
    if (!loading && hasMore) {
      fetchPage(page + 1, false);
    }
  };

  const toggleFollow = async (u: FollowedUserBrief) => {
    if (busyId === u.id) return;
    setBusyId(u.id);
    try {
      const fn = u.is_following ? unfollowUser : followUser;
      const res = await fn(u.id);
      setList((prev) =>
        prev.map((x) =>
          x.id === u.id ? { ...x, is_following: res.is_following } : x,
        ),
      );
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '稍后再试');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen scroll={false}>
      <FlatList
        data={list}
        keyExtractor={(item) => `u-${item.id}`}
        renderItem={({ item }) => (
          <UserBriefRow
            item={item}
            busy={busyId === item.id}
            onPressUser={() => navigation.push('UserProfile', { userId: item.id })}
            onToggle={() => toggleFollow(item)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.muted}>
                {mode === 'followers' ? '暂无粉丝' : '暂未关注他人'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && list.length > 0 ? (
            <ActivityIndicator style={{ marginVertical: space.md }} color={colors.primary} />
          ) : null
        }
        contentContainerStyle={list.length === 0 ? { flexGrow: 1 } : undefined}
      />
    </Screen>
  );
}

type RowProps = {
  item: FollowedUserBrief;
  busy: boolean;
  onPressUser: () => void;
  onToggle: () => void;
};

function UserBriefRow({ item, busy, onPressUser, onToggle }: RowProps) {
  const showName = item.nickname && item.nickname.length > 0 ? item.nickname : item.username;
  const isQQ = item.account_type === 2;
  const followText = item.is_followed_by && item.is_following
    ? '互相关注'
    : item.is_following
    ? '已关注'
    : '+ 关注';

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.left} activeOpacity={0.7} onPress={onPressUser}>
        <Image source={item.avatar ? { uri: item.avatar } : defaultAvatar} style={styles.avatar} />
        <View style={styles.nameBlock}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>{showName}</Text>
            {isQQ ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>QQ</Text>
              </View>
            ) : null}
          </View>
          {item.bio ? (
            <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.followBtn, item.is_following && styles.followBtnFollowing, busy && { opacity: 0.5 }]}
        onPress={onToggle}
        disabled={busy}
        activeOpacity={0.8}>
        <Text
          style={[styles.followBtnText, item.is_following && styles.followBtnTextFollowing]}>
          {followText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 10,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg },
  nameBlock: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  tag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#CFFAFE',
  },
  tagText: { fontSize: 10, color: '#0E7490', fontWeight: '700' },
  bio: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  followBtnFollowing: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  followBtnTextFollowing: { color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
});
