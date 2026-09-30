/* ===========================================================================
   ドメイン層 — 期限計算のロジック。UI と永続化から独立させ、
   Android(Kotlin) へ移植するときはこのファイルがそのまま対応物になる。
   =========================================================================== */

/* --- 列挙 ------------------------------------------------------------- */

const CATEGORY_LABELS = {
  VEGETABLE: '野菜',
  FRUIT: '果物',
  MEAT_FISH: '肉・魚',
  DAIRY: '乳製品',
  EGG: '卵',
  PROCESSED: '加工食品',
  FROZEN: '冷凍食品',
  SEASONING: '調味料',
  DRINK: '飲料',
  OTHER: 'その他',
};

/**
 * 収納の「種類」。ユーザーが引き出しを何個作っても、期限の目安はこの4種類で引く。
 * 見た目（段の数・名前・大きさ）と、日持ちに効く事実とを分けておくための区別。
 */
const STORAGE_LABELS = {
  FRIDGE: '冷蔵',
  FREEZER: '冷凍',
  VEGETABLE_DRAWER: '野菜室',
  ROOM_TEMP: '常温',
};

/* 消費期限は過ぎたら食べてはいけない。賞味期限と混同させないため必ず種別を持たせる */
const EXPIRY_TYPE_LABELS = {
  BEST_BEFORE: '賞味期限',
  USE_BY: '消費期限',
  UNKNOWN: '期限の種別不明',
};

/* --- プリセット期限テーブル -------------------------------------------- */

/**
 * 期限が印字されていない食材の日持ちの目安。カテゴリ × 収納の種類で日数を引く。
 * ここで返す日数は一般的な参考値であり、実際の安全性を保証するものではない。
 * この値から導いた期限を表示する箇所には必ず「目安」バッジを付けること。
 */
const PRESET_DAYS = {
  VEGETABLE: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 5 },
  FRUIT: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 5 },
  MEAT_FISH: { FRIDGE: 2, FREEZER: 30 },
  DAIRY: { FRIDGE: 7, FREEZER: 14 },
  EGG: { FRIDGE: 14, ROOM_TEMP: 7 },
  PROCESSED: { FRIDGE: 7, FREEZER: 30, ROOM_TEMP: 30 },
  FROZEN: { FREEZER: 90 },
  SEASONING: { FRIDGE: 90, ROOM_TEMP: 90 },
  DRINK: { FRIDGE: 7, ROOM_TEMP: 30 },
  OTHER: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 7 },
};

/**
 * 日持ちの目安日数。未定義の組み合わせ（肉・魚を野菜室に置く等）と、
 * まだどこにも入れていない食材（kind が null）では null を返し、期限なし扱いにする。
 * この null は異常ではなく「目安を出せない」正常な状態。
 */
function presetDaysFor(category, storageKind) {
  if (storageKind === null) return null;
  const days = PRESET_DAYS[category][storageKind];
  return days === undefined ? null : days;
}

/* --- 日付ユーティリティ ------------------------------------------------ */
/* 日付は 'YYYY-MM-DD' 文字列で扱う。辞書順と日付順が一致し保存もそのまま行えるため */

function todayIso() {
  return toIso(new Date());
}

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

/* UTC に正規化してから引く。夏時間のある地域でも日数がずれないようにするため */
function diffDays(fromIso, toIsoStr) {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIsoStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function formatDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/* --- 実効期限 ---------------------------------------------------------- */

/**
 * 実効期限 = 入力された期限、なければ 登録日 + プリセット日数。
 * 推定値は保存せず参照のたびにここで導出する。収納を移せば目安も変わる。
 * 戻り値 date が null なら期限なし扱い（アラート対象外）。
 */
function effectiveExpiry(item, storageKind) {
  if (item.expiryDate) {
    return { date: item.expiryDate, estimated: false };
  }
  const days = presetDaysFor(item.category, storageKind);
  if (days === null) {
    return { date: null, estimated: true };
  }
  return { date: addDays(item.registeredAt, days), estimated: true };
}

/* --- 緊急度 ------------------------------------------------------------ */

/**
 * 残り日数から緊急度を決める。
 * 期限切れ / 当日〜1日前 / 2〜3日前 / 4〜7日前 / それ以降 / 期限なし。
 */
function urgencyOf(item, storageKind, today) {
  const { date, estimated } = effectiveExpiry(item, storageKind);
  if (date === null) {
    return { level: 'NONE', days: null, date: null, estimated };
  }
  const days = diffDays(today, date);
  return { level: levelForDays(days), days, date, estimated };
}

function levelForDays(days) {
  if (days < 0) return 'EXPIRED';
  if (days <= 1) return 'CRITICAL';
  if (days <= 3) return 'WARN';
  if (days <= 7) return 'CAUTION';
  return 'NORMAL';
}

/**
 * 残り日数の文言。
 * 「まだ食べられます」のように安全を断定する表現は使わない（安全上の理由）。
 */
function remainingLabel(days) {
  if (days === null) return '期限なし';
  if (days < 0) return `${-days}日超過`;
  if (days === 0) return '今日まで';
  return `あと${days}日`;
}

/** 図の中の小さなチップに収まる短い表記。負の数が過ぎた日数を表す */
function shortRemainingLabel(days) {
  if (days === null) return '—';
  if (days < 0) return `-${-days}日`;
  if (days === 0) return '今日';
  return `${days}日`;
}

/* --- 名前からの推定 ------------------------------------------------------ */

/**
 * 商品名によく出る語からカテゴリを推す。
 * ここを AI に任せる必要はない。入力の手間を減らすのが目的で、
 * 外れてもユーザーがその場で直せるし、外部へ何も送らずに済む。
 */
const CATEGORY_HINTS = [
  { category: 'DAIRY', keys: ['牛乳', 'ヨーグルト', 'チーズ', 'バター', '生クリーム', 'ミルク'] },
  { category: 'EGG', keys: ['卵', 'たまご', 'タマゴ'] },
  { category: 'MEAT_FISH', keys: ['肉', '鶏', '豚', '牛', 'ひき', '魚', 'さけ', '鮭', 'まぐろ', 'さば', 'えび', 'いか', 'ベーコン', 'ハム', 'ソーセージ'] },
  { category: 'VEGETABLE', keys: ['にんじん', '人参', 'キャベツ', 'レタス', '玉ねぎ', 'たまねぎ', 'じゃがいも', 'トマト', 'きゅうり', 'なす', 'ピーマン', 'ねぎ', 'ほうれん草', 'もやし', 'だいこん', '大根', 'ブロッコリー', 'きのこ', 'しめじ', 'えのき'] },
  { category: 'FRUIT', keys: ['りんご', 'みかん', 'バナナ', 'いちご', 'ぶどう', 'もも', 'なし', 'キウイ', 'レモン'] },
  { category: 'FROZEN', keys: ['冷凍'] },
  { category: 'SEASONING', keys: ['しょうゆ', '醤油', 'みそ', '味噌', '塩', '砂糖', '酢', 'ソース', 'ケチャップ', 'マヨ', '油', 'みりん', 'だし'] },
  { category: 'DRINK', keys: ['ジュース', 'お茶', '水', 'コーヒー', 'ビール', '炭酸', 'サイダー'] },
  { category: 'PROCESSED', keys: ['豆腐', '納豆', 'パン', '麺', 'うどん', 'そば', 'パスタ', 'かまぼこ', 'ちくわ', '缶詰', 'ヨーグル'] },
];

function guessCategoryByName(name) {
  const hit = CATEGORY_HINTS.find((entry) => entry.keys.some((key) => name.includes(key)));
  return hit ? hit.category : 'OTHER';
}

/* --- 消費と廃棄 --------------------------------------------------------- */

const CONSUMPTION_LABELS = { EATEN: '食べた', DISCARDED: '捨てた' };

/**
 * 食品ロスなし継続日数。
 * 最後に「捨てた」を記録した日から今日まで。一度も捨てていなければ利用開始日から。
 * 捨てた記録が入るとここが0に戻る。このアプリの世界観の中心にある数字。
 */
function streakDays(logs, startedAt, today) {
  const discarded = logs.filter((log) => log.type === 'DISCARDED').map((log) => log.date).sort();
  const from = discarded.length > 0 ? discarded[discarded.length - 1] : startedAt;
  return Math.max(0, diffDays(from, today));
}

/* --- 並べ替え ---------------------------------------------------------- */

/**
 * 期限が近い順。期限なしは末尾へ回す。これがアプリの心臓部。
 * kindFor は食材から収納の種類を引く関数（収納はユーザーが編集するので外から渡す）。
 */
function sortByExpiry(items, kindFor, today) {
  return [...items].sort((a, b) => {
    const ua = urgencyOf(a, kindFor(a), today);
    const ub = urgencyOf(b, kindFor(b), today);
    if (ua.date === null && ub.date === null) return a.name.localeCompare(b.name, 'ja');
    if (ua.date === null) return 1;
    if (ub.date === null) return -1;
    if (ua.date !== ub.date) return ua.date < ub.date ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}
