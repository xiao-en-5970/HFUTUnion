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
