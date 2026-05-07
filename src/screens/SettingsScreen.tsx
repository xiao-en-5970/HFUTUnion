import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import {
  useNotifSettings,
  updateNotifSettings,
  type NotifSettings,
} from '../utils/notifSettings';

type Group = {
  title: string;
  rows: Array<{
    key: keyof NotifSettings;
    label: string;
  }>;
};

const GROUPS: Group[] = [
  {
    title: '推送提醒',
    rows: [
      { key: 'pushComment', label: '评论我的作品' },
      { key: 'pushReply', label: '回复我的评论' },
      { key: 'pushOfficial', label: '官方通知' },
      { key: 'pushOrderMessage', label: '订单聊天消息' },
    ],
  },
  {
    title: '导航栏',
    rows: [{ key: 'showBadgeCount', label: '显示未读消息数字' }],
  },
];

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primaryLight, false: '#E5E7EB' }}
        thumbColor={value ? colors.primary : '#F4F4F5'}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const settings = useNotifSettings();
  const setByKey = useCallback(async (k: keyof NotifSettings, v: boolean) => {
    await updateNotifSettings({ [k]: v } as Partial<NotifSettings>);
  }, []);

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {GROUPS.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={styles.card}>
              {g.rows.map((r, idx) => (
                <View key={r.key}>
                  <Row
                    label={r.label}
                    value={settings[r.key]}
                    onChange={(v) => setByKey(r.key, v)}
                  />
                  {idx < g.rows.length - 1 ? <View style={styles.sep} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.md, paddingHorizontal: space.md, paddingBottom: 40 },
  group: { marginBottom: space.lg },
  groupTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.md },
});
