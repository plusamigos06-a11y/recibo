plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.recibo.almacen"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.recibo.almacen"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    signingConfigs {
        getByName("debug") {
            storeFile = file("recibo.keystore")
            storePassword = "recibo123"
            keyAlias = "recibo"
            keyPassword = "recibo123"
        }
    }
}
dependencies {
    implementation("com.google.mlkit:text-recognition:16.0.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core-ktx:1.13.1")
}
