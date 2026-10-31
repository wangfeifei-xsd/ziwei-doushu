package com.ziwei.platform

import android.app.Activity
import android.content.Intent
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import java.io.File

@InvokeArg class ShareArgs { lateinit var path: String; lateinit var mime: String }
@InvokeArg class NavigationArgs { var intercept: Boolean = false; var light: Boolean = false }
class ZiweiShareProvider: FileProvider()

@TauriPlugin
class PlatformPlugin(private val activity: Activity): Plugin(activity) {
    private var back: OnBackPressedCallback? = null
    override fun load(webView: WebView) {
        val owner = activity as? AppCompatActivity ?: return
        back = object: OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.dispatchEvent(new Event('ziwei-system-back'))", null)
            }
        }
        owner.onBackPressedDispatcher.addCallback(owner, back!!)
    }
    @Command fun navigation(invoke: Invoke) {
        val args = invoke.parseArgs(NavigationArgs::class.java)
        activity.runOnUiThread {
            back?.isEnabled = args.intercept
            val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            controller.isAppearanceLightStatusBars = args.light
            controller.isAppearanceLightNavigationBars = args.light
            invoke.resolve()
        }
    }
    @Command fun share(invoke: Invoke) {
        val args = invoke.parseArgs(ShareArgs::class.java)
        activity.runOnUiThread {
            try {
                val file = File(args.path).canonicalFile
                val allowed = File(activity.cacheDir, "ziwei-share").canonicalFile
                require(file.parentFile == allowed && file.isFile)
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.ziwei.share", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = args.mime
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = android.content.ClipData.newRawUri("紫微命盘", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(Intent.createChooser(send, "导出紫微命盘"))
                // Android cannot confirm that the receiving app has saved the file.
                val result = JSObject()
                result.put("status", "shared")
                invoke.resolve(result)
            } catch (_: Exception) { invoke.reject("无法分享文件，请稍后重试。") }
        }
    }
}
