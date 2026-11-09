package com.asaitoshiki.fridgemap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
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
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject

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
 * 外のサイトへ画面が移ることはない。外とやりとりするのは、同意をもらったときの天気予報の取得だけ。
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
    /* 通知の許可は、開いている間に一度だけ聞く。断られたのに何度も聞かない */
    private var askedNotify = false

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

    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

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
        container.setBackgroundColor(if (dark) Color.parseColor("#14122A") else Color.parseColor("#F4F3FF"))
        WindowInsetsControllerCompat(window, container).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    /**
     * Google のコードスキャナーで読む。専用の画面を端末が出すので、このアプリはカメラの権限を使わない。
     * 食品の JAN（EAN-13 / EAN-8 / UPC）だけに絞り、遠いときは自動で寄ってもらう。
     */
    private fun startCodeScan() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
            .enableAutoZoom()
            .build()
        runCatching {
            GmsBarcodeScanning.getClient(this, options).startScan()
                .addOnSuccessListener { barcode -> sendBarcode(barcode.rawValue, "OK") }
                .addOnCanceledListener { sendBarcode(null, "CANCELED") }
                .addOnFailureListener { sendBarcode(null, "FAILED") }
        }.onFailure { sendBarcode(null, "FAILED") }
    }

    private fun sendBarcode(value: String?, status: String) {
        val text = if (value == null) "null" else JSONObject.quote(value)
        webView.evaluateJavascript("window.fridgeBarcodeResult && window.fridgeBarcodeResult($text, '$status')", null)
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

        /**
         * バーコードを端末の読み取りで読む。結果は window.fridgeBarcodeResult(値, 状態) で返す。
         * 状態は OK / CANCELED（やめた）/ FAILED（使えなかった。ウェブ版の読み取りに戻る）。
         */
        @JavascriptInterface
        fun scanBarcode() {
            runOnUiThread { startCodeScan() }
        }

        /**
         * これから知らせるものの並び（JSON の [{at, title, body}]）を受け取り、目覚ましを掛ける。
         * 知らせるものがあるのに許可が無ければ、ここで初めて許可を聞く。
         */
        @JavascriptInterface
        fun setNotices(json: String) {
            Notices.save(this@MainActivity, json)
            if (json == "[]" || askedNotify || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
            if (hasPermission(Manifest.permission.POST_NOTIFICATIONS)) return
            askedNotify = true
            runOnUiThread { askNotify.launch(Manifest.permission.POST_NOTIFICATIONS) }
        }

        /** 通知を出せる状態か。端末の設定で止められていると、設定の画面でそう伝える */
        @JavascriptInterface
        fun notifyAllowed(): Boolean = Notices.allowed(this@MainActivity)

        /** このアプリの通知の設定を開く。一度断ると、許可はそこからしか出せない */
        @JavascriptInterface
        fun openNotifySettings() {
            runOnUiThread {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                } else {
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                }
                runCatching { startActivity(intent) }
            }
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
