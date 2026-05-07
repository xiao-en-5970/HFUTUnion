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

/**
 * app 内更新——OSS 上手动维护的版本元信息 JSON。
 *
 * 详见 hfut-front/APP-UPDATE.md 顶部的 JSON 格式说明。约定：
 *   - 启动时 GET 这个 URL，拿到 { version_name, version_code, apk_url, ... }
 *   - 跟本地 versionToCode(package.json::version) 对比，新就弹更新弹窗
 *   - 这个 URL 必须可以被未登录用户匿名访问（七牛默认公开 bucket 直接给）
 *
 * 设计取舍：之前做过后端 admin 上传接口的方案，撤回了。原因：
 *   - apk 30~80MB 容易撞上 nginx 上传体积上限（client_intended_to_send_too_large 413）
 *   - 学生项目维护成本：DB 表 + admin 中间件 + service + controller + 上传脚本
 *     不如直接七牛后台传 apk + 改 latest.json 来得实在
 */
export const APP_RELEASE_INFO_URL =
  'https://oss.xiaoen.xyz/app-release/android/latest.json';
