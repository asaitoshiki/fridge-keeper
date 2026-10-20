// ウェブ版（リポジトリ直下の index.html と src/）をそのまま包んで動かす Android アプリ。
// 画面と計算はすべてウェブ版と同じものを使い、ここでは端末の機能へのつなぎだけを持つ。
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
