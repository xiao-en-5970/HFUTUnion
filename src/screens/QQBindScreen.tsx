/**
 * QQ 认证页：把"编辑资料"位置替换为本页（详见 QQ-bot/skill/bot/SKILL.md
 * "QQ 旗下账号" + "数据聚合 / 操作权限"段）。
 *
 * 一页两态：
 *   - 未绑：先校验已绑学校 → 输入 QQ → 调 request-code → 输入 6 位验证码 → 调 confirm
 *   - 已绑：显示当前 QQ → "解绑"按钮 → 调 unbind/request-code → 输入解绑码 → 调 unbind/confirm
 *
 * 错误处理：
 *   429 + retry_after_seconds → "已达限流，X 秒后重试"按钮倒计时
 *   4291 → "已锁定（5 次错误），X 分钟后再试"
 *   404 (bot 不是好友) → 展开提示 "请先在 QQ 添加机器人好友再回来认证"
 *   400 / 502 → 直接展示后端 message
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { fetchUserInfo, type UserInfo } from '../api/user';
import {
  qqBindRequestCode,
  qqBindConfirm,
  qqUnbindRequestCode,
  qqUnbindConfirm,
} from '../api/qqBind';
import { ApiError } from '../api/client';
import { writeCachedUserInfo, readCachedUserInfo } from '../utils/userCache';
import { colors, radius, space } from '../theme/colors';

/** 调用方拿不到 retry_after_seconds 时的兜底秒数（按 backend 默认配置走）。 */
const DEFAULT_RESEND_COOLDOWN_SEC = 60;

/** 把后端 ApiError.data 里的 retry_after_seconds 提出来；缺省返回 0。 */
function getRetryAfter(e: unknown): number {
  if (e instanceof ApiError && e.data && typeof e.data === 'object') {
    const v = (e.data as { retry_after_seconds?: unknown }).retry_after_seconds;
    if (typeof v === 'number' && v > 0) return v;
  }
  return 0;
}

/** 格式化"X 分 X 秒" / "X 秒"——锁定 30min 用得上 */
function fmtCooldown(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
  }
  return `${sec}秒`;
}

type Phase = 'input' | 'code'; // 用于绑定流程的两步

export default function QQBindScreen() {
  const navigation = useNavigation<any>();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // 绑定流程状态
  const [phase, setPhase] = useState<Phase>('input');
  const [qqInput, setQqInput] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 重发冷却（秒）
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 进入页面 / 操作完成后刷新用户信息 */
  const reloadUser = useCallback(async () => {
    try {
      const u = await fetchUserInfo();
      setUser(u);
      await writeCachedUserInfo(u);
    } catch {
      // ignore：刷新失败不影响表单交互
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await readCachedUserInfo();
      if (alive && cached) setUser(cached);
      await reloadUser();
      if (alive) setLoadingUser(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadUser]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    },
    [],
  );

  const startCooldown = useCallback((sec: number) => {
    setCooldown(sec);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const isBound = (user?.qq_child_user_id ?? 0) > 0;
  const hasSchool = (user?.school_id ?? 0) > 0;
  const boundQQ = user?.qq_child_qq_number || '';

  /** 处理后端错误：用 Alert 给清晰文案；429 / 4291 自动起倒计时 */
  const showApiError = useCallback(
    (e: unknown, fallback = '请稍后再试') => {
      const msg = e instanceof Error ? e.message : fallback;
      if (e instanceof ApiError) {
        if (e.code === 429 || e.code === 4291) {
          const retry = getRetryAfter(e);
          if (retry > 0) startCooldown(retry);
          Alert.alert(
            e.code === 4291 ? '已锁定' : '操作过于频繁',
            retry > 0 ? `${msg}（${fmtCooldown(retry)}后再试）` : msg,
          );
          return;
        }
        if (e.code === 404) {
          Alert.alert(
            '机器人尚未加好友',
            `${msg}\n\n请先用本人 QQ 把机器人加为好友（或在共同 QQ 群里发一条消息触达机器人），再回来认证。`,
          );
          return;
        }
      }
      Alert.alert('失败', msg || fallback);
    },
    [startCooldown],
  );

  // ------------------------- 未绑：发送验证码 -------------------------
  const onSendBindCode = useCallback(async () => {
    const qq = qqInput.trim();
    if (!/^[1-9]\d{4,11}$/.test(qq)) {
      Alert.alert('QQ 号格式错', '请输入 5~12 位纯数字 QQ 号');
      return;
    }
    try {
      setSubmitting(true);
      const data = await qqBindRequestCode(qq);
      setPhase('code');
      setCode('');
      startCooldown(Math.max(1, Math.min(data.ttl_seconds || 0, DEFAULT_RESEND_COOLDOWN_SEC)));
      Alert.alert('已发送', `验证码已通过机器人私聊发到 QQ ${qq}，请打开 QQ 查收（${data.ttl_seconds || 300} 秒内有效）`);
    } catch (e) {
      showApiError(e, '发送失败');
    } finally {
      setSubmitting(false);
    }
  }, [qqInput, showApiError, startCooldown]);

  // ------------------------- 未绑：确认验证码 -------------------------
  const onConfirmBind = useCallback(async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) {
      Alert.alert('验证码格式错', '请输入 QQ 收到的 6 位数字验证码');
      return;
    }
    try {
      setSubmitting(true);
      await qqBindConfirm(qqInput.trim(), c);
      Alert.alert('认证成功', `QQ ${qqInput.trim()} 已绑定到当前账号`);
      // 重置表单 + 拉最新用户信息（让 isBound 切到已绑视图）
      setPhase('input');
      setQqInput('');
      setCode('');
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      setCooldown(0);
      await reloadUser();
    } catch (e) {
      showApiError(e, '确认失败');
    } finally {
      setSubmitting(false);
    }
  }, [code, qqInput, showApiError, reloadUser]);

  // ------------------------- 已绑：发送解绑码 -------------------------
  const onSendUnbindCode = useCallback(async () => {
    Alert.alert(
      '解绑确认',
      `解绑后你将不再继承 QQ ${boundQQ} 在群里发布的内容（仍保留为孤儿账号资源，未来再绑回会重新归属）。继续？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '发送解绑码',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);
              const data = await qqUnbindRequestCode();
              setPhase('code');
              setCode('');
              startCooldown(Math.max(1, Math.min(data.ttl_seconds || 0, DEFAULT_RESEND_COOLDOWN_SEC)));
              Alert.alert('已发送', `解绑验证码已通过机器人私聊发到 QQ ${boundQQ}`);
            } catch (e) {
              showApiError(e, '发送失败');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }, [boundQQ, showApiError, startCooldown]);

  // ------------------------- 已绑：确认解绑 -------------------------
  const onConfirmUnbind = useCallback(async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) {
      Alert.alert('验证码格式错', '请输入 QQ 收到的 6 位数字解绑验证码');
      return;
    }
    try {
      setSubmitting(true);
      await qqUnbindConfirm(c);
      Alert.alert('已解绑', `当前账号已解除与 QQ ${boundQQ} 的关联`);
      setPhase('input');
      setCode('');
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      setCooldown(0);
      await reloadUser();
    } catch (e) {
      showApiError(e, '解绑失败');
    } finally {
      setSubmitting(false);
    }
  }, [code, boundQQ, showApiError, reloadUser]);

  // ------------------------- UI 渲染 -------------------------
  const stateBanner = useMemo(() => {
    if (loadingUser) return null;
    if (!hasSchool) {
      return (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.bannerText}>
            QQ 认证前需先完成学籍认证。先去绑学校，再回来。
          </Text>
        </View>
      );
    }
    if (isBound) {
      return (
        <View style={[styles.banner, styles.bannerOk]}>
          <Ionicons name="shield-checkmark" size={18} color="#047857" />
          <Text style={styles.bannerText}>
            已认证 QQ {boundQQ}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.banner, styles.bannerInfo]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.bannerText}>
          认证后你在 QQ 群里通过机器人发的内容会归属到当前账号
        </Text>
      </View>
    );
  }, [loadingUser, hasSchool, isBound, boundQQ]);

  // 未绑学校：单独引导按钮
  if (!loadingUser && !hasSchool) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.inner}>
          <Text style={styles.title}>QQ 认证</Text>
          {stateBanner}
          <PrimaryButton
            title="去完成学籍认证"
            onPress={() => navigation.navigate('SchoolBind')}
            style={{ marginTop: space.md }}
          />
        </View>
      </Screen>
    );
  }

  if (loadingUser) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>QQ 认证</Text>
          {stateBanner}

          {/* 未绑 + 输入 QQ 阶段 */}
          {!isBound && phase === 'input' ? (
            <>
              <Text style={styles.label}>你的 QQ 号</Text>
              <TextInput
                style={styles.input}
                placeholder="如 12345678"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={qqInput}
                onChangeText={(t) => setQqInput(t.replace(/\D/g, ''))}
                maxLength={12}
                editable={!submitting}
              />
              <Text style={styles.hint}>
                点击下方"发送验证码"后，机器人会用 QQ 私聊把 6 位验证码发到上方 QQ；
                请确保已添加机器人为好友
              </Text>
              <PrimaryButton
                title={cooldown > 0 ? `请 ${cooldown} 秒后再试` : '发送验证码'}
                onPress={onSendBindCode}
                loading={submitting}
                disabled={submitting || cooldown > 0 || !qqInput}
                style={{ marginTop: space.md }}
              />
            </>
          ) : null}

          {/* 未绑 + 输入验证码阶段 */}
          {!isBound && phase === 'code' ? (
            <>
              <Text style={styles.label}>QQ {qqInput} 收到的验证码</Text>
              <TextInput
                style={styles.input}
                placeholder="6 位数字"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                maxLength={6}
                editable={!submitting}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => {
                    setPhase('input');
                    setCode('');
                  }}
                  disabled={submitting}>
                  <Text style={styles.actionLink}>换个 QQ 号</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onSendBindCode}
                  disabled={submitting || cooldown > 0}>
                  <Text
                    style={[
                      styles.actionLink,
                      (submitting || cooldown > 0) && styles.actionDisabled,
                    ]}>
                    {cooldown > 0 ? `重发（${cooldown}s）` : '重新发送'}
                  </Text>
                </TouchableOpacity>
              </View>
              <PrimaryButton
                title="确认认证"
                onPress={onConfirmBind}
                loading={submitting}
                disabled={submitting || code.length !== 6}
                style={{ marginTop: space.md }}
              />
            </>
          ) : null}

          {/* 已绑 + 入口阶段 */}
          {isBound && phase === 'input' ? (
            <>
              <Text style={styles.hint}>
                解绑前的所有内容（商品 / 帖子 / 订单）会保留为可绑回的孤儿数据；
                同一主账号只能绑一个 QQ，要换需先解绑
              </Text>
              <PrimaryButton
                title={cooldown > 0 ? `请 ${cooldown} 秒后再试` : '解绑当前 QQ'}
                onPress={onSendUnbindCode}
                loading={submitting}
                disabled={submitting || cooldown > 0}
                style={{ marginTop: space.md, backgroundColor: colors.danger }}
              />
            </>
          ) : null}

          {/* 已绑 + 输入解绑码阶段 */}
          {isBound && phase === 'code' ? (
            <>
              <Text style={styles.label}>QQ {boundQQ} 收到的解绑验证码</Text>
              <TextInput
                style={styles.input}
                placeholder="6 位数字"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                maxLength={6}
                editable={!submitting}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => {
                    setPhase('input');
                    setCode('');
                  }}
                  disabled={submitting}>
                  <Text style={styles.actionLink}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onSendUnbindCode()}
                  disabled={submitting || cooldown > 0}>
                  <Text
                    style={[
                      styles.actionLink,
                      (submitting || cooldown > 0) && styles.actionDisabled,
                    ]}>
                    {cooldown > 0 ? `重发（${cooldown}s）` : '重新发送'}
                  </Text>
                </TouchableOpacity>
              </View>
              <PrimaryButton
                title="确认解绑"
                onPress={onConfirmUnbind}
                loading={submitting}
                disabled={submitting || code.length !== 6}
                style={{ marginTop: space.md, backgroundColor: colors.danger }}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { padding: space.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: space.md },
  label: {
    marginTop: space.lg,
    marginBottom: 6,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  hint: { marginTop: space.sm, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  bannerOk: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  bannerWarn: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' },
  bannerInfo: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.border },
  bannerText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  actionLink: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  actionDisabled: { color: colors.textMuted },
});
