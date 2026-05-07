package com.hfutunion

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * AppInfoPackage 注册 AppInfoModule 到 React Native bridge。
 *
 * 用法：MainApplication.kt 在 packages.apply { add(AppInfoPackage()) } 里注册一次。
 *
 * 注：RN 0.82 起 ReactPackage 经典接口被标记 deprecated（推荐迁到 TurboModule），
 * 但目前 PackageList autolink 仍走经典接口，写自定义模块沿用即可。后续 RN 全面切到
 * 新架构时再考虑迁移。@Suppress 把"重写废弃方法"warning 压一下，避免噪音。
 */
@Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
class AppInfoPackage : ReactPackage {
  override fun createNativeModules(
      reactContext: ReactApplicationContext
  ): MutableList<NativeModule> = mutableListOf(AppInfoModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): MutableList<ViewManager<*, *>> = mutableListOf()
}
