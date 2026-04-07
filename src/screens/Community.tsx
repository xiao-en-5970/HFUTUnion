import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import PostListScreen from './PostListScreen';
import QuestionListScreen from './QuestionListScreen';
import { colors, radius, space } from '../theme/colors';
import { CommunityFeedProvider, useCommunityFeedMode } from '../context/CommunityFeedContext';
import type { PostFeedMode } from '../api/article';

const Tab = createMaterialTopTabNavigator();

const FEED_OPTIONS: { value: PostFeedMode; label: string; hint: string }[] = [
  { value: 'latest', label: '最新', hint: 'GET /post — 按发布时间' },
  { value: 'recommend', label: '推荐', hint: 'GET /search/articles?type=1&sort=combined' },
  { value: 'hot', label: '热门', hint: 'GET /search/articles?type=1&sort=popularity' },
];

function CommunityHeader() {
  const { feedMode, setFeedMode } = useCommunityFeedMode();
  const [open, setOpen] = useState(false);
  const current = FEED_OPTIONS.find((o) => o.value === feedMode) ?? FEED_OPTIONS[0];

  return (
    <>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>社区</Text>
        <TouchableOpacity
          style={styles.modeBtn}
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          hitSlop={8}>
          <Text style={styles.modeBtnText}>{current.label}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>帖子列表模式</Text>
            <Text style={styles.modalSub}>
              与 HFUT-Graduation-Project 路由一致：最新走帖子列表，推荐/热门走聚合搜索。
            </Text>
            {FEED_OPTIONS.map((opt) => {
              const on = opt.value === feedMode;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modeRow, on && styles.modeRowOn]}
                  onPress={() => {
                    setFeedMode(opt.value);
                    setOpen(false);
                  }}
                  activeOpacity={0.85}>
                  <View style={styles.modeRowText}>
                    <Text style={[styles.modeRowLabel, on && styles.modeRowLabelOn]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.modeRowHint}>{opt.hint}</Text>
                  </View>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  ) : (
                    <View style={styles.radio} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.modalClose} onPress={() => setOpen(false)}>
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CommunityTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 2 },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600', textTransform: 'none' },
        tabBarStyle: { backgroundColor: colors.surface, elevation: 0, shadowOpacity: 0 },
      }}>
      <Tab.Screen name="帖子" component={PostListScreen} />
      <Tab.Screen name="提问" component={QuestionListScreen} />
    </Tab.Navigator>
  );
}

export default function Community() {
  return (
    <CommunityFeedProvider>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <CommunityHeader />
        <View style={styles.flex}>
          <CommunityTabs />
        </View>
      </SafeAreaView>
    </CommunityFeedProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  modeBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalSub: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.sm,
  },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modeRowOn: { backgroundColor: colors.primaryLight, borderRadius: radius.sm },
  modeRowText: { flex: 1, paddingRight: 8 },
  modeRowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  modeRowLabelOn: { color: colors.primary },
  modeRowHint: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
  },
  modalClose: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  modalCloseText: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
});
