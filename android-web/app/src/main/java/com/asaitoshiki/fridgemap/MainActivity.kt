package com.asaitoshiki.fridgemap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * ウェブ版をそのまま動かす画面。
 *
 * 画面と計算はすべて assets/www に写したウェブ版が受け持つ。ここで持つのは、
 * ウェブ版だけではできない端末の機能へのつなぎだけ。
 * - 位置情報とカメラの許可を、端末の許可の画面につなぐ
 * - 控えの書き出し（ファイルの保存）と、LINE などへの共有
 * - 戻るボタンで、開いている画面を閉じる
 *
 * ページは https://appassets.androidplatform.net/ という端末の中だけの住所で開く。
 * 外のサイトへは出ていかない（INTERNET の権限も持たない）。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var container: FrameLayout

    /* 選ばずに閉じたときは null を返す決まりなので、中身を null にできる形で持つ */
    private var fileCallback: ValueCallback<Array<Uri>?>? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingSaveText: String? = null
    private var usedFallback = false

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    private val askLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val granted = grants.values.any { it }
        pendingGeo?.let { (origin, callback) -> callback.invoke(origin, granted, false) }
        pendingGeo = null
    }

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingWebPermission?.let { request ->
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
        }
        pendingWebPermission = null
    }

    private val saveDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = pendingSaveText
        pendingSaveText = null
        if (uri == null || text == null) return@registerForActivityResult
        val ok = runCatching {
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        }.isSuccess
        Toast.makeText(this, if (ok) "控えを保存しました" else "保存できませんでした", Toast.LENGTH_SHORT).show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        container = FrameLayout(this).apply { addView(webView) }
        setContentView(container)

        /* 画面の端（時計や戻るボタンの帯）にウェブ版が潜らないよう、その分だけ内側に寄せる */
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        applyBars(isSystemDark())

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        webView.addJavascriptInterface(Bridge(), "FridgeAndroid")
        webView.webViewClient = Client()
        webView.webChromeClient = Chrome()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                /* 開いているシートや編集をウェブ版に閉じてもらう。閉じるものが無ければアプリを抜ける */
                webView.evaluateJavascript("(window.fridgeBack ? window.fridgeBack() : false)") { handled ->
                    if (handled != "true") finish()
                }
            }
        })

        if (savedInstanceState == null) webView.loadUrl(START_URL) else webView.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun isSystemDark(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /** 端の帯の地の色と文字の色を、ウェブ版の明るい・暗い配色に合わせる */
    private fun applyBars(dark: Boolean) {
        container.setBackgroundColor(if (dark) Color.parseColor("#0C1418") else Color.parseColor("#EEF3F6"))
        WindowInsetsControllerCompat(window, container).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    /** ウェブ版から呼ぶ、端末の機能。window.FridgeAndroid として見える */
    inner class Bridge {
        /** LINE などへ送る。端末の共有の画面を開くだけで、送り先はその人が選ぶ */
        @JavascriptInterface
        fun share(title: String, text: String) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(send, title))
            }
        }

        /** 控えをファイルに保存する。保存先はその人が選ぶ */
        @JavascriptInterface
        fun saveFile(name: String, text: String) {
            runOnUiThread {
                pendingSaveText = text
                saveDocument.launch(name)
            }
        }

        /** ウェブ版で明るい・暗いを選んだときに、端の帯の色もそろえる */
        @JavascriptInterface
        fun setDark(dark: Boolean) {
            runOnUiThread { applyBars(dark) }
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assetLoader.shouldInterceptRequest(request.url)

        /** 端末の中のページ以外へは移らない。外の住所は、ブラウザで開くかどうかをその人に任せる */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == ASSET_HOST || url.scheme == "file") return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
            return true
        }

        /**
         * 万一、端末の中の住所で開けなかったときは、ファイルとして開き直す。
         * 画面が真っ白のままになるのを避けるため。
         */
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame && !usedFallback) {
                usedFallback = true
                view.settings.allowFileAccess = true
                view.loadUrl(FALLBACK_URL)
            }
        }
    }

    private inner class Chrome : WebChromeClient() {
        /** 位置情報。ウェブ版で「位置情報を使う」を押したときに、端末の許可を聞く */
        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ||
                hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            ) {
                callback.invoke(origin, true, false)
                return
            }
            pendingGeo = origin to callback
            askLocation.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION))
        }

        /** カメラ。バーコードと期限の読み取りで使う */
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                if (!request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny()
                    return@runOnUiThread
                }
                if (hasPermission(Manifest.permission.CAMERA)) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    pendingWebPermission = request
                    askCamera.launch(Manifest.permission.CAMERA)
                }
            }
        }

        /** 控えから戻すときのファイル選びと、写真で読み取るときのカメラ・写真選び */
        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            @Suppress("UNCHECKED_CAST")
            fileCallback = callback as ValueCallback<Array<Uri>?>
            return runCatching { pickFile.launch(params.createIntent()) }.fold(
                onSuccess = { true },
                onFailure = {
                    fileCallback = null
                    false
                },
            )
        }
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/assets/www/index.html"
        const val FALLBACK_URL = "file:///android_asset/www/index.html"
    }
}
