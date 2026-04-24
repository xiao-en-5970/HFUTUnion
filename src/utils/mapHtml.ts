/**
 * WebView 里运行的 MapLibre GL JS 自包含 HTML 生成器
 *
 * 设计要点：
 * - 三种 mode：
 *   1) 'picker'：地图中心固定一个十字准星 + 浮动 pin；RN 端点「确认」时 postMessage 读回当前中心的 lng/lat
 *   2) 'route'：给定两个坐标，自动 fetch GraphHopper /route，画线 + auto-fit bounds；
 *      若寻路失败则退化为直线 + 欧氏距离
 *   3) 'view'：只展示 marker，不接受点击
 * - 通过 window.ReactNativeWebView.postMessage 向 RN 汇报事件；RN 通过 window.postMessage(cmd) 或
 *   injectJavaScript 调用 window.__mapHandle 下发指令
 * - 所有网络错误都以 { type: 'error', ... } 汇报给 RN，RN 侧负责兜底 UI
 *
 * 依赖：MapLibre GL JS 4.x CDN（unpkg）；首次加载需要外网，后续瓦片来自自建 Martin
 */

import {
  MAP_TILE_URL,
  MAP_TILE_MAX_ZOOM,
  MAP_ROUTE_BASE,
  MAP_STATIC_BASE,
  MAP_LIBRE_VERSION,
  MAP_LIBRE_LEGACY_VERSION,
  MAP_FALLBACK_CENTER,
  MAP_DEFAULT_PICK_ZOOM,
  MAP_DEFAULT_OVERVIEW_ZOOM,
  MAP_ROUTE_TIMEOUT_MS,
  MAP_ROUTE_DEFAULT_PROFILE,
} from '../config/map';

export type LngLat = { lng: number; lat: number };

export type MapHtmlOptions =
  | {
      mode: 'picker';
      /** 初始中心，若缺省用 MAP_FALLBACK_CENTER */
      center?: LngLat;
      zoom?: number;
    }
  | {
      mode: 'route';
      origin: LngLat;
      dest: LngLat;
      profile?: string;
    }
  | {
      mode: 'view';
      markers: Array<LngLat & { label?: string; color?: string }>;
      center?: LngLat;
      zoom?: number;
    };

const STYLE_LAYERS_JSON = JSON.stringify([
  { id: 'bg', type: 'background', paint: { 'background-color': '#eef0f2' } },
  {
    id: 'landuse',
    type: 'fill',
    source: 'tiles',
    'source-layer': 'landuse',
    paint: { 'fill-color': '#e9ece1', 'fill-opacity': 0.6 },
  },
  {
    id: 'park',
    type: 'fill',
    source: 'tiles',
    'source-layer': 'park',
    paint: { 'fill-color': '#d7ead2' },
  },
  {
    id: 'water',
    type: 'fill',
    source: 'tiles',
    'source-layer': 'water',
    paint: { 'fill-color': '#a6cde6' },
  },
  {
    id: 'waterway',
    type: 'line',
    source: 'tiles',
    'source-layer': 'waterway',
    paint: { 'line-color': '#7fb7d8', 'line-width': 1 },
  },
  {
    id: 'roads-casing',
    type: 'line',
    source: 'tiles',
    'source-layer': 'transportation',
    paint: {
      'line-color': '#c9cfd4',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 3, 18, 10],
    },
  },
  {
    id: 'roads',
    type: 'line',
    source: 'tiles',
    'source-layer': 'transportation',
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 2, 18, 8],
    },
  },
  {
    id: 'buildings',
    type: 'fill',
    source: 'tiles',
    'source-layer': 'building',
    paint: { 'fill-color': '#d6d8dc', 'fill-opacity': 0.8 },
  },
  {
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.92 },
  },
]);

function escapeJson(v: unknown): string {
  // JSON.stringify + 基础防 XSS：闭合 </script 与反引号不会出现在纯 JSON 中，但保险处理
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

/** 生成地图 WebView 的 HTML */
export function buildMapHtml(opts: MapHtmlOptions): string {
  const modeJson = escapeJson(opts);
  const tileUrl = MAP_TILE_URL;
  const routeBase = MAP_ROUTE_BASE;
  const fallbackCenter = MAP_FALLBACK_CENTER;
  const pickZoom = MAP_DEFAULT_PICK_ZOOM;
  const overviewZoom = MAP_DEFAULT_OVERVIEW_ZOOM;
  const maxZoom = MAP_TILE_MAX_ZOOM;
  const routeTimeout = MAP_ROUTE_TIMEOUT_MS;
  const defaultProfile = MAP_ROUTE_DEFAULT_PROFILE;

  const staticBase = MAP_STATIC_BASE;
  const mlVer = MAP_LIBRE_VERSION;
  const mlLegacyVer = MAP_LIBRE_LEGACY_VERSION;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes" />
<title>map</title>
<link id="mlCss" href="${staticBase}/maplibre-gl-${mlVer}.css" rel="stylesheet" />
<style>
  html,body{height:100%;margin:0;padding:0;background:#eef0f2;font-family:system-ui,-apple-system,sans-serif;}
  #map{position:absolute;inset:0;}
  #crosshair{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;z-index:5;
  }
  #crosshair .pin{
    width:34px;height:34px;background:#2563EB;border:3px solid #fff;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);box-shadow:0 4px 10px rgba(0,0,0,.25);
  }
  #crosshair .dot{
    position:absolute;left:50%;top:50%;width:6px;height:6px;background:#fff;border-radius:50%;
    transform:translate(-50%,-50%) rotate(-45deg);
  }
  #shadow{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:14px;height:6px;border-radius:50%;background:rgba(0,0,0,.25);filter:blur(2px);z-index:4;
  }
  .stop{
    width:18px;height:18px;border-radius:50%;background:#2563EB;border:3px solid #fff;
    box-shadow:0 2px 4px rgba(0,0,0,.25);
  }
  .stop.end{background:#16A34A;}
  #fallback{
    display:none;position:absolute;inset:0;background:#eef0f2;align-items:center;justify-content:center;
    color:#334155;padding:24px;text-align:center;font-size:14px;z-index:30;
  }
  #fallback.show{display:flex;flex-direction:column;}
  #fallback h4{margin:0 0 8px;font-size:15px;color:#0f172a;}
  #fallback p{margin:0 0 4px;}
</style>
</head>
<body>
<div id="map"></div>
<div id="shadow"></div>
<div id="crosshair"><div class="pin"><div class="dot"></div></div></div>
<div id="fallback">
  <h4>地图加载失败</h4>
  <p>请检查网络，或稍后重试。</p>
  <p style="color:#64748b;font-size:12px;margin-top:6px;">可继续使用 GPS/地址簿选址。</p>
  <p id="fallbackReason" style="color:#94a3b8;font-size:11px;margin-top:8px;word-break:break-all;"></p>
</div>

<script>
(function(){
  var RN = (typeof window !== 'undefined' && window.ReactNativeWebView)
    ? window.ReactNativeWebView : { postMessage: function(){ } };
  function send(msg){ try{ RN.postMessage(typeof msg === 'string' ? msg : JSON.stringify(msg)); }catch(e){} }

  var OPTS = ${modeJson};
  var TILE_URL = ${escapeJson(tileUrl)};
  var ROUTE_BASE = ${escapeJson(routeBase)};
  var FALLBACK_CENTER = ${escapeJson(fallbackCenter)};
  var PICK_ZOOM = ${pickZoom};
  var OVERVIEW_ZOOM = ${overviewZoom};
  var MAX_ZOOM = ${maxZoom};
  var ROUTE_TIMEOUT = ${routeTimeout};
  var DEFAULT_PROFILE = ${escapeJson(defaultProfile)};

  // 阶段日志：每走到一步都上报，降级页也能看到；方便排障时定位卡死的环节
  var STAGE = [];
  function stage(name, extra){
    var ts = Date.now();
    if(!STAGE._t0) STAGE._t0 = ts;
    var line = '[' + (ts - STAGE._t0) + 'ms] ' + name + (extra ? ' ' + extra : '');
    STAGE.push(line);
    send({ type: 'stage', name: name, ms: ts - STAGE._t0, extra: extra || '' });
  }
  function showFallback(reason){
    var full = String(reason || '') + (STAGE.length ? ('\\n--- 阶段日志 ---\\n' + STAGE.join('\\n')) : '');
    var el = document.getElementById('fallback');
    if(el){
      el.classList.add('show');
      var rEl = document.getElementById('fallbackReason');
      if(rEl) rEl.textContent = full;
    }
    send({ type: 'error', reason: full });
  }

  stage('boot', 'ua=' + (navigator.userAgent || '').slice(0, 80));

  // 粗略检测 WebView 版本（Chrome / AppleWebKit 主版本号）
  var ua = navigator.userAgent || '';
  var chromeMatch = ua.match(/Chrome\\/(\\d+)/);
  var webkitMatch = ua.match(/AppleWebKit\\/(\\d+)/);
  var chromeMajor = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;
  var webkitMajor = webkitMatch ? parseInt(webkitMatch[1], 10) : 0;
  // MapLibre 4 需要 Chrome 90+；太旧先尝试 MapLibre 3（Chrome 65+ 可用）
  var useMapLibre3 = chromeMajor > 0 && chromeMajor < 90;
  if(useMapLibre3) stage('old-webview', 'chrome=' + chromeMajor);

  var STATIC_BASE = ${escapeJson(staticBase)};
  var ML_VER = ${escapeJson(mlVer)};
  var ML_LEGACY_VER = ${escapeJson(mlLegacyVer)};
  // 同机分发：无 CDN 依赖，gzip 压缩，直连地图服务器；公网 CDN 仅兜底
  var ML3_CSS = STATIC_BASE + '/maplibre-gl-' + ML_LEGACY_VER + '.css';
  var CDN_LIST_ML4 = [
    STATIC_BASE + '/maplibre-gl-' + ML_VER + '.js',
    'https://cdn.jsdelivr.net/npm/maplibre-gl@' + ML_VER + '/dist/maplibre-gl.js',
    'https://fastly.jsdelivr.net/npm/maplibre-gl@' + ML_VER + '/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@' + ML_VER + '/dist/maplibre-gl.js'
  ];
  var CDN_LIST_ML3 = [
    STATIC_BASE + '/maplibre-gl-' + ML_LEGACY_VER + '.js',
    'https://cdn.jsdelivr.net/npm/maplibre-gl@' + ML_LEGACY_VER + '/dist/maplibre-gl.js',
    'https://fastly.jsdelivr.net/npm/maplibre-gl@' + ML_LEGACY_VER + '/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@' + ML_LEGACY_VER + '/dist/maplibre-gl.js'
  ];

  var CDN_LIST = useMapLibre3 ? CDN_LIST_ML3 : CDN_LIST_ML4;
  var cdnIdx = 0;
  var cdnTries = [];
  var triedML3Fallback = useMapLibre3; // 已经是 ML3 就不再二次 fallback

  function tryLoadCdn(){
    if(cdnIdx >= CDN_LIST.length){
      if(!triedML3Fallback){
        // ML4 全挂，换 ML3 再试一轮
        stage('ml4-failed', cdnTries.join('|'));
        triedML3Fallback = true;
        CDN_LIST = CDN_LIST_ML3;
        cdnIdx = 0;
        cdnTries = [];
        // 换 CSS 到 ML3
        var oldCss = document.getElementById('mlCss');
        if(oldCss){ oldCss.href = ML3_CSS; }
        tryLoadCdn();
        return;
      }
      showFallback('maplibre-load 全挂: ' + cdnTries.join(' | '));
      return;
    }
    var url = CDN_LIST[cdnIdx++];
    var host = url.split('/')[2];
    stage('cdn-try', host);
    var s = document.createElement('script');
    s.src = url;
    var t0 = Date.now();
    // 单个 CDN 超时 5s：第一个是同机分发（应 <1s），超时基本等于不可达；公网 CDN 也给 5s
    var timer = setTimeout(function(){
      cdnTries.push(host + ' timeout');
      stage('cdn-timeout', host);
      try{ s.remove(); }catch(e){}
      tryLoadCdn();
    }, 5000);
    s.onload = function(){
      clearTimeout(timer);
      stage('cdn-loaded', host + ' ' + (Date.now() - t0) + 'ms');
      send({ type: 'cdnOk', host: host, ms: Date.now() - t0 });
      try{ init(); }
      catch(e){
        stage('init-threw', e && e.message || '');
        // init 抛异常（可能是 MapLibre 4 API 在老 WebView 里不兼容）
        // 如果还是 ML4，换 ML3 重试
        if(!triedML3Fallback){
          triedML3Fallback = true;
          CDN_LIST = CDN_LIST_ML3;
          cdnIdx = 0;
          cdnTries = [];
          if(window.maplibregl) { try{ delete window.maplibregl; }catch(e2){ window.maplibregl = undefined; } }
          var oldCss2 = document.getElementById('mlCss');
          if(oldCss2){ oldCss2.href = ML3_CSS; }
          tryLoadCdn();
        } else {
          showFallback('init 抛异常: ' + (e && e.message || ''));
        }
      }
    };
    s.onerror = function(){
      clearTimeout(timer);
      cdnTries.push(host + ' error');
      stage('cdn-error', host);
      tryLoadCdn();
    };
    document.head.appendChild(s);
  }
  tryLoadCdn();

  function buildStyle(){
    // 注意：不包含任何 symbol / text 图层，所以不需要 glyphs 字段。
    // MapLibre 4 对 glyphs: undefined 会视为 "string expected, undefined found" 校验失败，
    // 导致 style 永远处于 loading 态，load 事件永不触发；直接省略该 key 即可。
    return {
      version: 8,
      sources: {
        tiles: { type: 'vector', tiles: [TILE_URL], minzoom: 0, maxzoom: MAX_ZOOM },
        route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
      },
      layers: ${STYLE_LAYERS_JSON}
    };
  }

  var map, originMarker, destMarker;

  function init(){
    var isPicker = OPTS.mode === 'picker';
    var initCenter, initZoom;
    if(OPTS.mode === 'route'){
      initCenter = [OPTS.origin.lng, OPTS.origin.lat];
      initZoom = PICK_ZOOM - 2;
    } else if(OPTS.mode === 'view'){
      var first = (OPTS.markers && OPTS.markers[0]) || { lng: FALLBACK_CENTER[0], lat: FALLBACK_CENTER[1] };
      initCenter = OPTS.center ? [OPTS.center.lng, OPTS.center.lat] : [first.lng, first.lat];
      initZoom = OPTS.zoom || PICK_ZOOM;
    } else {
      initCenter = OPTS.center ? [OPTS.center.lng, OPTS.center.lat] : FALLBACK_CENTER;
      initZoom = OPTS.zoom || PICK_ZOOM;
    }

    // 隐藏 picker 模式外的十字准星
    if(!isPicker){
      var ch = document.getElementById('crosshair');
      var sh = document.getElementById('shadow');
      if(ch) ch.style.display = 'none';
      if(sh) sh.style.display = 'none';
    }

    stage('init-start');
    map = new maplibregl.Map({
      container: 'map',
      style: buildStyle(),
      center: initCenter,
      zoom: initZoom,
      minZoom: 3,
      maxZoom: 19,
      attributionControl: false
    });
    stage('map-created');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // 兜底：某些 WebView 在某些 style/tile 错误时不会触发 load 事件；20s 还没 load 就当 ready 触发，让用户看到结果（哪怕瓦片空白）
    var readyFired = false;
    var loadTimer = setTimeout(function(){
      if(!readyFired){
        stage('load-event-never', '20s');
        readyFired = true;
        send({ type: 'ready' });
        if(OPTS.mode === 'route') drawRoute();
        if(OPTS.mode === 'view') drawMarkers();
      }
    }, 20000);

    map.on('load', function(){
      clearTimeout(loadTimer);
      if(readyFired) return;
      readyFired = true;
      stage('map-load-event');
      send({ type: 'ready' });
      if(OPTS.mode === 'route') drawRoute();
      if(OPTS.mode === 'view') drawMarkers();
      if(OPTS.mode === 'picker'){
        map.on('moveend', function(){
          var c = map.getCenter();
          send({ type: 'centerChange', lng: c.lng, lat: c.lat, zoom: map.getZoom() });
        });
      }
    });
    map.on('sourcedata', function(ev){
      // 首次有 source 数据到达也视为「可用」——兼容不触发 load 的 WebView
      if(!readyFired && ev && ev.isSourceLoaded){
        clearTimeout(loadTimer);
        readyFired = true;
        stage('sourcedata-ready', (ev.sourceId || '') + '');
        send({ type: 'ready' });
        if(OPTS.mode === 'route') drawRoute();
        if(OPTS.mode === 'view') drawMarkers();
        if(OPTS.mode === 'picker'){
          map.on('moveend', function(){
            var c = map.getCenter();
            send({ type: 'centerChange', lng: c.lng, lat: c.lat, zoom: map.getZoom() });
          });
        }
      }
    });
    map.on('error', function(ev){
      var msg = (ev && ev.error && ev.error.message) || 'tile';
      stage('tile-error', msg.slice(0, 60));
      send({ type: 'tileError', message: msg });
      // 识别是否是 style validation 错误（会永远阻塞 load 事件）——这些关键字命中就直接降级
      var fatal = /expected|required|invalid value|unknown property|unknown source/i.test(msg);
      if(fatal && !readyFired){
        clearTimeout(loadTimer);
        readyFired = true; // 避免和其他 ready 路径重复
        showFallback('style 校验失败: ' + msg);
      }
    });

    // RN → Web 指令通道（通过 injectJavaScript 调用）
    window.__mapCmd = function(cmd){
      try{
        if(!cmd || !cmd.type) return;
        if(cmd.type === 'flyTo' && cmd.lng != null && cmd.lat != null){
          map.flyTo({ center: [cmd.lng, cmd.lat], zoom: cmd.zoom || PICK_ZOOM, speed: 1.4 });
        } else if(cmd.type === 'getCenter'){
          var c = map.getCenter();
          send({ type: 'centerChange', lng: c.lng, lat: c.lat, zoom: map.getZoom() });
        } else if(cmd.type === 'fitBounds' && Array.isArray(cmd.bounds)){
          map.fitBounds(cmd.bounds, { padding: cmd.padding || 60, duration: 500 });
        } else if(cmd.type === 'updateOrigin' && cmd.lng != null && cmd.lat != null){
          // 活定位：移动起点 marker；可选 reroute 表示同步拉一次新路线
          if(originMarker){ originMarker.setLngLat([cmd.lng, cmd.lat]); }
          if(OPTS && OPTS.origin){ OPTS.origin.lng = cmd.lng; OPTS.origin.lat = cmd.lat; }
          if(cmd.reroute && OPTS && OPTS.dest){
            fetchRoute({ lng: cmd.lng, lat: cmd.lat }, OPTS.dest, OPTS.profile || DEFAULT_PROFILE);
          }
        }
      }catch(e){ send({ type: 'cmdError', message: e.message }); }
    };
  }

  function drawMarkers(){
    if(!Array.isArray(OPTS.markers)) return;
    OPTS.markers.forEach(function(m){
      var el = document.createElement('div');
      el.className = 'stop';
      if(m.color) el.style.background = m.color;
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([m.lng, m.lat]).addTo(map);
    });
  }

  function drawRoute(){
    var o = OPTS.origin, d = OPTS.dest;
    var oEl = document.createElement('div'); oEl.className = 'stop';
    var dEl = document.createElement('div'); dEl.className = 'stop end';
    originMarker = new maplibregl.Marker({ element: oEl, anchor: 'center' })
      .setLngLat([o.lng, o.lat]).addTo(map);
    destMarker = new maplibregl.Marker({ element: dEl, anchor: 'center' })
      .setLngLat([d.lng, d.lat]).addTo(map);

    fitBoundsFor([o, d]);
    fetchRoute(o, d, OPTS.profile || DEFAULT_PROFILE);
  }

  function fitBoundsFor(pts){
    if(!pts.length) return;
    var minLng=pts[0].lng, maxLng=pts[0].lng, minLat=pts[0].lat, maxLat=pts[0].lat;
    for(var i=1;i<pts.length;i++){
      if(pts[i].lng<minLng) minLng=pts[i].lng;
      if(pts[i].lng>maxLng) maxLng=pts[i].lng;
      if(pts[i].lat<minLat) minLat=pts[i].lat;
      if(pts[i].lat>maxLat) maxLat=pts[i].lat;
    }
    if(minLng === maxLng && minLat === maxLat){
      map.flyTo({ center: [minLng, minLat], zoom: PICK_ZOOM, speed: 1.4 });
      return;
    }
    map.fitBounds([[minLng, minLat],[maxLng, maxLat]], { padding: 80, duration: 600, maxZoom: 17 });
  }

  function fetchRoute(o, d, profile){
    var url = ROUTE_BASE + '/route?point=' + o.lat + ',' + o.lng + '&point=' + d.lat + ',' + d.lng + '&profile=' + encodeURIComponent(profile) + '&points_encoded=false';
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function(){ if(controller) controller.abort(); }, ROUTE_TIMEOUT);
    fetch(url, controller ? { signal: controller.signal } : {})
      .then(function(r){ clearTimeout(timer); return r.ok ? r.json() : r.text().then(function(t){ throw new Error('HTTP '+r.status+': '+t); }); })
      .then(function(data){
        if(!data || !data.paths || !data.paths[0]) throw new Error('no path');
        var p = data.paths[0];
        var coords = (p.points && p.points.coordinates) || [];
        if(!Array.isArray(coords) || coords.length < 2) throw new Error('empty route');
        map.getSource('route').setData({
          type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {}
        });
        fitCoords(coords);
        send({ type: 'routeOk', distance: p.distance, time: p.time });
      })
      .catch(function(err){
        clearTimeout(timer);
        // 降级：寻路服务不可用，画直线并用欧氏距离通知 RN
        map.getSource('route').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[o.lng,o.lat],[d.lng,d.lat]] },
          properties: {}
        });
        send({ type: 'routeFallback', message: String(err && err.message || err) });
      });
  }

  function fitCoords(coords){
    var minLng=coords[0][0], maxLng=coords[0][0], minLat=coords[0][1], maxLat=coords[0][1];
    for(var i=1;i<coords.length;i++){
      var c=coords[i];
      if(c[0]<minLng)minLng=c[0]; if(c[0]>maxLng)maxLng=c[0];
      if(c[1]<minLat)minLat=c[1]; if(c[1]>maxLat)maxLat=c[1];
    }
    map.fitBounds([[minLng,minLat],[maxLng,maxLat]], { padding: 80, duration: 700, maxZoom: 17 });
  }

  // 全局未捕获错误：兜底上报
  window.addEventListener('error', function(e){
    send({ type: 'jsError', message: (e && e.message) || '' });
  });
})();
</script>
</body>
</html>`;
}

/** 建议默认 zoom：两点距离很近（同校区）用 17 左右；跨校区/城市用 13 以下 */
export function suggestZoomForPair(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); // 米
  if (dist < 500) return 17;
  if (dist < 2000) return 15;
  if (dist < 8000) return 13;
  if (dist < 30000) return 11;
  return 9;
}
