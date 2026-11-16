package com.recibo.almacen

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONObject
import java.io.File

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var camUri: Uri? = null
    private var sr: SpeechRecognizer? = null
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val authority = "com.recibo.almacen.fp"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO), 1)
        web = WebView(this)
        setContentView(web)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }

            override fun onShowFileChooser(
                w: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams
            ): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                val wantsImage = p.acceptTypes.any { it.contains("image") }
                val pick = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE)
                val chooser: Intent
                if (wantsImage) {
                    pick.type = "image/*"
                    val f = File.createTempFile("foto", ".jpg", cacheDir)
                    camUri = FileProvider.getUriForFile(this@MainActivity, authority, f)
                    val cam = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                        .putExtra(MediaStore.EXTRA_OUTPUT, camUri)
                        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    chooser = if (p.isCaptureEnabled) cam
                    else Intent.createChooser(pick, "Foto").putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cam))
                } else {
                    pick.type = "*/*"
                    camUri = null
                    chooser = Intent.createChooser(pick, "Archivo")
                }
                return try {
                    startActivityForResult(chooser, 7)
                    true
                } catch (e: Exception) {
                    fileCb = null
                    cb.onReceiveValue(null)
                    false
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 7) return
        val cb = fileCb ?: return
        fileCb = null
        var res: Array<Uri>? = null
        if (resultCode == RESULT_OK) {
            val d = data?.data
            res = if (d != null) arrayOf(d) else camUri?.let { arrayOf(it) }
        }
        cb.onReceiveValue(res)
    }

    private fun cb(id: Int, ok: Boolean, v: String) {
        val js = "window.__nativeCb($id,$ok,${JSONObject.quote(v)})"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    inner class Bridge {
        @JavascriptInterface
        fun ocr(id: Int, b64: String) {
            try {
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp == null) { cb(id, false, "No se pudo abrir la foto"); return }
                recognizer.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener { cb(id, true, it.text) }
                    .addOnFailureListener { cb(id, false, it.message ?: "Error al leer la foto") }
            } catch (e: Exception) {
                cb(id, false, e.message ?: "Error al leer la foto")
            }
        }

        @JavascriptInterface
        fun listen(id: Int) {
            runOnUiThread {
                if (!SpeechRecognizer.isRecognitionAvailable(this@MainActivity)) {
                    cb(id, false, "Este equipo no tiene dictado por voz. Activa la app Google.")
                    return@runOnUiThread
                }
                sr?.destroy()
                val r = SpeechRecognizer.createSpeechRecognizer(this@MainActivity)
                sr = r
                r.setRecognitionListener(object : RecognitionListener {
                    override fun onResults(b: Bundle?) {
                        val l = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        cb(id, true, l?.firstOrNull() ?: "")
                    }
                    override fun onError(e: Int) {
                        when (e) {
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> cb(id, true, "")
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                                cb(id, false, "Falta el permiso de micrófono: Ajustes de Android → Apps → Recibo → Permisos.")
                            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                                cb(id, false, "El dictado necesita internet.")
                            else -> cb(id, false, "No se pudo usar el micrófono (error $e).")
                        }
                    }
                    override fun onReadyForSpeech(p: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(v: Float) {}
                    override fun onBufferReceived(b: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onPartialResults(b: Bundle?) {}
                    override fun onEvent(t: Int, b: Bundle?) {}
                })
                val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-DO")
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                r.startListening(i)
            }
        }

        @JavascriptInterface
        fun stopListen() {
            runOnUiThread { sr?.stopListening() }
        }

        @JavascriptInterface
        fun saveFile(id: Int, name: String, b64: String, mime: String) {
            Thread {
                try {
                    val bytes = Base64.decode(b64, Base64.DEFAULT)
                    val uri: Uri
                    if (Build.VERSION.SDK_INT >= 29) {
                        val cv = ContentValues().apply {
                            put(MediaStore.Downloads.DISPLAY_NAME, name)
                            put(MediaStore.Downloads.MIME_TYPE, mime)
                            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        }
                        uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)!!
                        contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
                    } else {
                        val f = File(cacheDir, name)
                        f.writeBytes(bytes)
                        uri = FileProvider.getUriForFile(this@MainActivity, authority, f)
                    }
                    cb(id, true, "ok")
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "Guardado: $name (Descargas)", Toast.LENGTH_LONG).show()
                        try {
                            startActivity(
                                Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            )
                        } catch (e: Exception) { }
                    }
                } catch (e: Exception) {
                    cb(id, false, e.message ?: "No se pudo guardar")
                }
            }.start()
        }

        @JavascriptInterface
        fun print() {
            runOnUiThread {
                val pm = getSystemService(PRINT_SERVICE) as PrintManager
                pm.print(
                    "Etiquetas", web.createPrintDocumentAdapter("Etiquetas"),
                    PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.NA_LETTER).build()
                )
            }
        }
    }
}
