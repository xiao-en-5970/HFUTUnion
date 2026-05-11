// UserProfileScreen —— B 站风格的"他人个人展示页"。
//
// 入参：route.params.userId（必填）。也可以从评论 / 列表 / 通知里 navigation.navigate('UserProfile', { userId })。
//
// 顶部：背景图 + 头像 + 昵称 + tag（"QQ 智能体"等）+ "关联自「主账号」" 子卡片 + bio + 计数行 + 关注按钮。
// 中部：分类 tabs（帖子 / 求助 / 回答 / 商品），切换时拉对应 list。
//
// 设计选型：用一个 ScrollView 包顶部 header + 自定义 tab bar + 当前 tab 的内嵌 list（FlatList 用
// nestedScroll）——避免引入 TabView 的复杂依赖。每个 tab 自带 pagination。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import {
  fetchUserProfile,
  followUser,
  unfollowUser,
  type UserProfile,
} from '../api/user';
import { listUserPosts, listUserQuestions, listUserAnswers, type ArticleRow } from '../api/article';
import { listUserGoods } from '../api/goods';
import type { RootStackParamList } from '../navigation/RootStack';

const defaultAvatar = require('../assets/default-avatar.png');

type Nav = NativeStackNavigationProp<RootStackParamList, 'UserProfile'>;
type Rt = RouteProp<RootStackParamList, 'UserProfile'>;

type TabKey = 'posts' | 'questions' | 'answers' | 'goods';

const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: 'posts', label: '帖子' },
  { key: 'questions', label: '求助' },
  { key: 'answers', label: '回答' },
  { key: 'goods', label: '商品' },
];

type ListItem = ArticleRow & { __kind: TabKey };

export default function UserProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const userId = params?.userId ?? 0;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [following, setFollowing] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('posts');
  const [tabData, setTabData] = useState<Record<TabKey, ListItem[]>>({
    posts: [],
    questions: [],
    answers: [],
    goods: [],
  });
  const [tabLoading, setTabLoading] = useState<Record<TabKey, boolean>>({
    posts: false,
    questions: false,
    answers: false,
    goods: false,
  });
  const [tabLoaded, setTabLoaded] = useState<Record<TabKey, boolean>>({
    posts: false,
    questions: false,
    answers: false,
    goods: false,
  });

  const loadProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    setLoadingProfile(true);
    try {
      const p = await fetchUserProfile(userId);
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [userId]);

  const loadTab = useCallback(
    async (key: TabKey) => {
      if (!userId || tabLoading[key]) {
        return;
      }
      setTabLoading((s) => ({ ...s, [key]: true }));
      try {
        let rows: ArticleRow[] = [];
        if (key === 'posts') {
          const r = await listUserPosts(userId, 1, 20);
          rows = r.list || [];
        } else if (key === 'questions') {
          const r = await listUserQuestions(userId, 1, 20);
          rows = r.list || [];
        } else if (key === 'answers') {
          const r = await listUserAnswers(userId, 1, 20);
          rows = r.list || [];
        } else if (key === 'goods') {
          const r = await listUserGoods(userId, 1, 20);
          rows = (r.list as ArticleRow[]) || [];
        }
        setTabData((s) => ({ ...s, [key]: rows.map((r) => ({ ...r, __kind: key })) }));
        setTabLoaded((s) => ({ ...s, [key]: true }));
      } catch (e) {
        setTabData((s) => ({ ...s, [key]: [] }));
      } finally {
        setTabLoading((s) => ({ ...s, [key]: false }));
      }
    },
    [userId, tabLoading],
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile && !tabLoaded[activeTab]) {
      loadTab(activeTab);
    }
  }, [profile, activeTab, tabLoaded, loadTab]);

  const onToggleFollow = useCallback(async () => {
    if (!profile || profile.is_self || following) {
      return;
    }
    setFollowing(true);
    try {
      const res = profile.is_following
        ? await unfollowUser(profile.id)
        : await followUser(profile.id);
      setProfile({
        ...profile,
        is_following: res.is_following,
        fans_count: res.fans_count,
      });
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '稍后再试');
    } finally {
      setFollowing(false);
    }
  }, [profile, following]);

  const showName = useMemo(() => {
    if (!profile) {
      return '';
    }
    return profile.nickname && profile.nickname.length > 0
      ? profile.nickname
      : profile.username;
  }, [profile]);

  const headerComp = (
    <ProfileHeader
      profile={profile}
      showName={showName}
      onPressFollowers={() =>
        profile && navigation.navigate('FollowList', { userId: profile.id, mode: 'followers' })
      }
      onPressFollowing={() =>
        profile && navigation.navigate('FollowList', { userId: profile.id, mode: 'following' })
      }
      onPressParent={() =>
        profile?.parent_user_id &&
        navigation.push('UserProfile', { userId: profile.parent_user_id })
      }
      onToggleFollow={onToggleFollow}
      following={following}
    />
  );

  const tabBar = (
    <View style={styles.tabBar}>
      {TAB_DEFS.map((t) => {
        const focused = t.key === activeTab;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, focused && styles.tabItemFocused]}
            onPress={() => setActiveTab(t.key)}>
            <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{t.label}</Text>
            {focused ? <View style={styles.tabIndicator} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderItem = ({ item }: { item: ListItem }) => (
    <ProfileWorkRow
      item={item}
      onPress={() => {
        if (item.__kind === 'goods') {
          navigation.navigate('GoodDetail', { id: item.id });
        } else if (item.__kind === 'questions') {
          navigation.navigate('QuestionDetail', { id: item.id });
        } else if (item.__kind === 'answers') {
          navigation.navigate('AnswerDetail', { id: item.id });
        } else {
          navigation.navigate('PostDetail', { id: item.id });
        }
      }}
    />
  );

  if (loadingProfile && !profile) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>用户不存在或已被禁用</Text>
        </View>
      </Screen>
    );
  }

  const list = tabData[activeTab];
  const isLoadingTab = tabLoading[activeTab];

  return (
    <Screen scroll={false}>
      <FlatList
        data={list}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.__kind}-${item.id}`}
        ListHeaderComponent={
          <View>
            {headerComp}
            {tabBar}
          </View>
        }
        ListEmptyComponent={
          isLoadingTab ? (
            <ActivityIndicator style={{ marginTop: space.lg }} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.muted}>暂无内容</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={loadingProfile}
            onRefresh={() => {
              loadProfile();
              setTabLoaded({ posts: false, questions: false, answers: false, goods: false });
              loadTab(activeTab);
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={list.length === 0 ? { flexGrow: 1 } : undefined}
      />
    </Screen>
  );
}

type HeaderProps = {
  profile: UserProfile | null;
  showName: string;
  onPressFollowers: () => void;
  onPressFollowing: () => void;
  onPressParent: () => void;
  onToggleFollow: () => void;
  following: boolean;
};

function ProfileHeader({
  profile,
  showName,
  onPressFollowers,
  onPressFollowing,
  onPressParent,
  onToggleFollow,
  following,
}: HeaderProps) {
  if (!profile) {
    return null;
  }
  const avatarSource = profile.avatar ? { uri: profile.avatar } : defaultAvatar;
  // 默认背景：纯白，不再 ship 任何默认图片。用户上传过自己的背景才走 Image。
  const bgSource = profile.background ? { uri: profile.background } : null;
  const isQQ = profile.account_type === 2;

  return (
    <View>
      {bgSource ? (
        <Image source={bgSource} style={styles.bg} />
      ) : (
        <View style={[styles.bg, styles.bgDefault]} />
      )}
      <View style={styles.headerBody}>
        <Image source={avatarSource} style={styles.avatar} />
        <View style={styles.nameRow}>
          <Text style={styles.username}>{showName}</Text>
          {isQQ ? (
            <View style={styles.tag}>
              <Ionicons name="chatbubble-ellipses" size={11} color="#0E7490" />
              <Text style={styles.tagText}>QQ 智能体</Text>
            </View>
          ) : null}
        </View>

        {isQQ ? (
          profile.parent_user_id && profile.parent_user_id > 0 ? (
            <TouchableOpacity onPress={onPressParent} style={styles.parentBox} activeOpacity={0.7}>
              <Text style={styles.parentLabel}>关联自 </Text>
              <Text style={styles.parentLink}>「{profile.parent_nickname || `用户#${profile.parent_user_id}`}」</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.parentBox}>
              <Text style={styles.parentLabel}>无关联用户</Text>
            </View>
          )
        ) : null}

        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statItem} onPress={onPressFollowing} activeOpacity={0.7}>
            <Text style={styles.statValue}>{profile.follow_count}</Text>
            <Text style={styles.statLabel}>关注</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={onPressFollowers} activeOpacity={0.7}>
            <Text style={styles.statValue}>{profile.fans_count}</Text>
            <Text style={styles.statLabel}>粉丝</Text>
          </TouchableOpacity>
        </View>

        {!profile.is_self ? (
          <TouchableOpacity
            style={[
              styles.followBtn,
              profile.is_following && styles.followBtnFollowing,
              following && { opacity: 0.6 },
            ]}
            onPress={onToggleFollow}
            disabled={following}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.followBtnText,
                profile.is_following && styles.followBtnTextFollowing,
              ]}>
              {profile.is_followed_by && profile.is_following
                ? '互相关注'
                : profile.is_following
                ? '已关注'
                : '+ 关注'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

type WorkRowProps = {
  item: ListItem;
  onPress: () => void;
};

function ProfileWorkRow({ item, onPress }: WorkRowProps) {
  const titleText = item.title || (item.content?.slice(0, 30) ?? '');
  const subText = item.content?.slice(0, 80) ?? '';
  const cover = item.images && item.images.length > 0 ? item.images[0] : null;
  return (
    <TouchableOpacity style={styles.workRow} onPress={onPress} activeOpacity={0.85}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.workCover} />
      ) : (
        <View style={[styles.workCover, styles.workCoverFallback]}>
          <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.workMain}>
        <Text style={styles.workTitle} numberOfLines={2}>{titleText || '无标题'}</Text>
        {subText ? (
          <Text style={styles.workSub} numberOfLines={1}>{subText}</Text>
        ) : null}
        <View style={styles.workMetaRow}>
          {item.created_at ? <Text style={styles.workMeta}>{item.created_at.slice(0, 10)}</Text> : null}
          {typeof item.like_count === 'number' ? (
            <Text style={styles.workMeta}>♥ {item.like_count}</Text>
          ) : null}
          {typeof item.view_count === 'number' ? (
            <Text style={styles.workMeta}>👁 {item.view_count}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bg: { width: '100%', height: 140 },
  bgDefault: { backgroundColor: '#FFFFFF' },
  headerBody: {
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  avatar: {
    marginTop: -48,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.sm,
    gap: 8,
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#CFFAFE',
    borderColor: '#67E8F9',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagText: { fontSize: 11, color: '#0E7490', fontWeight: '700' },
  parentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  parentLabel: { color: colors.textSecondary, fontSize: 13 },
  parentLink: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  bio: {
    marginTop: space.sm,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: space.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
  },
  statItem: { alignItems: 'center', paddingHorizontal: space.lg },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 22, backgroundColor: colors.border },
  followBtn: {
    marginTop: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  followBtnFollowing: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  followBtnTextFollowing: { color: colors.textSecondary },
  tabBar: {
    flexDirection: 'row',
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabItemFocused: {},
  tabLabel: { fontSize: 14, color: colors.textSecondary },
  tabLabelFocused: { color: colors.primary, fontWeight: '700' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  workRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  workCover: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.bg },
  workCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  workMain: { flex: 1, gap: 4 },
  workTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  workSub: { fontSize: 12, color: colors.textMuted },
  workMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  workMeta: { fontSize: 11, color: colors.textMuted },
  empty: { alignItems: 'center', paddingTop: space.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: colors.textMuted },
});
