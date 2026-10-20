plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.asaitoshiki.fridgemap"
    compileSdk = 35

    defaultConfig {
        // Kotlin 版（com.asaitoshiki.fridgekeeper）とは別のアプリとして入る
        applicationId = "com.asaitoshiki.fridgemap"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.8.0"
    }

    /**
     * 署名の鍵はリポジトリに置いた固定のものを使う。
     * ビルドのたびに鍵が変わると上書きで入れ直せず、いったん消すことになる。
     * このアプリのデータは端末の中にしか無いので、消すと冷蔵庫の中身も消えてしまう。
     */
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
        }
    }
}

/**
 * ウェブ版のファイルを、ビルドのたびに assets/www へ写す。
 * 中身を二重に持たないので、ウェブ版を直せば次のビルドでそのまま入る。
 */
val copyWeb by tasks.registering(Sync::class) {
    from(rootProject.file("..")) {
        include("index.html", "app.css", "manifest.webmanifest", "src/**", "icons/**")
    }
    into(layout.buildDirectory.dir("generated/webassets/www"))
}

tasks.named("preBuild") {
    dependsOn(copyWeb)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
