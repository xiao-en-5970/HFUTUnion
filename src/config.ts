/**
 * 与后端 HFUT-Graduation-Project 对齐。
 *
 * 必须走 https：服务器的 openresty 对 http 做 301 跳转到 https，
 * Android OkHttp 跟随 301 时会把 POST 改成 GET，本项目又存在
 * 贪心路由 GET /user/:id（JWT 保护），于是 POST /user/login 会被
 * 误路由到 GET /user/login，返回「未提供认证 token」。直接用 https
 * 避开这条重定向即可。
 */
export const API_BASE = 'https://api.xiaoen.xyz/api/v1';

// app 内更新功能的 latest.json URL **不**写在这里——避免硬编码 OSS 基础设施到 JS bundle。
// 前端通过 GET /api/v1/app/release-info-url 拿到该地址（后端环境变量 APP_RELEASE_INFO_URL 控制），
// 想换 OSS / 关功能改后端配置即可，不需要重发前端。
// 详见 src/api/appUpdate.ts。
