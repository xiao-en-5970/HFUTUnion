import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import CommunityFeedScreen from './CommunityFeedScreen';
import { colors, radius, space } from '../theme/colors';
import {
  CommunityFeedProvider,
  useCommunityFeedMode,
  type CommunityTab,
} from '../context/CommunityFeedContext';
import type { PostFeedMode } from '../api/article';

const FEED_OPTIONS: { value: PostFeedMode; label: string; hint: string }[] = [
  { value: 'latest', label: '最新', hint: '按发帖时间，最新在前' },
  { value: 'recommend', label: '推荐', hint: '综合排序，猜你可能感兴趣' },
  { value: 'hot', label: '热门', hint: '近期互动多、更活跃的内容' },
];

const TABS: { key: CommunityTab; label: string }[] = [
  { key: 'combined', label: '综合' },
  { key: 'post', label: '帖子' },
  { key: 'help', label: '求助' },
  { key: 'answer', label: '回答' },
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
            <Text style={styles.modalTitle}>帖子怎么排序</Text>
            <Text style={styles.modalSub}>选一种浏览方式即可，随时可换。</Text>
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

const COMMUNITY_TAB_ENTER_Y = 8;

function CommunityFeedWithFade({ navigation }: { navigation: any }) {
  const { communityTab } = useCommunityFeedMode();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    opacity.setValue(0.88);
    translateY.setValue(COMMUNITY_TAB_ENTER_Y);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [communityTab, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.flex,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}>
      <CommunityFeedScreen navigation={navigation} />
    </Animated.View>
  );
}

function CommunityTabBar() {
  const { communityTab, setCommunityTab } = useCommunityFeedMode();

  return (
    <View style={styles.tabRow}>
      {TABS.map(({ key, label }) => {
        const on = communityTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.tabHit}
            onPress={() => setCommunityTab(key)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={[styles.tabText, on && styles.tabTextActive]}>{label}</Text>
            {on ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function Community() {
  const navigation = useNavigation<any>();
  return (
    <CommunityFeedProvider>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <CommunityHeader />
        <CommunityTabBar />
        <CommunityFeedWithFade navigation={navigation} />
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
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: space.sm,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabHit: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 2,
    minWidth: 56,
  },
  tabText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  tabTextActive: {
    fontWeight: '700',
    color: colors.text,
  },
  tabUnderline: {
    marginTop: 8,
    height: 2,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
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
