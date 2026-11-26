package com.recibo.imprimir

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var loaded = false
    private class Shared(val uri: Uri, val name: String, val mime: String)
    private val shared = ArrayList<Shared>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val path = request.url.path ?: ""
                if (path.startsWith("/shared/")) {
                    val i = path.removePrefix("/shared/").toIntOrNull()
                    val f = synchronized(shared) { if (i != null && i in shared.indices) shared[i] else null }
                    if (f != null) {
                        return try {
                            val ins = contentResolver.openInputStream(f.uri)
                            WebResourceResponse(f.mime, null, 200, "OK", mapOf("Cache-Control" to "no-store"), ins)
                        } catch (e: Exception) {
                            WebResourceResponse("text/plain", "utf-8", 404, "Not found", mapOf(), null)
                        }
                    }
                    return WebResourceResponse("text/plain", "utf-8", 404, "Not found", mapOf(), null)
                }
                return loader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                loaded = true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                w: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams
            ): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                return try {
                    startActivityForResult(p.createIntent(), 7)
                    true
                } catch (e: Exception) {
                    fileCb = null
                    cb.onReceiveValue(null)
                    false
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        takeIntent(intent)
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        takeIntent(intent)
        if (loaded) web.evaluateJavascript("window.__shared&&window.__shared()", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 7) return
        val cb = fileCb ?: return
        fileCb = null
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    }

    private fun nameOf(u: Uri): String {
        try {
            contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) return it.getString(0) ?: "documento"
            }
        } catch (e: Exception) { }
        return u.lastPathSegment ?: "documento"
    }

    @Suppress("DEPRECATION")
    private fun takeIntent(i: Intent?) {
        if (i == null) return
        val uris = ArrayList<Uri>()
        when (i.action) {
            Intent.ACTION_SEND -> (i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
            Intent.ACTION_VIEW -> i.data?.let { uris.add(it) }
        }
        if (uris.isEmpty()) return
        synchronized(shared) {
            shared.clear()
            for (u in uris) {
                var m = contentResolver.getType(u) ?: i.type ?: "application/octet-stream"
                val n = nameOf(u)
                if (m == "application/octet-stream" && n.endsWith(".pdf", true)) m = "application/pdf"
                shared.add(Shared(u, n, m))
            }
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun shared(): String {
            val a = JSONArray()
            synchronized(shared) {
                shared.forEachIndexed { idx, f ->
                    a.put(JSONObject().put("i", idx).put("name", f.name).put("mime", f.mime))
                }
            }
            return a.toString()
        }

        @JavascriptInterface
        fun clearShared() {
            // se conservan las URIs hasta el siguiente envío; solo se avisa que ya se tomaron
        }
    }
}
