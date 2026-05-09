import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Screen from '../components/Screen';
import UpdateDialog from '../components/UpdateDialog';
import { colors, radius, space } from '../theme/colors';
import {
  useNotifSettings,
  updateNotifSettings,
  type NotifSettings,
} from '../utils/notifSettings';
import {
  getCurrentVersionCode,
  getCurrentVersionName,
  type UpdateCheckResult,
} from '../utils/appUpdate';
import { fetchAppLatestVersion } from '../api/appUpdate';

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

  // 用户主动检查更新——跟 App 启动时的 checkForUpdate 不同：
  //   - 启动时被忽略列表拦截过的版本，这里依然要弹（用户主动检查 = 表达意愿）
  //   - 已是最新版本时给明确反馈"当前已是最新"，而不是静默
  //   - 接口失败也给明确反馈
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult>(null);

  const onCheckUpdate = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const latest = await fetchAppLatestVersion();
      if (!latest) {
        Alert.alert('检查失败', '无法获取版本信息，请检查网络后重试');
        return;
      }
      const currentVersionName = getCurrentVersionName();
      const currentVersionCode = getCurrentVersionCode();
      if (latest.version_code <= currentVersionCode) {
        Alert.alert('已是最新版本', `当前版本 v${currentVersionName}`);
        return;
      }
      // 有新版本——绕过忽略列表，直接弹 UpdateDialog
      setUpdateInfo({
        ...latest,
        currentVersionName,
        currentVersionCode,
      });
    } catch {
      Alert.alert('检查失败', '请稍后再试');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  const currentVersionName = getCurrentVersionName();

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

        {/* 关于：检查更新——放在设置页最底部 */}
        <View style={styles.group}>
          <Text style={styles.groupTitle}>关于</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={onCheckUpdate}
              disabled={checking}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>检查更新</Text>
                <Text style={styles.rowSub}>当前版本 v{currentVersionName}</Text>
              </View>
              {checking ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {updateInfo ? (
        <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />
      ) : null}
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
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.md },
});
