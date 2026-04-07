import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import {
  fetchSchools,
  fetchSchoolDetail,
  fetchSchoolCaptcha,
  bindSchool,
  SchoolItem,
  SchoolBindDetail,
  FormFieldItem,
} from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';

/** 与 package/web/admin/app.js 中 renderBindSchool 对齐：动态 form_fields + captcha 接口 */
export default function SchoolBindScreen({ navigation }: any) {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SchoolBindDetail | null>(null);
  /** 非 captcha 字段的值，key 与 form_fields[].key 一致 */
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [captchaInput, setCaptchaInput] = useState('');
  /** 来自 GET /schools/:id/captcha 的 token，勿手填 */
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaImageUri, setCaptchaImageUri] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchSchools();
        const list = res.list || [];
        setSchools(list);
        if (list.length && schoolId == null) {
          setSchoolId(list[0].id);
        }
      } catch {
        setSchools([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const loadCaptcha = useCallback(async (sid: number) => {
    try {
      setLoadingCaptcha(true);
      setCaptchaToken('');
      setCaptchaInput('');
      setCaptchaImageUri(null);
      const data = await fetchSchoolCaptcha(sid);
      const token = data.token || '';
      const img = data.image || '';
      setCaptchaToken(token);
      if (img) {
        setCaptchaImageUri(`data:image/png;base64,${img}`);
      }
    } catch (e: any) {
      Alert.alert('获取验证码失败', e?.message || '请稍后再试');
    } finally {
      setLoadingCaptcha(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (sid: number) => {
      try {
        setLoadingDetail(true);
        setDetail(null);
        setFieldValues({});
        setCaptchaInput('');
        setCaptchaToken('');
        setCaptchaImageUri(null);
        const d = await fetchSchoolDetail(sid);
        setDetail(d);
        const init: Record<string, string> = {};
        (d.form_fields || []).forEach((f) => {
          if (f.key !== 'captcha') {
            init[f.key] = '';
          }
        });
        setFieldValues(init);
        const needCap = (d.form_fields || []).some((f) => f.key === 'captcha');
        if (needCap) {
          await loadCaptcha(sid);
        }
      } catch (e: any) {
        Alert.alert('加载学校失败', e?.message || '');
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [loadCaptcha],
  );

  useEffect(() => {
    if (schoolId != null) {
      loadDetail(schoolId);
    }
  }, [schoolId, loadDetail]);

  const setField = (key: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: val }));
  };

  const submit = async () => {
    if (!schoolId || !detail) {
      Alert.alert('提示', '请选择学校');
      return;
    }
    const fields = detail.form_fields || [];
    const username = (fieldValues.username || '').trim();
    const password = fieldValues.password || '';
    if (!username || !password) {
      Alert.alert('提示', '请填写账号和密码');
      return;
    }
    const needCap = fields.some((f) => f.key === 'captcha');
    if (needCap) {
      const cap = captchaInput.trim();
      if (!cap || !captchaToken) {
        Alert.alert('提示', '请先获取验证码并填写');
        return;
      }
    }
    try {
      setSubmitting(true);
      await bindSchool({
        school_id: schoolId,
        username,
        password,
        captcha: needCap ? captchaInput.trim() : undefined,
        captcha_token: needCap ? captchaToken : undefined,
      });
      Alert.alert('绑定成功', '', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('绑定失败', e?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (f: FormFieldItem) => {
    const label = f.label_zh || f.label_en || f.key;
    if (f.key === 'captcha') {
      return (
        <View key="captcha" style={styles.captchaBlock}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.captchaRow}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => schoolId && loadCaptcha(schoolId)}
              disabled={loadingCaptcha}>
              {loadingCaptcha ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.refreshText}>刷新验证码</Text>
              )}
            </TouchableOpacity>
          </View>
          {captchaImageUri ? (
            <Image
              source={{ uri: captchaImageUri }}
              style={styles.captchaImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.muted}>加载验证码图片后显示</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="请输入图中验证码"
            placeholderTextColor={colors.textMuted}
            value={captchaInput}
            onChangeText={setCaptchaInput}
            maxLength={16}
            autoCapitalize="characters"
          />
        </View>
      );
    }
    const secure = f.key === 'password';
    return (
      <View key={f.key} style={styles.fieldBlock}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          placeholder={label}
          placeholderTextColor={colors.textMuted}
          value={fieldValues[f.key] ?? ''}
          onChangeText={(t) => setField(f.key, t)}
          secureTextEntry={secure}
          autoCapitalize="none"
        />
      </View>
    );
  };

  if (loadingList) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      </Screen>
    );
  }

  if (!schools.length) {
    return (
      <Screen>
        <Text style={styles.muted}>暂无可绑定的学校</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.pad}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>学籍认证</Text>
          <Text style={styles.hint}>
            按页面提示填写学号、密码等信息。若需要图形验证码，先点「刷新验证码」再填写。
          </Text>

          <Text style={styles.section}>选择学校</Text>
          {schools.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.school, schoolId === s.id && styles.schoolOn]}
              onPress={() => setSchoolId(s.id)}>
              <Text style={styles.schoolName}>{s.name}</Text>
              <Text style={styles.schoolCode}>{s.code}</Text>
            </TouchableOpacity>
          ))}

          {loadingDetail ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />
          ) : detail ? (
            <>
              <Text style={styles.section}>认证信息</Text>
              {(detail.form_fields || []).some((f) => f.key === 'captcha') ? (
                <Text style={styles.meta}>
                  该校需填写图形验证码，请点击「刷新验证码」获取图片。
                </Text>
              ) : (
                <Text style={styles.meta}>按学校要求填写学号/密码等信息。</Text>
              )}
              {(detail.form_fields || []).map((f) => renderField(f))}
            </>
          ) : null}

          <PrimaryButton title="提交绑定" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.md, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { marginTop: 8, fontSize: 13, color: colors.textMuted, marginBottom: space.md },
  section: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  school: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
  },
  schoolOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  schoolName: { fontSize: 16, fontWeight: '600', color: colors.text },
  schoolCode: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  fieldBlock: { marginBottom: 4 },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  captchaBlock: { marginBottom: space.sm },
  captchaRow: { flexDirection: 'row', marginBottom: 8 },
  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
  },
  refreshText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  captchaImg: {
    width: '100%',
    height: 120,
    marginBottom: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
  },
  meta: { fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  muted: { color: colors.textMuted, padding: space.md },
});
