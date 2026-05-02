import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import OrderChatList from './OrderChatList';
import NotificationList from './NotificationList';
import { useMessagesUnread } from '../context/MessagesUnreadContext';
import { markNotificationsRead } from '../api/notification';

type MessageTab = 'normal' | 'buyer' | 'seller';

const TABS: { key: MessageTab; label: string }[] = [
  { key: 'normal', label: '互动' },
  { key: 'buyer', label: '我是买家' },
  { key: 'seller', label: '我是卖家' },
];

/**
 * 「消息」主页：顶部是大标题 + 三选一 Tab，下面按 Tab 切内容。
 * - normal（互动）：站内通知（点赞 / 评论 / 回复 / 官方）
 * - buyer （我是买家）：我作为买家，与卖家的订单会话
 * - seller（我是卖家）：我作为卖家，与买家的订单会话
 */
export default function MessagesScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<MessageTab>('normal');
  // 给互动列表一个重置 key：一键已读时 +1，强制 NotificationList 重新拉首页。
  const [notifReloadKey, setNotifReloadKey] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const { notifTotal, chatTotal, chatByOrder, refresh } = useMessagesUnread();

  const hasOrderUnread = chatTotal > 0 || Object.keys(chatByOrder || {}).length > 0;

  const onMarkAllRead = useCallback(() => {
    if (markingAll || notifTotal === 0) {
      return;
    }
    Alert.alert('一键已读', '确认将全部互动消息标记为已读？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        style: 'destructive',
        onPress: async () => {
          setMarkingAll(true);
          try {
            await markNotificationsRead({ all: true });
            await refresh();
            setNotifReloadKey((k) => k + 1);
          } catch {
            Alert.alert('一键已读失败', '请稍后重试');
          } finally {
            setMarkingAll(false);
          }
        },
      },
    ]);
  }, [markingAll, notifTotal, refresh]);

  const renderBadge = (key: MessageTab): React.ReactNode => {
    const n = key === 'normal' ? notifTotal : hasOrderUnread ? chatTotal : 0;
    if (!n) {
      return null;
    }
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
      </View>
    );
  };

  return (
    <Screen scroll={false} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.titleWrap}>
            {navigation.canGoBack() ? (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={10}
                style={styles.backBtn}
                activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <Text style={styles.title}>消息</Text>
          </View>
          {tab === 'normal' ? (
            <TouchableOpacity
              style={[styles.markAllBtn, (markingAll || notifTotal === 0) && styles.markAllBtnDisabled]}
              activeOpacity={0.75}
              disabled={markingAll || notifTotal === 0}
              onPress={onMarkAllRead}>
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={notifTotal === 0 ? colors.textMuted : colors.primary}
              />
              <Text
                style={[
                  styles.markAllText,
                  notifTotal === 0 && styles.markAllTextDisabled,
                ]}>
                一键已读
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.hint}>
          {tab === 'normal'
            ? '点赞 / 评论 / 回复 / 官方通知'
            : tab === 'buyer'
            ? '我下单的订单，与卖家的沟通'
            : '我发布的商品，买家的咨询与订单'}
        </Text>
      </View>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabHit}
              activeOpacity={0.8}
              onPress={() => setTab(t.key)}>
              <View style={styles.tabInner}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                {renderBadge(t.key)}
              </View>
              {on ? <View style={styles.tabUnderline} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.content}>
        {tab === 'normal' ? (
          <NotificationList key={notifReloadKey} />
        ) : tab === 'buyer' ? (
          <OrderChatList tab="withSellers" />
        ) : (
          <OrderChatList tab="withBuyers" />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { marginLeft: -6, paddingVertical: 2, paddingRight: 2 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: 0.3 },
  hint: { marginTop: 4, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  markAllBtnDisabled: {
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  markAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  markAllTextDisabled: { color: colors.textMuted, fontWeight: '500' },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabHit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  tabTextOn: { color: colors.primary, fontWeight: '700' },
  tabUnderline: {
    marginTop: 6,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  content: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, overflow: 'hidden' },
});
