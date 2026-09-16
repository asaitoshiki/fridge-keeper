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
 * 期限が印字されていない食材の日持ちの目安。カテゴリ × 保管場所で日数を引く。
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
 * 日持ちの目安日数。未定義の組み合わせ（肉・魚を野菜室に置く等）では null を返し、
 * 呼び出し側は期限なし扱いにする。この null は異常ではなく「目安を出せない」正常な状態。
 */
function presetDaysFor(category, storageLocation) {
  const days = PRESET_DAYS[category][storageLocation];
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
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function formatDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/* --- 実効期限 ---------------------------------------------------------- */

/**
 * 実効期限 = 入力された期限、なければ 登録日 + プリセット日数。
 * 推定値は保存せず参照のたびにここで導出する。
 * 戻り値 date が null なら期限なし扱い（アラート対象外）。
 */
function effectiveExpiry(item) {
  if (item.expiryDate) {
    return { date: item.expiryDate, estimated: false };
  }
  const days = presetDaysFor(item.category, item.storageLocation);
  if (days === null) {
    return { date: null, estimated: true };
  }
  return { date: addDays(item.registeredAt, days), estimated: true };
}

/* --- 緊急度 ------------------------------------------------------------ */

const URGENCY_ORDER = ['EXPIRED', 'CRITICAL', 'WARN', 'CAUTION', 'NORMAL', 'NONE'];

/**
 * 残り日数から緊急度を決める。
 * 期限切れ / 当日〜1日前 / 2〜3日前 / 4〜7日前 / それ以降 / 期限なし。
 */
function urgencyOf(item, today) {
  const { date, estimated } = effectiveExpiry(item);
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

/* --- 並べ替え ---------------------------------------------------------- */

/** 期限が近い順。期限なしは末尾へ回す。これがアプリの心臓部 */
function sortByExpiry(items, today) {
  return [...items].sort((a, b) => {
    const ua = urgencyOf(a, today);
    const ub = urgencyOf(b, today);
    if (ua.date === null && ub.date === null) return a.name.localeCompare(b.name, 'ja');
    if (ua.date === null) return 1;
    if (ub.date === null) return -1;
    if (ua.date !== ub.date) return ua.date < ub.date ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}
