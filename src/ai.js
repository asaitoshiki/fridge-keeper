/* ===========================================================================
   AI の接続口 — Anthropic の Claude API を、ブラウザから直接呼ぶ。

   このアプリは「端末内で完結し、データを外へ出さない」ことを前提に作ってある。
   AI はその例外なので、次のように切ってある。

   - 既定は無効。設定で有効にし、自分の APIキーを入れない限り、通信は一切起きない
   - 外へ送るのは、用途ごとに組み立てた文字列だけ（食品名、レシートから読めた文字）。
     在庫の一覧や履歴をまるごと送る作りにはしていない
   - APIキーはこの端末の中だけに置く。控えの書き出しには含めない（鍵入りのファイルが出回らないように）
   - 使った分をこの端末で数え、ひと月の上限（円）を超えたら呼ばない
   - AI が無くても、どの機能も今までどおり動く。失敗したら黙って AI 無しの結果を使う

   SDK を使わず fetch で呼んでいるのは、このアプリがビルドも依存パッケージも持たない作りだから
   （公式の SDK はまとめる工程なしにはブラウザで読み込めない）。
   =========================================================================== */

const AiAssist = (function () {
  'use strict';

  const SETTINGS_KEY = 'fridgekeeper.ai.v1';
  const USAGE_KEY = 'fridgekeeper.ai.usage.v1';
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2026-10-21';

  /* 選べるモデルと、100万トークンあたりの料金（ドル）。円は概算 */
  const MODELS = {
    'claude-haiku-5-5': { label: 'Claude Haiku 5.5（安い・おすすめ）', input: 0.10, output: 0.50 },
    'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5（かしこい・約20倍の料金）', input: 2.00, output: 10.00 },
  };
  const YEN_PER_DOLLAR = 155;

  function defaults() {
    return { enabled: false, apiKey: '', model: 'claude-haiku-5-5', monthlyLimitYen: 1000 };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const settings = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
      if (!MODELS[settings.model]) settings.model = defaults().model;
      return settings;
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

  /** 有効になっていて、鍵が入っているか */
  function isReady() {
    const settings = loadSettings();
    return Boolean(settings.enabled && settings.apiKey);
  }

  /* --- 使った分 ------------------------------------------------------------ */

  function thisMonth() {
    return todayIso().slice(0, 7);
  }

  /** 今月使った分。月が変わったら0から数え直す */
  function loadUsage() {
    try {
      const usage = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (usage && usage.month === thisMonth()) return usage;
    } catch (e) { /* 読めなければ0から */ }
    return { month: thisMonth(), calls: 0, yen: 0 };
  }

  function addUsage(model, usage) {
    const price = MODELS[model];
    const yen = ((usage.input_tokens || 0) * price.input + (usage.output_tokens || 0) * price.output) / 1e6 * YEN_PER_DOLLAR;
    const total = loadUsage();
    total.calls += 1;
    total.yen += yen;
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(total)); } catch (e) { /* 数えられなくても動く */ }
  }

  /* --- 呼び出し ------------------------------------------------------------ */

  /** 画面に出せる言葉にした失敗。message をそのまま知らせに使う */
  class AiError extends Error {}

  /**
   * Claude に一回だけ聞く。schema を渡すと、その形の JSON で返してもらい、読んだものを返す。
   * 考える量（effort）は low にする。入力補助は短い仕事で、考える分も料金に入るため。
   */
  async function callModel(prompt, schema, maxTokens) {
    const settings = loadSettings();
    if (!settings.enabled || !settings.apiKey) throw new AiError('AI が有効になっていません');
    if (loadUsage().yen >= settings.monthlyLimitYen) {
      throw new AiError(`今月の上限（${settings.monthlyLimitYen}円）に達したので、AI を止めています`);
    }

    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': API_VERSION,
          /* ブラウザから直接呼ぶための印。鍵はこの端末の持ち主のもので、ほかの人には配らない */
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: maxTokens || 2048,
          output_config: schema ? { effort: 'low', format: { type: 'json_schema', schema } } : { effort: 'low' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (e) {
      throw new AiError('AI につながりませんでした。電波のある所でもう一度試してください');
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body && body.error ? String(body.error.message || '') : '';
      if (res.status === 401) throw new AiError('APIキーが違うようです。設定を確かめてください');
      if (res.status === 429) throw new AiError('AI が混み合っています。少し待ってから試してください');
      if (/credit/i.test(detail)) throw new AiError('API のクレジットが足りません。Claude Console で残高を確かめてください');
      throw new AiError(`AI でエラーが起きました（${res.status}）`);
    }
    if (body.usage) addUsage(settings.model, body.usage);
    if (body.stop_reason === 'refusal') throw new AiError('AI が答えませんでした');
    if (body.stop_reason === 'max_tokens') throw new AiError('AI の答えが長すぎて途中で切れました');

    const text = body.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    if (!schema) return text;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new AiError('AI の答えを読めませんでした');
    }
  }

  /* --- 用途 ---------------------------------------------------------------- */

  /**
   * 商品名から分類を推す。見本帳に無い名前（「国産若鶏のから揚げ」など）のときだけ呼ぶ。
   * 期限の日数は AI に決めさせない。食品の安全に関わるので、表の値と目安の決まりで出す。
   */
  async function guessCategory(name) {
    const keys = Object.keys(CATEGORY_LABELS);
    const reply = await callModel(
      [
        '次の食品名に最もよく当てはまる分類を1つ選んでください。',
        `分類: ${keys.map((key) => `${key}=${CATEGORY_LABELS[key]}`).join(', ')}`,
        `食品名: ${name}`,
      ].join('\n'),
      {
        type: 'object',
        properties: { category: { type: 'string', enum: keys } },
        required: ['category'],
        additionalProperties: false,
      },
      1024,
    );
    return keys.includes(reply.category) ? reply.category : null;
  }

  /**
   * レシートから読めた文字の行から、買った食べ物と飲み物を拾う。
   * 半角カナや略した書き方（「ｺｸｻﾝﾜｶﾄﾞﾘﾓﾓ」など）を、ふつうの名前に直してもらう。
   * 送るのはレシートの文字だけ。店の名前や電話番号の行も入るが、食材のことは聞くだけで残さない。
   */
  async function readReceipt(rows) {
    const reply = await callModel(
      [
        '次はスーパーのレシートを文字認識で読んだ行です。読み違いが混ざっています。',
        '買った食べ物と飲み物だけを拾い、家庭でふつうに呼ぶ短い日本語の名前に直してください。',
        '例: 「ｺｸｻﾝﾌﾞﾀﾊﾞﾗｳｽｷﾞﾘ」→「豚バラ肉」、「ﾒｲｼﾞｵｲｼｲｷﾞｭｳﾆｭｳ」→「牛乳」。',
        '洗剤・袋・日用品・割引・合計・税・ポイントなど、食べ物でない行は入れないでください。',
        '同じものが何行かあれば一つにまとめ、数を足してください。数が分からなければ1にしてください。',
        '',
        rows.join('\n'),
      ].join('\n'),
      {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, quantity: { type: 'integer' } },
              required: ['name', 'quantity'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      },
      4096,
    );
    return (Array.isArray(reply.items) ? reply.items : [])
      .filter((item) => item && typeof item.name === 'string' && item.name.trim())
      .slice(0, 60)
      .map((item) => ({
        name: item.name.trim().slice(0, 30),
        quantity: Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 30 ? item.quantity : 1,
      }));
  }

  return { loadSettings, saveSettings, isReady, loadUsage, guessCategory, readReceipt, defaults, MODELS, AiError };
})();
