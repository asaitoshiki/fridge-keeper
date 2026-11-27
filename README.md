# 冷蔵庫の地図

食品ロスを減らすアプリ。賞味期限・消費期限を管理し、**腐らせる前に気づかせる**ことを目的とする。
「在庫を管理する」アプリではなく「食材を腐らせない・捨てない」アプリ。入力の手間を増やさないことを何より大事にしている。

データは端末の中（ブラウザの localStorage）だけに保存し、サーバーは持たない。
外と通信するのは次の三つだけで、どれも食材や記録は送らない（理由は [`DECISIONS.md`](DECISIONS.md)）。

- 天気予報の気温（Open-Meteo）… 同意した人だけ。約10kmに丸めた位置だけを送る
- 開発者からのお知らせ（GitHub の `announcements.json` を読むだけ）… 設定で止められる
- AI での入力補助（Anthropic の Claude API）… 既定は無効。自分の APIキーを入れた人だけ

## 管理ファイル（複数の AI で開発するための共通の置き場所）

| ファイル | 中身 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | すべての AI と人に共通の開発ルール・コーディング規約・試験の回し方・プロジェクト固有の決まり |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code 向けの入口（AGENTS.md を読むよう案内するだけ） |
| [`PROGRESS.md`](PROGRESS.md) | 現在の開発状況・実装済み・未実装・既知の問題 |
| [`TODO.md`](TODO.md) | これからの作業と優先順位 |
| [`DECISIONS.md`](DECISIONS.md) | 設計上の決定・理由・採用しなかった案 |
| [`docs/fridge-app-spec.md`](docs/fridge-app-spec.md) | 最初の仕様書（v1.0 の依頼書） |

## 利用技術

| 部分 | 技術 |
|---|---|
| 本体（Web） | 素の HTML / CSS / JavaScript。ビルド工程なし・依存パッケージなし・ES モジュールなし（`file://` でそのまま開ける） |
| 保存 | ブラウザの localStorage（`fridgekeeper.state.v2` ほか） |
| バーコード（ブラウザ） | BarcodeDetector、無い環境では同梱の ZXing（`src/vendor/`） |
| Android アプリ | Kotlin。Web 版をそのまま WebView で動かす（`android-web/`）。Gradle・Android SDK 35・minSdk 24 |
| Android の端末機能 | 通知（AlarmManager）、Google のコードスキャナー（バーコード）、Google の書類スキャナー＋ML Kit 日本語文字認識（レシート） |
| ビルド・配布 | GitHub Actions の「Android (web)」を手動で回すと、リリース `apk-latest` に APK が置かれる |
| 試験 | Playwright（`tests/` の中だけで使う） |
| AI（任意） | Anthropic Claude API（既定は Claude Haiku 5.5）。ブラウザから fetch で直接呼ぶ |

`android/` には以前の Kotlin（Jetpack Compose）での作り直しがあるが、いまは更新を止めている（別のアプリとして入る）。

## 環境構築と実行

### Web 版を動かす

ビルドも依存パッケージのインストールも要らない。

```sh
# そのままブラウザで開く
open index.html            # Windows は start index.html、Linux は xdg-open index.html

# または簡易サーバー経由で（http://localhost:8000）
python3 -m http.server 8000
```

### 試験を回す

Node.js（18 以上）が要る。詳しくは [`AGENTS.md`](AGENTS.md) の「試験」。

```sh
cd tests
npm install
npx playwright install chromium
node run-all.mjs
```

### Android のアプリ（APK）を作る

手元に Android Studio が無くても作れる。

1. GitHub の [Actions](../../actions/workflows/android-web.yml) で「Android (web)」を開き、「Run workflow」を押す
2. 終わると、リリース `apk-latest` に `fridge-map.apk` が置かれる
   （ <https://github.com/asaitoshiki/fridge-keeper/releases/download/apk-latest/fridge-map.apk> ）
3. スマホで開いて入れる。「提供元不明のアプリ」の許可を求められたら許可する

署名の鍵は固定してあるので、新しい APK を上から入れてもデータは残る。

手元でビルドするなら（Android SDK と JDK 17 が要る）:

```sh
cd android-web
./gradlew assembleDebug    # app/build/outputs/apk/debug/ に APK ができる
```

### 開発者からのお知らせを送る

`announcements.json` に書いて main に入れる（Pull Request をマージする）と、使っている人に届く。書き方は [`AGENTS.md`](AGENTS.md) の「開発者からのお知らせ」。

## ファイル構成

```
index.html            画面の入口（スクリプトの読み込み順もここで決まる）
artifact.html         Artifact で公開するための同じ内容の入れ物
app.css               配色と組版（末尾の「やわらかい見た目」がいまの見た目）
manifest.webmanifest  ホーム画面に置くための情報
announcements.json    開発者からのお知らせ
icons/                アイコン
src/
  crash.js            予期しないエラーを画面に出す（いちばん先に読む）
  domain.js           期限・目安の計算、温度、カテゴリ。DOM と保存に触れない（Kotlin へ移すときの対応物）
  foods.js            よく使う食品の見本帳（約220品）
  receipt.js          レシートの文字から食材の候補を拾う（DOM に触れない）
  shelflife.js        食品ごとの日持ちの表
  scan.js             バーコードと期限の印字の読み取り
  ai.js               AI での入力補助（Claude API）
  store.js            保存・読み込み・古いデータの読み替え・冷蔵庫の形
  fridge.js           冷蔵庫の図、ドラッグで入れる、形の編集
  ui.js               画面全体（一覧・シート・お知らせ・設定など）
  vendor/             同梱のライブラリ（ZXing）
android-web/          Web 版を包んだ Android アプリ（いま配っているもの）
android/              以前の Kotlin 版（更新を止めている）
tests/                試験（Playwright）
docs/                 仕様書
.github/workflows/    APK を作る GitHub Actions（どちらも手動で回す）
```

## 操作のめやす

| 操作 | 結果 |
|---|---|
| 期限順の一覧で右へ引く | 食べた（1つ減らす） |
| 左へ引く | 食べきった（在庫から消す） |
| 左へ引き切る | 捨てた（食品ロスなしの日数が0に戻る） |
| 冷蔵庫の図で食材を押す | 食材のシート（食べた・捨てた・期限・状態・編集） |

どの操作も直後に取り消せ、あとからでも「レポート → 履歴」で取り消せる。

## 免責

本アプリが表示する期限および目安日数は一般的な参考情報であり、食品の実際の安全性を保証するものではありません。
実際の日持ちは、購入時の鮮度・開封の有無・保管温度等により大きく変動します。
喫食の可否は、必ずご自身で食品の状態（見た目・におい等）を確認してご判断ください。
本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を負いません。
