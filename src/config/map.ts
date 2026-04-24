/**
 * 地图服务配置
 * - Martin 瓦片服务：OpenMapTiles schema，zoom 0–14，覆盖安徽省
 * - GraphHopper 寻路服务：支持 foot / bike / car 等 profile
 * - 这两项目前仅开放 HTTP；Android network_security_config 与 iOS NSExceptionDomains 已放行
 */

export const MAP_TILE_BASE = 'http://oeiw1426422.bohrium.tech:50001';
export const MAP_TILE_URL = `${MAP_TILE_BASE}/tiles/{z}/{x}/{y}`;
export const MAP_ROUTE_BASE = 'http://oeiw1426422.bohrium.tech:50002';
/** 静态资源服务（同机托管 MapLibre 及样式，启用 gzip + 长缓存 + CORS *）
 *  让 WebView 走同机下载，避免依赖公共 CDN，弱网也能快速加载 */
export const MAP_STATIC_BASE = 'http://oeiw1426422.bohrium.tech:50003';
/** MapLibre 版本，保证同源同版本资源一致 */
export const MAP_LIBRE_VERSION = '4.7.1';
/** 旧 WebView 兜底版本（Chrome 65+ 可用） */
export const MAP_LIBRE_LEGACY_VERSION = '3.6.2';

/** 瓦片数据 zoom 上限；超出后仍可显示但不再细化 */
export const MAP_TILE_MAX_ZOOM = 14;

/** 校内选点默认 zoom，≈ 100m 比例尺 */
export const MAP_DEFAULT_PICK_ZOOM = 17;

/** 跨校区/无坐标参考时的 zoom，≈ 10km 比例尺 */
export const MAP_DEFAULT_OVERVIEW_ZOOM = 11;

/** PBF 覆盖区域兜底中心（合肥市中心附近） */
export const MAP_FALLBACK_CENTER: [number, number] = [117.22, 31.82];

/** WebView 加载超时，超时后进入降级 UI。
 * 说明：MapLibre GL JS 现由地图服务器同机分发（~210KB gzipped），正常应在几秒内完成；
 * 公网 CDN 仅作兜底，因此给 20s 窗口即可。
 */
export const MAP_WEBVIEW_TIMEOUT_MS = 20000;

/** 寻路请求超时 */
export const MAP_ROUTE_TIMEOUT_MS = 8000;

/** 寻路默认 profile：步行 */
export const MAP_ROUTE_DEFAULT_PROFILE = 'foot';
