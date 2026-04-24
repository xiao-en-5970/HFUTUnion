import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildMapHtml, type LngLat, type MapHtmlOptions } from '../utils/mapHtml';
import {
  MAP_LIBRE_VERSION,
  MAP_ROUTE_BASE,
  MAP_STATIC_BASE,
  MAP_TILE_BASE,
  MAP_WEBVIEW_TIMEOUT_MS,
} from '../config/map';
import { colors, radius, space } from '../theme/colors';

/**
 * 地图 WebView 的统一封装：
 * - 接受 MapHtmlOptions 配置模式（picker / route / view）
 * - 透过 onEvent 向上派发 JS 侧事件（ready / centerChange / routeOk / routeFallback / error 等）
 * - 加载超时或 WebView onError 时展示降级 UI（显式提示 + 重试）
 * - 外部可通过 ref.command 下发 flyTo / getCenter 指令
 */

export type MapEvent =
  | { type: 'ready' }
  | { type: 'stage'; name: string; ms: number; extra?: string }
  | { type: 'cdnOk'; host: string; ms: number }
  | { type: 'centerChange'; lng: number; lat: number; zoom: number }
  | { type: 'routeOk'; distance: number; time: number }
  | { type: 'routeFallback'; message?: string }
  | { type: 'tileError'; message?: string }
  | { type: 'error'; reason?: string }
  | { type: 'cmdError'; message?: string }
  | { type: 'jsError'; message?: string };

export type MapWebViewHandle = {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  requestCenter: () => void;
  fitBounds: (bounds: [[number, number], [number, number]], padding?: number) => void;
  /** 实时定位使用：仅移动起点 marker（reroute=true 时顺带重算路线） */
  updateOrigin: (lng: number, lat: number, reroute?: boolean) => void;
};

type Props = {
  options: MapHtmlOptions;
  onEvent?: (ev: MapEvent) => void;
  /** 外部强制兜底（服务明显不可达时） */
  forcedFallback?: boolean;
  /** 降级副标题，提示用户可以继续使用的替代方案 */
  fallbackHint?: string;
};

const MapWebView = forwardRef<MapWebViewHandle, Props>(function MapWebView(
  { options, onEvent, forcedFallback, fallbackHint },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [errReason, setErrReason] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  /** 当前 WebView 阶段，显示在加载蒙层里，让用户知道进度 */
  const [currentStage, setCurrentStage] = useState<string>('boot');
  /** 加载过程已过的毫秒数，驱动「显示诊断」「跳过」等提示的出现 */
  const [loadElapsed, setLoadElapsed] = useState(0);
  /** 收集 WebView 内阶段日志；降级时拼进 errReason 一起展示 */
  const stagesRef = useRef<string[]>([]);

  const html = useMemo(() => buildMapHtml(options), [options]);

  // 超时保底：首次加载 12s 内未收到 ready 就视为挂掉
  useEffect(() => {
    if (forcedFallback) {
      setErrored(true);
      setLoading(false);
      setErrReason('上游调用方标记服务不可用');
      return;
    }
    let fired = false;
    const t0 = Date.now();
    const tick = setInterval(() => {
      setLoadElapsed(Date.now() - t0);
    }, 500);
    const t = setTimeout(() => {
      if (!fired && loading) {
        setErrored(true);
        setLoading(false);
        const stages = stagesRef.current.length
          ? `\n\n--- 阶段日志 ---\n${stagesRef.current.join('\n')}`
          : '\n\n(WebView 没上报任何阶段，通常意味着 WebView 内 JS 没启动——旧 APK 未包含 react-native-webview，或系统 WebView 被禁用)';
        setErrReason(
          `加载超时（>${Math.round(MAP_WEBVIEW_TIMEOUT_MS / 1000)}s）${stages}`,
        );
        onEvent?.({ type: 'error', reason: 'timeout' });
      }
    }, MAP_WEBVIEW_TIMEOUT_MS);
    return () => {
      fired = true;
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [reloadKey, forcedFallback, loading, onEvent]);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as MapEvent;
        if (msg.type === 'stage') {
          const line = `[${msg.ms}ms] ${msg.name}${msg.extra ? ' ' + msg.extra : ''}`;
          stagesRef.current.push(line);
          if (stagesRef.current.length > 80) stagesRef.current.shift();
          // 更新最新阶段到加载蒙层
          setCurrentStage(
            msg.name === 'cdn-try' ? `下载 MapLibre（${(msg.extra || '').split('/')[0]}）`
            : msg.name === 'cdn-loaded' ? 'MapLibre 就绪'
            : msg.name === 'init-start' ? '初始化地图…'
            : msg.name === 'map-created' ? '渲染瓦片…'
            : msg.name === 'map-load-event' ? '地图就绪'
            : msg.name === 'sourcedata-ready' ? '地图就绪'
            : msg.name === 'boot' ? '启动 WebView…'
            : msg.name,
          );
        }
        if (msg.type === 'ready') {
          setLoading(false);
        }
        if (msg.type === 'error') {
          setErrored(true);
          setLoading(false);
          setErrReason(msg.reason || '未知原因');
        }
        onEvent?.(msg);
      } catch {
        // 非 JSON 不处理
      }
    },
    [onEvent],
  );

  const runJs = useCallback((code: string) => {
    // inject 之前包一层 void-IIFE，避免 WebView 因尾部表达式返回 Promise/Object 触发 warning
    webRef.current?.injectJavaScript(`(function(){ try{ ${code} }catch(e){} })(); true;`);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lng, lat, zoom) => {
        runJs(`window.__mapCmd && window.__mapCmd({ type:'flyTo', lng:${lng}, lat:${lat}, zoom:${zoom || 'undefined'} });`);
      },
      requestCenter: () => {
        runJs(`window.__mapCmd && window.__mapCmd({ type:'getCenter' });`);
      },
      fitBounds: (bounds, padding) => {
        runJs(
          `window.__mapCmd && window.__mapCmd({ type:'fitBounds', bounds:${JSON.stringify(bounds)}, padding:${padding || 80} });`,
        );
      },
      updateOrigin: (lng, lat, reroute) => {
        runJs(
          `window.__mapCmd && window.__mapCmd({ type:'updateOrigin', lng:${lng}, lat:${lat}, reroute:${reroute ? 'true' : 'false'} });`,
        );
      },
    }),
    [runJs],
  );

  const retry = () => {
    setErrored(false);
    setErrReason('');
    setLoading(true);
    setCurrentStage('boot');
    setLoadElapsed(0);
    stagesRef.current = [];
    setReloadKey((k) => k + 1);
  };

  /** 用户主动放弃地图：直接切到降级 UI */
  const giveUpLoading = () => {
    setErrored(true);
    setLoading(false);
    const stages = stagesRef.current.length
      ? `\n\n--- 阶段日志 ---\n${stagesRef.current.join('\n')}`
      : '\n\n(WebView 未上报任何阶段)';
    setErrReason(`已手动跳过地图加载${stages}`);
    onEvent?.({ type: 'error', reason: 'user-skip' });
  };

  /** 端侧自检：直接从 RN 发起 HTTP 测试，避免 WebView/CDN 干扰；方便判断是运营商/CDN/后端中哪一段有问题 */
  const runSelfCheck = async () => {
    const probe = async (name: string, url: string): Promise<string> => {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        return `${name}: ${res.status} (${Date.now() - t0}ms)`;
      } catch (e: any) {
        return `${name}: FAIL - ${String(e?.message || e).slice(0, 60)} (${Date.now() - t0}ms)`;
      }
    };
    const prev = errReason;
    setErrReason((prev ? prev + '\n\n' : '') + '=== 网络自检中… ===');
    const results = await Promise.all([
      probe('瓦片', `${MAP_TILE_BASE}/health`),
      probe('寻路', `${MAP_ROUTE_BASE}/health`),
      probe('静态服（MapLibre）', `${MAP_STATIC_BASE}/maplibre-gl-${MAP_LIBRE_VERSION}.css`),
      probe('CDN-jsdelivr', `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAP_LIBRE_VERSION}/dist/maplibre-gl.css`),
      probe('CDN-fastly', `https://fastly.jsdelivr.net/npm/maplibre-gl@${MAP_LIBRE_VERSION}/dist/maplibre-gl.css`),
      probe('CDN-unpkg', `https://unpkg.com/maplibre-gl@${MAP_LIBRE_VERSION}/dist/maplibre-gl.css`),
    ]);
    setErrReason((prev ? prev + '\n\n' : '') + '=== 网络自检 ===\n' + results.join('\n'));
  };

  if (errored) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>地图服务暂不可用</Text>
        <Text style={styles.fallbackHint}>
          {fallbackHint || '可稍后重试，或使用 GPS / 地址簿继续操作'}
        </Text>
        {errReason ? (
          <ScrollView style={styles.fallbackReasonWrap} contentContainerStyle={styles.fallbackReasonInner}>
            <Text style={styles.fallbackReason} selectable>
              {errReason}
            </Text>
          </ScrollView>
        ) : null}
        {!forcedFallback ? (
          <View style={styles.fallbackBtnRow}>
            <TouchableOpacity style={styles.fallbackBtn} onPress={retry} activeOpacity={0.85}>
              <Text style={styles.fallbackBtnText}>重新加载</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fallbackBtn, styles.fallbackBtnGhost]}
              onPress={() => {
                runSelfCheck().catch(() => {});
              }}
              activeOpacity={0.85}>
              <Text style={styles.fallbackBtnGhostText}>网络自检</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        key={reloadKey}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: MAP_TILE_BASE }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
        onError={() => {
          setErrored(true);
          setLoading(false);
          onEvent?.({ type: 'error', reason: 'webview-error' });
        }}
        onHttpError={() => {
          onEvent?.({ type: 'error', reason: 'http-error' });
        }}
        allowsInlineMediaPlayback
        style={styles.web}
        // 关闭默认 pull-to-refresh（Android），避免拖动地图时卡顿
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>加载地图…</Text>
          {/* 5s 后显示当前阶段，给用户「在做事」的反馈 */}
          {loadElapsed >= 5000 ? (
            <Text style={styles.loadingStage}>
              {currentStage}
              {loadElapsed >= 3000 ? `（${Math.round(loadElapsed / 1000)}s）` : ''}
            </Text>
          ) : null}
          {/* 10s 还没好：提供「跳过地图」逃生口 */}
          {loadElapsed >= 10000 ? (
            <TouchableOpacity
              onPress={giveUpLoading}
              activeOpacity={0.85}
              style={styles.loadingSkipBtn}>
              <Text style={styles.loadingSkipText}>跳过地图</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export default MapWebView;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#eef0f2' },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 6, fontSize: 12, color: colors.textMuted },
  loadingStage: { marginTop: 8, fontSize: 11, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
  loadingSkipBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  loadingSkipText: { fontSize: 12, color: colors.textSecondary },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: '#eef0f2',
  },
  fallbackTitle: { fontSize: 15, color: colors.text, fontWeight: '600' },
  fallbackHint: { marginTop: 6, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  fallbackReasonWrap: {
    marginTop: 10,
    maxHeight: 220,
    alignSelf: 'stretch',
  },
  fallbackReasonInner: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fallbackReason: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'left',
    lineHeight: 16,
  },
  fallbackBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  fallbackBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
  },
  fallbackBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fallbackBtnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  fallbackBtnGhostText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});

export type { LngLat };
