/* ===========================================================================
   AI の接続口 — 差し込み口だけを用意し、通信そのものはまだ繋いでいない。
   =========================================================================== */

/**
 * このアプリは「端末内で完結し、データを外へ出さない」ことを前提に作ってある。
 * AI を有効にするとその前提が崩れるため、次のように切ってある。
 *
 * - 既定は無効。設定で明示的に有効にしない限り、通信は一切起きない
 * - 外へ送るのは、この下の buildPrompt が組み立てた文字列だけ。
 *   在庫の一覧や履歴をまるごと送る作りにはしていない
 * - 接続先・モデル・鍵はユーザーが自分で入れる。既定値は持たない
 * - エクスポートしたデータにこの設定は含めない（鍵が入ったファイルが出回らないように）
 *
 * 実装が残っているのは callModel の中身だけ。
 * ここに fetch を書けば、上の組み立てと読み取りはそのまま動く。
 */
const AiAssist = (function () {
  'use strict';

  const SETTINGS_KEY = 'fridgekeeper.ai.v1';

  function defaults() {
    return { enabled: false, endpoint: '', model: '', apiKey: '' };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
    } catch (e) {
      return defaults();
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* 保存できなくてもアプリは動く。次回起動時に無効へ戻るだけ */
    }
  }

  /** 接続先・モデル・鍵が揃っていて、かつ有効になっているか */
  function isReady() {
    const settings = loadSettings();
    return Boolean(settings.enabled && settings.endpoint && settings.model && settings.apiKey);
  }

  /* --- 用途ごとの組み立てと読み取り ---------------------------------------- */

  /**
   * 商品名からカテゴリを推す。
   * 最初の用途にこれを選んだのは、仕様書の最優先原則が「入力の手間を増やさない」
   * だから。レシピ提案などは v1.0 のスコープ外なのでここには置かない。
   */
  const GUESS_CATEGORY = {
    buildPrompt(name) {
      const options = Object.keys(CATEGORY_LABELS)
        .map((key) => `${key}=${CATEGORY_LABELS[key]}`)
        .join(', ');
      return [
        '次の食品名に最もよく当てはまる分類を1つ選び、その識別子だけを返してください。',
        `選択肢: ${options}`,
        `食品名: ${name}`,
      ].join('\n');
    },

    parse(text) {
      const found = Object.keys(CATEGORY_LABELS).find((key) => text.includes(key));
      return found || null;
    },
  };

  async function guessCategory(name) {
    const reply = await callModel(GUESS_CATEGORY.buildPrompt(name));
    return GUESS_CATEGORY.parse(reply);
  }

  /* --- 未実装の一点 -------------------------------------------------------- */

  /**
   * ここだけが空いている。
   * loadSettings() の endpoint・model・apiKey を使って応答本文の文字列を返すように
   * 書けば、guessCategory も、あとから足す用途もそのまま動く。
   *
   * 実際に繋ぐときは、失敗しても画面が止まらないよう呼び出し側で捕まえること。
   * 通信は必ず失敗しうるうえ、このアプリは AI 無しでも成立していなければならない。
   */
  async function callModel() {
    throw new Error('AI はまだ接続されていません');
  }

  return { loadSettings, saveSettings, isReady, guessCategory, defaults };
})();
