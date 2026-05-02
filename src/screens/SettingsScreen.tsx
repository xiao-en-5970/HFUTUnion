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
  hint?: string;
  rows: Array<{
    key: keyof NotifSettings;
    label: string;
    hint?: string;
  }>;
};

const GROUPS: Group[] = [
  {
    title: '推送提醒',
    hint:
      '收到下列类型消息时是否在手机通知栏弹出。关闭也不会影响「消息」页接收。\n' +
      '说明：点赞类通知不会弹窗，避免被反复打扰。',
    rows: [
      { key: 'pushComment', label: '评论我的作品' },
      { key: 'pushReply', label: '回复我的评论' },
      { key: 'pushOfficial', label: '官方通知' },
      { key: 'pushOrderMessage', label: '订单聊天消息' },
    ],
  },
  {
    title: '导航栏',
    rows: [
      {
        key: 'showBadgeCount',
        label: '显示未读消息数字',
        hint: '关闭后底栏「消息」只显示红点，不显示具体条数',
      },
    ],
  },
];

function Row({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
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
            {g.hint ? <Text style={styles.groupHint}>{g.hint}</Text> : null}
            <View style={styles.card}>
              {g.rows.map((r, idx) => (
                <View key={r.key}>
                  <Row
                    label={r.label}
                    hint={r.hint}
                    value={settings[r.key]}
                    onChange={(v) => setByKey(r.key, v)}
                  />
                  {idx < g.rows.length - 1 ? <View style={styles.sep} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.footer}>
          说明：本地通知需要 app 处于运行中（或后台未被系统回收）才能弹出；
          如需在 app 完全退出时也能收到，需要接入远程推送（FCM / APNs）。
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.md, paddingHorizontal: space.md, paddingBottom: 40 },
  group: { marginBottom: space.lg },
  groupTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  groupHint: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 18 },
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
  rowHint: { marginTop: 4, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.md },
  footer: {
    marginTop: space.md,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
});
