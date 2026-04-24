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
import {
  MAP_DEFAULT_PICK_ZOOM,
  MAP_FALLBACK_CENTER,
} from '../config/map';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { resolveMapPickerResult } from '../utils/mapPickerBridge';
import type { LngLat } from '../utils/mapHtml';

/**
 * 地图选点页：
 * - 地图中心固定十字准星 pin，用户拖动地图让目标位置对准中心
 * - 右上角 FAB 可以跳回「我的 GPS 位置」
 * - 「确认位置」读取当前 WebView 中心点并通过 mapPickerBridge 回给调用方
 * - 进入时若 params 带 initCenter 则用它，否则用用户 GPS；都无则用合肥市中心
 *
 * 降级：地图服务不可达时 MapWebView 自己展示兜底 UI；本屏仍保留 GPS 按钮让用户用当前定位。
 */

type Params = {
  initCenter?: LngLat;
  title?: string;
  /** 外部传入，锁定最小缩放（默认 PICK_ZOOM，≈100m 比例尺） */
  minPickZoom?: number;
};

export default function MapPickerScreen({ navigation, route }: any) {
  const params: Params = route.params || {};
  const mapRef = useRef<MapWebViewHandle>(null);

  const [center, setCenter] = useState<LngLat>(
    params.initCenter || { lng: MAP_FALLBACK_CENTER[0], lat: MAP_FALLBACK_CENTER[1] },
  );
  const [mapCenter, setMapCenter] = useState<LngLat>(center);
  const [currentZoom, setCurrentZoom] = useState(MAP_DEFAULT_PICK_ZOOM);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const resolvedRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: params.title || '选择位置',
      headerBackTitle: '取消',
    });
  }, [navigation, params.title]);

  // 如果没有指定初始中心，尝试用当前 GPS 默认定位一次（不强制成功）
  useEffect(() => {
    if (params.initCenter) return;
    (async () => {
      try {
        const ok = await ensureAndroidFineLocation();
        if (!ok) return;
        const { latitude, longitude } = await requestGpsPosition();
        const c = { lng: longitude, lat: latitude };
        setCenter(c);
        setMapCenter(c);
        // 地图已就绪的话立即飞过去
        mapRef.current?.flyTo(longitude, latitude, MAP_DEFAULT_PICK_ZOOM);
      } catch {
        // 静默：无权限 / 超时，保留兜底中心
      }
    })();
  }, [params.initCenter]);

  // 离开屏幕（返回键 / 手势）时如果没有 resolve 过，视为取消
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (!resolvedRef.current) {
          resolveMapPickerResult(null);
        }
      }),
    [navigation],
  );

  const handleEvent = useCallback((ev: MapEvent) => {
    if (ev.type === 'ready') {
      setMapReady(true);
    } else if (ev.type === 'centerChange') {
      setMapCenter({ lng: ev.lng, lat: ev.lat });
      setCurrentZoom(ev.zoom);
    } else if (ev.type === 'error') {
      // 交给 MapWebView 自己展示兜底；这里不再打断流程
    }
  }, []);

  const goToMyLocation = async () => {
    setLocating(true);
    try {
      const ok = await ensureAndroidFineLocation();
      if (!ok) {
        Alert.alert('提示', '需要定位权限才能回到当前位置');
        return;
      }
      const { latitude, longitude } = await requestGpsPosition();
      mapRef.current?.flyTo(longitude, latitude, MAP_DEFAULT_PICK_ZOOM);
      setMapCenter({ lng: longitude, lat: latitude });
    } catch (e) {
      Alert.alert('定位失败', formatGpsErrorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  const confirmPick = () => {
    if (!mapReady) {
      Alert.alert('提示', '地图未就绪，请稍候再试或返回使用 GPS/地址簿选址。');
      return;
    }
    resolvedRef.current = true;
    resolveMapPickerResult({ lng: mapCenter.lng, lat: mapCenter.lat });
    navigation.goBack();
  };

  return (
    <Screen scroll={false} edges={['bottom']}>
      <View style={styles.mapBox}>
        <MapWebView
          ref={mapRef}
          options={{ mode: 'picker', center, zoom: MAP_DEFAULT_PICK_ZOOM }}
          onEvent={handleEvent}
          fallbackHint="可返回上一页使用「当前定位」或「地址簿」继续发布"
        />
        <TouchableOpacity
          style={styles.gpsFab}
          onPress={goToMyLocation}
          activeOpacity={0.85}
          disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="navigate" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.bottom}>
        <View style={styles.coordRow}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={styles.coordText}>
            {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)}
            <Text style={styles.coordZoom}>  · z{currentZoom.toFixed(1)}</Text>
          </Text>
        </View>
        <Text style={styles.tip}>
          拖动地图让目标位置对准中心的 <Text style={styles.tipHi}>蓝色定位点</Text>；校内选点默认放到约 100m 比例尺，可两指缩放调整。
        </Text>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}>
            <Text style={styles.btnGhostText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={confirmPick}
            activeOpacity={0.85}>
            <Text style={styles.btnPrimaryText}>确认此位置</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapBox: { flex: 1, backgroundColor: '#eef0f2' },
  gpsFab: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  bottom: {
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordText: { fontSize: 13, color: colors.text, fontFamily: 'System' },
  coordZoom: { color: colors.textMuted, fontSize: 12 },
  tip: { marginTop: 6, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  tipHi: { color: colors.primary, fontWeight: '600' },
  btnRow: {
    marginTop: space.sm,
    flexDirection: 'row',
    gap: space.sm,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#F1F5F4', borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
