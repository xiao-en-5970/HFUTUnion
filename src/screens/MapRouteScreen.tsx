import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Screen from '../components/Screen';
import MapWebView, { type MapEvent, type MapWebViewHandle } from '../components/MapWebView';
import { colors, radius, space } from '../theme/colors';
import { MAP_ROUTE_DEFAULT_PROFILE } from '../config/map';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { useLiveLocation } from '../hooks/useLiveLocation';
import {
  formatDurationMs,
  formatMeters,
  haversineMeters,
} from '../utils/mapPickerBridge';
import type { LngLat } from '../utils/mapHtml';

/** 活定位：超过该距离才触发一次重新算路，避免给 GraphHopper 打无效压力 */
const REROUTE_MIN_MOVE_METERS = 30;
/** 活定位：两次算路之间的最小间隔 */
const REROUTE_MIN_INTERVAL_MS = 10000;

/**
 * 寻路展示页：
 * - 输入 dest（必填，一般来自 goods.goods_lat/lng）和 origin（可选，缺省自动尝试当前 GPS）
 * - WebView 里直接向 GraphHopper 请求 /route；成功时派发 routeOk，失败派发 routeFallback（兜底直线）
 * - 顶部显示距离 / 预计时间，支持切换步行 / 骑行 / 驾车
 * - 降级：若 GPS 拿不到 origin，则只展示终点 marker，交互转为「单点查看」并提示；
 *   若地图加载失败，MapWebView 自身展示兜底文案
 */

type Params = {
  dest: LngLat;
  origin?: LngLat;
  destLabel?: string;
  originLabel?: string;
  profile?: string;
  title?: string;
};

type Mode = 'foot' | 'bike' | 'car';

const MODE_LABEL: Record<Mode, string> = { foot: '步行', bike: '骑行', car: '驾车' };

export default function MapRouteScreen({ navigation, route }: any) {
  const params: Params = route.params || {};
  const { dest, destLabel, originLabel, title: titleFromRoute } = params;

  const [origin, setOrigin] = useState<LngLat | undefined>(params.origin);
  /** 初始无 origin 时展示「定位中」，直到第一个活定位/权限结果回来 */
  const [locating, setLocating] = useState(!params.origin);
  const [distance, setDistance] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [routeFailed, setRouteFailed] = useState(false);
  const [mode, setMode] = useState<Mode>((params.profile as Mode) || (MAP_ROUTE_DEFAULT_PROFILE as Mode));
  const [mapKey, setMapKey] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const destRef = useRef(dest);
  const mapRef = useRef<MapWebViewHandle | null>(null);
  /** 最近一次触发 reroute 的起点 + 时间，用于决定是否要再算 */
  const lastRerouteRef = useRef<{ origin: LngLat; t: number } | null>(null);

  /**
   * 实时订阅定位：每 3 秒刷新一次。
   * - 如果初始参数里已经给了 origin（来自商品详情页等），先使用它作为初始值；
   * - 拿到第一个位置后 setOrigin；后续位置变化走 useEffect 做 marker 更新 + 条件性重算路线
   */
  const { position: livePos, error: liveErr } = useLiveLocation({
    intervalMs: 3000,
    initial: origin
      ? { latitude: origin.lat, longitude: origin.lng, timestamp: Date.now() }
      : undefined,
  });

  /** 活定位第一次失败（无权限 / 超时）时提示用户，之后静默重试 */
  const errShownRef = useRef(false);
  useEffect(() => {
    if (!liveErr || errShownRef.current) return;
    errShownRef.current = true;
    setLocating(false);
    if (!origin) {
      Alert.alert(
        '定位失败',
        formatGpsErrorMessage(liveErr) + '\n将仅展示终点位置',
      );
    }
  }, [liveErr, origin]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: titleFromRoute || '路线' });
  }, [navigation, titleFromRoute]);

  /**
   * 活定位应用逻辑：
   * 1) 首次拿到位置：setOrigin，让地图以 route 模式渲染（会自动第一次 fetchRoute）
   * 2) 后续更新：
   *    - 地图未就绪 → 先留在 state 里，等 map-load 时会用最新值
   *    - 地图已就绪 →
   *        * 位移 < 阈值：只移动起点 marker，不重新算路（节流）
   *        * 位移 ≥ 阈值 且 距上次算路 ≥ 最小间隔：updateOrigin 并 reroute
   */
  useEffect(() => {
    if (!livePos) return;
    const next: LngLat = { lng: livePos.longitude, lat: livePos.latitude };
    setLocating(false);

    if (!origin) {
      setOrigin(next);
      lastRerouteRef.current = { origin: next, t: Date.now() };
      return;
    }
    if (!mapReady) {
      // 地图还没准备好，先只更新 state，首渲染会带上最新值
      setOrigin(next);
      return;
    }

    const moved = haversineMeters(origin, next);
    if (moved < 1) return; // 几乎没动，忽略
    setOrigin(next);

    const last = lastRerouteRef.current;
    const needsReroute =
      !last ||
      haversineMeters(last.origin, next) >= REROUTE_MIN_MOVE_METERS ||
      Date.now() - last.t >= REROUTE_MIN_INTERVAL_MS;

    mapRef.current?.updateOrigin(next.lng, next.lat, needsReroute);
    if (needsReroute) {
      lastRerouteRef.current = { origin: next, t: Date.now() };
    }
  }, [livePos, origin, mapReady]);

  const handleEvent = useCallback(
    (ev: MapEvent) => {
      if (ev.type === 'ready') {
        setMapReady(true);
      } else if (ev.type === 'routeOk') {
        setDistance(ev.distance);
        setDuration(ev.time);
        setRouteFailed(false);
      } else if (ev.type === 'routeFallback') {
        // GH 算路失败：用欧氏距离兜底
        if (origin) {
          const m = haversineMeters(origin, destRef.current);
          setDistance(m);
          setDuration(null);
        }
        setRouteFailed(true);
      }
    },
    [origin],
  );

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setDistance(null);
    setDuration(null);
    setRouteFailed(false);
    setMapReady(false);
    setMapKey((k) => k + 1);
  };

  /** 手动定位：强制发起一次单次 GPS，拿到结果后立即刷新起点并重算路线 */
  const relocate = async () => {
    setLocating(true);
    try {
      const ok = await ensureAndroidFineLocation();
      if (!ok) {
        Alert.alert('提示', '未授权定位权限');
        return;
      }
      const { latitude, longitude } = await requestGpsPosition();
      const next: LngLat = { lng: longitude, lat: latitude };
      setOrigin(next);
      setDistance(null);
      setDuration(null);
      setRouteFailed(false);
      if (mapReady) {
        mapRef.current?.updateOrigin(next.lng, next.lat, true);
        lastRerouteRef.current = { origin: next, t: Date.now() };
      } else {
        setMapKey((k) => k + 1);
      }
    } catch (e) {
      Alert.alert('定位失败', formatGpsErrorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  // 无 origin：退化为单点展示
  const viewOnly = !origin;
  const markers = viewOnly
    ? [{ lng: dest.lng, lat: dest.lat, color: '#16A34A' }]
    : [];

  return (
    <Screen scroll={false} edges={['bottom']}>
      <View style={styles.headerBar}>
        <View style={styles.labels}>
          <View style={styles.labelRow}>
            <View style={[styles.dot, { backgroundColor: '#2563EB' }]} />
            <Text numberOfLines={1} style={styles.labelText}>
              {originLabel || (viewOnly ? '未获取到你的位置' : '当前位置')}
            </Text>
          </View>
          <View style={styles.labelRow}>
            <View style={[styles.dot, { backgroundColor: '#16A34A' }]} />
            <Text numberOfLines={1} style={styles.labelText}>
              {destLabel || `${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)}`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {distance != null ? (
            <Text style={styles.distText}>
              {formatMeters(distance)}
              {duration != null ? ` · ${formatDurationMs(duration)}` : ''}
            </Text>
          ) : locating ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.distHint}>
              {viewOnly ? '仅展示终点' : '规划中…'}
            </Text>
          )}
          {routeFailed ? (
            <Text style={styles.fallbackLine}>寻路服务不可用，展示直线距离</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.modesRow}>
        {(['foot', 'bike', 'car'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => switchMode(m)}
            activeOpacity={0.85}
            style={[styles.modeChip, mode === m && styles.modeChipOn]}
            disabled={viewOnly}>
            <Text style={[styles.modeText, mode === m && styles.modeTextOn, viewOnly && styles.modeTextMuted]}>
              {MODE_LABEL[m]}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={relocate}
          activeOpacity={0.85}
          style={styles.reloadBtn}
          disabled={locating}>
          <Ionicons name={locating ? 'sync' : 'navigate'} size={16} color={colors.primary} />
          <Text style={styles.reloadText}>{locating ? '定位中' : '重新定位'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mapBox}>
        <MapWebView
          key={mapKey}
          ref={mapRef}
          options={
            viewOnly
              ? { mode: 'view', markers, center: dest, zoom: 16 }
              : { mode: 'route', origin: origin!, dest, profile: mode }
          }
          onEvent={handleEvent}
          fallbackHint="寻路服务失败时不影响你查看商品其他信息"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  labels: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 2, gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  labelText: { fontSize: 13, color: colors.text, flex: 1 },
  headerRight: { alignItems: 'flex-end', marginLeft: space.sm, minWidth: 110 },
  distText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  distHint: { fontSize: 12, color: colors.textMuted },
  fallbackLine: { fontSize: 11, color: colors.accent, marginTop: 2 },
  modesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipOn: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  modeText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  modeTextOn: { color: colors.primary },
  modeTextMuted: { color: colors.textMuted },
  reloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reloadText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  mapBox: { flex: 1, backgroundColor: '#eef0f2' },
});
