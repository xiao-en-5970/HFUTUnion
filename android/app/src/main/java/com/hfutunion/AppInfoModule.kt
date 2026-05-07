package com.hfutunion

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import java.io.File

/**
 * AppInfoModule 把 BuildConfig.VERSION_NAME / VERSION_CODE 暴露给 JS，
 * 同时提供"打开 apk 安装界面"的能力。
 *
 * 为什么不让 JS 直接读 package.json::version？
 *   package.json 是源码文件——build 时 metro 会把它打进 bundle，
 *   但**版本号同步**靠 build-apk.sh 在 build 前手改 package.json::version。
 *   一旦同步漏了或 metro 缓存命中旧版，JS 拿到的就跟实际 apk 版本错位。
 *   BuildConfig 是 gradle 在编译时直接生成的常量，**不可能错**。
 *
 * 暴露给 JS：
 *   getVersionName(): string   如 "1.1.2"
 *   getVersionCode(): int      如 10102
 *   installApk(opts): Promise  打开 apk 安装界面（系统弹出确认对话框）
 *     opts.path        本地 apk 绝对路径（绝对路径，含 .apk 后缀）
 *     opts.authority   FileProvider authority；默认 "${BuildConfig.APPLICATION_ID}.fileprovider"
 *
 * Android 7+ 不允许 file:// URI 跨进程，必须走 FileProvider 转 content://；
 * 详见 res/xml/file_paths.xml + AndroidManifest.xml 的 <provider> 声明。
 */
class AppInfoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppInfo"

  override fun getConstants(): MutableMap<String, Any> {
    val constants = mutableMapOf<String, Any>()
    constants["versionName"] = BuildConfig.VERSION_NAME
    constants["versionCode"] = BuildConfig.VERSION_CODE
    constants["applicationId"] = BuildConfig.APPLICATION_ID
    return constants
  }

  @ReactMethod
  fun getVersionName(promise: Promise) {
    try {
      promise.resolve(BuildConfig.VERSION_NAME)
    } catch (e: Throwable) {
      promise.reject("E_VERSION", e.message, e)
    }
  }

  @ReactMethod
  fun getVersionCode(promise: Promise) {
    try {
      promise.resolve(BuildConfig.VERSION_CODE)
    } catch (e: Throwable) {
      promise.reject("E_VERSION", e.message, e)
    }
  }

  /**
   * 打开 apk 安装界面。
   *
   * 返回 promise 仅表示"是否成功跳到系统安装 UI"——实际是否安装由用户在系统对话框里决定，
   * app 这边没法感知（Android 设计如此，也无法感知）。
   *
   * 失败原因（reject code）：
   *   - E_FILE_NOT_FOUND  apk 不存在
   *   - E_INSTALL_NEEDS_PERMISSION  用户没给"未知来源安装"权限（Android 8+）；JS 端可以引导
   *   - E_INSTALL_LAUNCH  其他系统级失败（比如没有 PackageInstaller，理论上不可能）
   */
  @ReactMethod
  fun installApk(opts: ReadableMap, promise: Promise) {
    try {
      val path = opts.getString("path")
      if (path.isNullOrBlank()) {
        promise.reject("E_PATH", "path 不能为空")
        return
      }
      val file = File(path)
      if (!file.exists() || !file.isFile) {
        promise.reject("E_FILE_NOT_FOUND", "apk 文件不存在: $path")
        return
      }

      val ctx = reactApplicationContext
      val authority =
          if (opts.hasKey("authority") && !opts.getString("authority").isNullOrBlank())
              opts.getString("authority")!!
          else "${ctx.packageName}.fileprovider"

      // Android 8+ 需要"未知来源安装"权限——没给的话直接抛 E_INSTALL_NEEDS_PERMISSION，
      // JS 端用 Linking 跳到系统设置页让用户授权
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !ctx.packageManager.canRequestPackageInstalls()) {
        val map = WritableNativeMap()
        map.putString("path", path)
        promise.reject(
            "E_INSTALL_NEEDS_PERMISSION",
            "需要授予\"未知来源应用安装\"权限",
            map)
        return
      }

      val uri: Uri = FileProvider.getUriForFile(ctx, authority, file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_INSTALL_LAUNCH", e.message ?: "安装启动失败", e)
    }
  }

  /**
   * 跳"未知来源应用安装"的系统设置页。
   *
   * Android 8+ 必备：用户首次更新前需要在这里给本 app 勾上权限，否则 installApk 会
   * reject E_INSTALL_NEEDS_PERMISSION。
   */
  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
              data = Uri.parse("package:${ctx.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          } else {
            // Android 7 及以下走全局设置页
            Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_OPEN_SETTINGS", e.message ?: "打开设置失败", e)
    }
  }
}
