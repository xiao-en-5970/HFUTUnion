import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  createGood,
  getGood,
  publishGood,
  updateGood,
  GOODS_CATEGORY,
} from '../api/goods';
import { uploadOssUserFile } from '../api/oss';
import { fetchUserInfo, fetchUserLocations, type UserLocation } from '../api/user';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, space } from '../theme/colors';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { awaitMapPickerResult } from '../utils/mapPickerBridge';

type Picked = {
  key: string;
  uri: string;
  type?: string;
  fileName?: string;
};

const MAX_IMAGES = 9;

function newImageKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isRemoteUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 把 deadline 格式成本地可读时间："2026-05-02 18:30" */
function formatDeadline(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

type DurationUnit = 'day' | 'hour';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

/** 时长上限：30 天 / 720 小时。超过意义不大且易误填。 */
const MAX_DAYS = 30;
const MAX_HOURS = 720;

function durationToMs(value: number, unit: DurationUnit): number {
  return unit === 'day' ? value * MS_DAY : value * MS_HOUR;
}

/** 把剩余毫秒反推成合适的 value+unit：≥ 48h 且能整除 24 用天；否则用小时 */
function msToDuration(ms: number): { value: number; unit: DurationUnit } {
  if (ms <= 0) {
    return { value: 1, unit: 'hour' };
  }
  if (ms >= 2 * MS_DAY && ms % MS_DAY === 0) {
    return { value: Math.round(ms / MS_DAY), unit: 'day' };
  }
  return { value: Math.max(1, Math.ceil(ms / MS_HOUR)), unit: 'hour' };
}

export default function GoodCreateScreen({ navigation, route }: any) {
  const goodId = route.params?.goodId as number | undefined;
  /** 从「求助」tab 进入时会预置为 2；预置后用户不能再切换类别（避免误发） */
  const initialCategory = route.params?.initialCategory as 1 | 2 | undefined;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priceYuan, setPriceYuan] = useState('');
  const [stock, setStock] = useState('1');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<Picked[]>([]);

  // 类别：1 二手买卖 / 2 有偿求助
  const [category, setCategory] = useState<number>(
    initialCategory === GOODS_CATEGORY.Help ? GOODS_CATEGORY.Help : GOODS_CATEGORY.Normal,
  );
  /** 类别固定（从求助入口进 / 或正在编辑已存在的商品）后不允许切换 */
  const categoryLocked = !!initialCategory || !!goodId;
  /** 求助无需地址/履约 */
  const isHelp = category === GOODS_CATEGORY.Help;

  // 收款码：仅二手买卖需要；上传后保存最终 URL
  const [paymentQr, setPaymentQr] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);

  // 定时下架：改为「从现在开始 N 天 / N 小时后自动下架」
  const [hasDeadline, setHasDeadline] = useState(false);
  const [durationValue, setDurationValue] = useState<string>('7');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('day');

  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  /** 为 true 时表示用户选了「当前定位」，焦点刷新地址簿时不覆盖 */
  const [useGpsForGood, setUseGpsForGood] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsAddrLabel, setGpsAddrLabel] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: goodId
        ? isHelp
          ? '编辑求助'
          : '编辑商品'
        : isHelp
          ? '发布求助'
          : '发布闲置',
    });
  }, [goodId, isHelp, navigation]);

  useEffect(() => {
    if (!goodId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [g, rows] = await Promise.all([
          getGood(goodId),
          fetchUserLocations(),
        ]);
        if (cancelled) {
          return;
        }
        setLocations(rows);
        setLocationsLoading(false);
        setTitle(g.title || '');
        setContent(g.content || '');
        setPriceYuan(String((g.price ?? 0) / 100));
        setStock(String(g.stock ?? 1));
        setCategory(
          g.goods_category === GOODS_CATEGORY.Help
            ? GOODS_CATEGORY.Help
            : GOODS_CATEGORY.Normal,
        );
        setPaymentQr(g.payment_qr_url ? g.payment_qr_url : null);
        setHasDeadline(!!g.has_deadline);
        // 编辑场景：拿剩余毫秒反推成 value+unit，让用户看到「还剩 X 天 / 小时」而不是具体日期
        if (g.has_deadline && g.deadline) {
          const d = new Date(g.deadline);
          if (!Number.isNaN(d.getTime())) {
            const { value, unit } = msToDuration(d.getTime() - Date.now());
            setDurationValue(String(value));
            setDurationUnit(unit);
          }
        }
        if (g.images?.length) {
          setImages(
            g.images.map((uri) => ({ key: newImageKey(), uri })),
          );
        }
        const addr = (g.goods_addr || g.pickup_addr || '').trim();
        const lat = g.goods_lat ?? null;
        const lng = g.goods_lng ?? null;
        const near = (a: number, b: number) => Math.abs(a - b) < 0.00025;
        const matchSaved = rows.find((l) => {
          if (addr.length > 0) {
            if (l.addr === addr) {
              return true;
            }
            if (addr.length > 4 && (addr.includes(l.addr) || l.addr.includes(addr))) {
              return true;
            }
          }
          if (
            lat != null &&
            lng != null &&
            l.lat != null &&
            l.lng != null
          ) {
            return near(l.lat, lat) && near(l.lng, lng);
          }
          return false;
        });
        if (matchSaved) {
          setUseGpsForGood(false);
          setSelectedLocationId(matchSaved.id);
          setGpsLat(null);
          setGpsLng(null);
          setGpsAddrLabel('');
        } else if (lat != null && lng != null) {
          setUseGpsForGood(true);
          setGpsLat(lat);
          setGpsLng(lng);
          setGpsAddrLabel(addr || `当前定位（${lat.toFixed(5)}, ${lng.toFixed(5)}）`);
          setSelectedLocationId(null);
        } else {
          setUseGpsForGood(false);
          setSelectedLocationId(null);
        }
      } catch (e: any) {
        Alert.alert('加载失败', e?.message || '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goodId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLocationsLoading(true);
        try {
          const rows = await fetchUserLocations();
          if (cancelled) {
            return;
          }
          setLocations(rows);
          if (goodId) {
            return;
          }
          if (!useGpsForGood) {
            if (rows.length) {
              setSelectedLocationId((prev) => {
                if (prev != null && rows.some((r) => r.id === prev)) {
                  return prev;
                }
                const def = rows.find((l) => l.is_default) || rows[0];
                return def?.id ?? null;
              });
            } else {
              setSelectedLocationId(null);
            }
          }
        } catch {
          if (!cancelled) {
            setLocations([]);
          }
        } finally {
          if (!cancelled) {
            setLocationsLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [goodId, useGpsForGood]),
  );

  const pickPaymentQr = async () => {
    if (category !== GOODS_CATEGORY.Normal) {
      return;
    }
    try {
      const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      if (r.didCancel || !r.assets?.length || !r.assets[0]?.uri) {
        return;
      }
      const a = r.assets[0];
      setUploadingQr(true);
      const me = await fetchUserInfo();
      const uid = me?.id;
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const url = await uploadOssUserFile(
        uid,
        a.uri!,
        a.type || 'image/jpeg',
        a.fileName || 'qr.jpg',
        'goods',
      );
      setPaymentQr(url);
    } catch (e: any) {
      Alert.alert('上传失败', e?.message || '请稍后重试');
    } finally {
      setUploadingQr(false);
    }
  };

  /**
   * 按「现在 + N 天/小时」计算出具体截止 Date。
   * 解析失败或 ≤ 0 时返回 null，由校验逻辑 / UI 统一处理。
   */
  const parsedDuration = useMemo(() => {
    const n = parseInt(durationValue, 10);
    if (Number.isNaN(n) || n <= 0) {
      return { ok: false as const, value: 0, date: null as Date | null };
    }
    const cap = durationUnit === 'day' ? MAX_DAYS : MAX_HOURS;
    if (n > cap) {
      return { ok: false as const, value: n, date: null as Date | null };
    }
    return {
      ok: true as const,
      value: n,
      date: new Date(Date.now() + durationToMs(n, durationUnit)),
    };
  }, [durationValue, durationUnit]);

  const pickImages = async () => {
    const remain = MAX_IMAGES - images.length;
    if (remain <= 0) {
      Alert.alert('提示', `最多 ${MAX_IMAGES} 张图`);
      return;
    }
    const r = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: remain,
    });
    if (r.didCancel || !r.assets?.length) {
      return;
    }
    const next: Picked[] = r.assets
      .filter((a): a is NonNullable<typeof a> & { uri: string } => Boolean(a?.uri))
      .map((a) => ({
        key: newImageKey(),
        uri: a.uri!,
        type: a.type,
        fileName: a.fileName ?? undefined,
      }));
    setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  const removeByKey = (key: string) => {
    setImages((prev) => prev.filter((p) => p.key !== key));
  };

  const renderImageItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<Picked>) => (
    <TouchableOpacity
      style={[styles.thumbWrap, isActive && styles.thumbWrapDragging]}
      onLongPress={drag}
      delayLongPress={160}
      activeOpacity={0.92}>
      <Image source={{ uri: item.uri }} style={styles.thumb} />
      <TouchableOpacity
        style={styles.thumbRemove}
        onPress={() => removeByKey(item.key)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={22} color={colors.danger} />
      </TouchableOpacity>
      <View style={styles.dragHint}>
        <Ionicons name="reorder-three" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  const selectSavedLocation = (loc: UserLocation) => {
    setUseGpsForGood(false);
    setSelectedLocationId(loc.id);
    setGpsLat(null);
    setGpsLng(null);
    setGpsAddrLabel('');
  };

  const pickOnMap = async () => {
    // 选点初始中心优先级：当前已选 GPS/saved 坐标 > 当前 GPS（尝试一次）> picker 内部默认
    let initCenter: { lng: number; lat: number } | undefined;
    if (useGpsForGood && gpsLat != null && gpsLng != null) {
      initCenter = { lng: gpsLng, lat: gpsLat };
    } else if (selectedLocationId != null) {
      const sel = locations.find((l) => l.id === selectedLocationId);
      if (sel?.lat != null && sel?.lng != null) {
        initCenter = { lng: sel.lng, lat: sel.lat };
      }
    }
    const waiter = awaitMapPickerResult();
    navigation.navigate('MapPicker', {
      title: '在地图上选点',
      ...(initCenter ? { initCenter } : {}),
    });
    const result = await waiter;
    if (!result) return;
    setUseGpsForGood(true);
    setSelectedLocationId(null);
    setGpsLat(result.lat);
    setGpsLng(result.lng);
    setGpsAddrLabel(
      `地图选点（${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}）`,
    );
  };

  const fetchCurrentPosition = async () => {
    const ok = await ensureAndroidFineLocation();
    if (!ok) {
      Alert.alert('提示', '需要定位权限才能使用当前位置作为商品地址');
      return;
    }
    setGpsLoading(true);
    try {
      const { latitude, longitude } = await requestGpsPosition();
      setUseGpsForGood(true);
      setSelectedLocationId(null);
      setGpsLat(latitude);
      setGpsLng(longitude);
      setGpsAddrLabel(
        `当前定位（${latitude.toFixed(5)}, ${longitude.toFixed(5)}）`,
      );
    } catch (err) {
      Alert.alert('定位失败', formatGpsErrorMessage(err));
    } finally {
      setGpsLoading(false);
    }
  };

  const submit = async () => {
    const py = parseFloat(priceYuan);
    if (!title.trim() || !content.trim() || Number.isNaN(py)) {
      Alert.alert('提示', '请填写标题、描述与价格');
      return;
    }

    const selected = locations.find((l) => l.id === selectedLocationId);

    // 求助：在线协作，不需要交易地址；只有二手买卖才强校验地址
    if (!isHelp) {
      if (useGpsForGood) {
        if (gpsLat == null || gpsLng == null) {
          Alert.alert('提示', '请先使用「当前定位」，或从地址簿选择一条地址');
          return;
        }
      } else {
        if (!selected) {
          Alert.alert('提示', '请从地址簿选择商品交易地址，或使用「当前定位」', [
            { text: '去添加地址', onPress: () => navigation.navigate('AddressList') },
            { text: '取消', style: 'cancel' },
          ]);
          return;
        }
      }
    }

    try {
      setLoading(true);
      const me = await fetchUserInfo();
      const uid = me?.id;
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      const urls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const a = images[i];
        if (isRemoteUrl(a.uri)) {
          urls.push(a.uri);
        } else {
          const url = await uploadOssUserFile(
            uid,
            a.uri,
            a.type || 'image/jpeg',
            a.fileName || `good_${i}.jpg`,
            'goods',
          );
          urls.push(url);
        }
      }
      const cents = Math.round(py * 100);
      // 有偿求助不暴露库存字段，固定为 1：求助属于一次性任务，接单并完成后即下架
      const stockNum = isHelp ? 1 : Math.max(0, parseInt(stock, 10) || 0);

      // deadline 校验：现在重新计算一次，避免用户停留太久导致时间漂移
      let deadlineISO: string | null = null;
      if (hasDeadline) {
        const n = parseInt(durationValue, 10);
        if (Number.isNaN(n) || n <= 0) {
          Alert.alert('提示', '请填写一个大于 0 的时长，单位选天或小时');
          return;
        }
        const cap = durationUnit === 'day' ? MAX_DAYS : MAX_HOURS;
        if (n > cap) {
          Alert.alert(
            '提示',
            durationUnit === 'day'
              ? `最长 ${MAX_DAYS} 天`
              : `最长 ${MAX_HOURS} 小时`,
          );
          return;
        }
        deadlineISO = new Date(Date.now() + durationToMs(n, durationUnit)).toISOString();
      }

      const effectiveQr = isHelp ? '' : paymentQr ?? '';

      // 求助：goods_type=3（在线）；二手：goods_type=1（送货上门）
      const common = {
        title: title.trim(),
        content: content.trim(),
        goods_type: isHelp ? 3 : 1,
        goods_category: category,
        payment_qr_url: effectiveQr,
        has_deadline: hasDeadline && !!deadlineISO,
        deadline: deadlineISO,
        price: cents,
        marked_price: 0,
        stock: stockNum,
      } as const;

      if (goodId) {
        await updateGood(
          goodId,
          isHelp
            ? { ...common, images: urls, goods_addr: '', goods_lat: null, goods_lng: null }
            : useGpsForGood
              ? {
                  ...common,
                  images: urls,
                  goods_addr: gpsAddrLabel,
                  goods_lat: gpsLat,
                  goods_lng: gpsLng,
                }
              : {
                  ...common,
                  images: urls,
                  goods_addr: selected!.addr,
                  goods_lat: selected!.lat ?? null,
                  goods_lng: selected!.lng ?? null,
                },
        );
        Alert.alert('已保存', '', [
          {
            text: '确定',
            onPress: () => navigation.replace('GoodDetail', { id: goodId }),
          },
        ]);
        return;
      }

      const { id } = await createGood(
        isHelp
          ? {
              ...common,
              ...(urls.length > 0 ? { images: urls } : {}),
              goods_addr: '',
              goods_lat: null,
              goods_lng: null,
            }
          : useGpsForGood
            ? {
                ...common,
                ...(urls.length > 0 ? { images: urls } : {}),
                goods_addr: gpsAddrLabel,
                goods_lat: gpsLat,
                goods_lng: gpsLng,
              }
            : {
                ...common,
                ...(urls.length > 0 ? { images: urls } : {}),
                user_location_id: selected!.id,
                goods_addr: selected!.addr,
                goods_lat: selected!.lat ?? null,
                goods_lng: selected!.lng ?? null,
              },
      );
      await publishGood(id);
      Alert.alert('已上架', '', [
        { text: '确定', onPress: () => navigation.replace('GoodDetail', { id }) },
      ]);
    } catch (e: any) {
      Alert.alert('失败', e?.message || '请先在「我的」完成学校认证');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        style={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled>
        <Text style={styles.title}>
          {goodId
            ? isHelp
              ? '编辑求助'
              : '编辑商品'
            : isHelp
              ? '发布求助'
              : '发布闲置'}
        </Text>
        <Text style={styles.hint}>
          {isHelp
            ? '填你愿意出的酬劳，完成后由接单者向你收款'
            : '单位：元。图片可不传，有图更易成交'}
        </Text>

        {!categoryLocked ? (
          <>
            <Text style={styles.label}>类别</Text>
            <View style={styles.segment}>
              {[
                { k: GOODS_CATEGORY.Normal, label: '二手买卖', hint: '我是卖家，需要收款' },
                { k: GOODS_CATEGORY.Help, label: '有偿求助', hint: '我出钱，悬赏他人完成' },
              ].map((opt) => {
                const on = category === opt.k;
                return (
                  <TouchableOpacity
                    key={opt.k}
                    style={[styles.segmentBtn, on && styles.segmentBtnOn]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setCategory(opt.k);
                      if (opt.k === GOODS_CATEGORY.Help) {
                        setPaymentQr(null);
                      }
                    }}>
                    <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.segmentHint, on && styles.segmentHintOn]}>
                      {opt.hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>商品图片（可不传）</Text>
        <Text style={styles.imgDragHint}>长按拖动可调整顺序</Text>
        <DraggableFlatList
          horizontal
          data={images}
          keyExtractor={(item) => item.key}
          onDragEnd={({ data }) => setImages(data)}
          activationDistance={14}
          containerStyle={styles.draggableList}
          contentContainerStyle={styles.draggableListContent}
          renderItem={renderImageItem}
          ListFooterComponent={
            images.length < MAX_IMAGES ? (
              <TouchableOpacity
                style={styles.addTile}
                onPress={() => {
                  pickImages().catch(() => {});
                }}>
                <Ionicons name="add" size={32} color={colors.textMuted} />
                <Text style={styles.addTileText}>添加</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {!isHelp ? (
          <>
        <Text style={styles.label}>商品交易地址</Text>
        <Text style={styles.addrHint}>
          从地址簿选已保存的地址（有位置信息时，市集能显示距离），或使用「当前定位」。没有地址时请先到「收货地址」里添加。
        </Text>

        <View style={styles.addrActions}>
          <TouchableOpacity
            style={styles.addrManageBtn}
            onPress={() => navigation.navigate('AddressList')}
            activeOpacity={0.85}>
            <Ionicons name="book-outline" size={18} color={colors.primary} />
            <Text style={styles.addrManageText}>地址簿</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addrManageBtn, styles.addrGpsBtn]}
            onPress={() => fetchCurrentPosition()}
            disabled={gpsLoading}
            activeOpacity={0.85}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            )}
            <Text style={styles.addrManageText}>当前定位</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addrManageBtn, styles.addrGpsBtn]}
            onPress={() => {
              pickOnMap().catch(() => {});
            }}
            activeOpacity={0.85}>
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <Text style={styles.addrManageText}>地图选点</Text>
          </TouchableOpacity>
        </View>

        {locationsLoading ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
        ) : locations.length === 0 ? (
          <Text style={styles.addrEmpty}>
            暂无保存地址。请先点「地址簿」添加，或使用「当前定位」。
          </Text>
        ) : (
          <View style={styles.addrList}>
            {locations.map((loc) => {
              const on =
                !useGpsForGood && selectedLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.addrRow, on && styles.addrRowOn]}
                  onPress={() => selectSavedLocation(loc)}
                  activeOpacity={0.85}>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.addrRowBody}>
                    <View style={styles.addrRowTitle}>
                      <Text style={styles.addrRowLabel}>{loc.label || '地址'}</Text>
                      {loc.is_default ? (
                        <Text style={styles.addrDefault}>默认</Text>
                      ) : null}
                    </View>
                    <Text style={styles.addrRowText} numberOfLines={3}>
                      {loc.addr}
                    </Text>
                    {loc.lat != null && loc.lng != null ? (
                      <Text style={styles.addrCoord}>已含地图坐标</Text>
                    ) : (
                      <Text style={styles.addrCoordMuted}>无坐标时距离可能无法展示</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {useGpsForGood && gpsLat != null && gpsLng != null ? (
          <View style={styles.gpsBanner}>
            <Ionicons name="location" size={18} color={colors.primary} />
            <Text style={styles.gpsBannerText} numberOfLines={2}>
              已选：{gpsAddrLabel}
            </Text>
          </View>
        ) : null}
          </>
        ) : null}

        {category === GOODS_CATEGORY.Normal ? (
          <>
            <Text style={styles.label}>收款码（可选）</Text>
            <Text style={styles.addrHint}>
              上传后，买家点击「付款」会看到这张图并可保存到相册。
              留空时买家会看到「请在聊天中联系卖家」。
            </Text>
            <View style={styles.qrBlock}>
              {paymentQr ? (
                <View style={styles.qrPreviewWrap}>
                  <Image source={{ uri: paymentQr }} style={styles.qrPreview} />
                  <View style={styles.qrActions}>
                    <TouchableOpacity
                      style={styles.qrActionBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        pickPaymentQr().catch(() => {});
                      }}>
                      <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      <Text style={styles.qrActionText}>换一张</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.qrActionBtn, styles.qrActionDanger]}
                      activeOpacity={0.85}
                      onPress={() => setPaymentQr(null)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={[styles.qrActionText, styles.qrActionDangerText]}>
                        移除
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.qrUploadBtn}
                  activeOpacity={0.85}
                  disabled={uploadingQr}
                  onPress={() => {
                    pickPaymentQr().catch(() => {});
                  }}>
                  {uploadingQr ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
                      <Text style={styles.qrUploadText}>上传收款码</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>截止时间</Text>
        <View style={styles.deadlineRow}>
          <View style={styles.deadlineText}>
            <Text style={styles.deadlineLabel}>
              {hasDeadline ? '到期自动下架' : '无截止时间'}
            </Text>
            <Text style={styles.deadlineHint}>
              {hasDeadline
                ? '从现在起计时，到期后自动下架'
                : '打开后按时长设置，单位天或小时'}
            </Text>
          </View>
          <Switch
            value={hasDeadline}
            onValueChange={setHasDeadline}
            trackColor={{ true: colors.primaryLight, false: '#E5E7EB' }}
            thumbColor={hasDeadline ? colors.primary : '#F4F4F5'}
          />
        </View>
        {hasDeadline ? (
          <>
            <View style={styles.durationRow}>
              <TextInput
                style={styles.durationInput}
                keyboardType="number-pad"
                placeholder="7"
                placeholderTextColor={colors.textMuted}
                value={durationValue}
                onChangeText={(t) => setDurationValue(t.replace(/[^0-9]/g, ''))}
                maxLength={3}
              />
              <View style={styles.unitSegment}>
                {(['day', 'hour'] as const).map((u) => {
                  const on = durationUnit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitBtn, on && styles.unitBtnOn]}
                      activeOpacity={0.85}
                      onPress={() => setDurationUnit(u)}>
                      <Text style={[styles.unitText, on && styles.unitTextOn]}>
                        {u === 'day' ? '天' : '小时'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {parsedDuration.ok && parsedDuration.date ? (
              <Text style={styles.deadlinePreview}>
                预计到期：{formatDeadline(parsedDuration.date)}
              </Text>
            ) : (
              <Text style={styles.deadlineError}>
                {durationUnit === 'day'
                  ? `请输入 1 ~ ${MAX_DAYS} 天`
                  : `请输入 1 ~ ${MAX_HOURS} 小时`}
              </Text>
            )}
          </>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="标题"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.area]}
          placeholder="描述成色、交易方式等"
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
        <TextInput
          style={styles.input}
          placeholder={isHelp ? '酬劳（元）' : '价格（元）'}
          placeholderTextColor={colors.textMuted}
          value={priceYuan}
          onChangeText={setPriceYuan}
          keyboardType="decimal-pad"
        />
        {!isHelp ? (
          <TextInput
            style={styles.input}
            placeholder="库存"
            placeholderTextColor={colors.textMuted}
            value={stock}
            onChangeText={setStock}
            keyboardType="number-pad"
          />
        ) : null}
        <PrimaryButton
          title={goodId ? '保存修改' : '发布上架'}
          onPress={submit}
          loading={loading}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1 },
  scrollContent: {
    padding: space.md,
    paddingBottom: space.xl * 2,
    flexGrow: 1,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  hint: { marginTop: 6, marginBottom: space.md, fontSize: 13, color: colors.textMuted },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  addrHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: space.sm,
  },
  addrActions: { flexDirection: 'row', gap: 10, marginBottom: space.sm },
  addrManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addrGpsBtn: { flex: 1, justifyContent: 'center' },
  addrManageText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  addrEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: space.md,
    lineHeight: 20,
  },
  addrList: { gap: 8, marginBottom: space.md },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addrRowOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  addrRowBody: { flex: 1, minWidth: 0 },
  addrRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrRowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  addrDefault: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  addrRowText: { marginTop: 4, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  addrCoord: { marginTop: 6, fontSize: 11, color: colors.primary, fontWeight: '600' },
  addrCoordMuted: { marginTop: 6, fontSize: 11, color: colors.textMuted },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    marginBottom: space.md,
  },
  gpsBannerText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  imgDragHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  draggableList: {
    minHeight: 96,
    marginBottom: space.md,
  },
  draggableListContent: {
    gap: 10,
    paddingRight: 4,
    alignItems: 'center',
  },
  thumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumbWrapDragging: {
    opacity: 0.95,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dragHint: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.border },
  thumbRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  addTile: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  addTileText: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  area: { minHeight: 120, maxHeight: 280 },
  segment: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: space.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  segmentBtnOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  segmentText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  segmentTextOn: { color: colors.primary },
  segmentHint: { marginTop: 4, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  segmentHintOn: { color: colors.primary },
  helpTip: {
    marginTop: -6,
    marginBottom: space.md,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    padding: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  qrBlock: { marginBottom: space.md },
  qrUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  qrUploadText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  qrPreviewWrap: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  qrPreview: {
    width: 120,
    height: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  qrActions: { gap: 8, flex: 1 },
  qrActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  qrActionDanger: { borderColor: colors.danger },
  qrActionText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  qrActionDangerText: { color: colors.danger },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    marginBottom: space.sm,
  },
  deadlineText: { flex: 1, minWidth: 0 },
  deadlineLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  deadlineHint: { marginTop: 4, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  durationInput: {
    width: 96,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
  unitSegment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  unitBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  unitBtnOn: { backgroundColor: colors.primaryLight },
  unitText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  unitTextOn: { color: colors.primary, fontWeight: '700' },
  deadlinePreview: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: space.md,
  },
  deadlineError: {
    fontSize: 12,
    color: colors.danger,
    marginBottom: space.md,
  },
});
