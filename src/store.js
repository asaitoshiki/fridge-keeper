/* ===========================================================================
   永続化層 — 端末内の localStorage だけを使う。
   サーバーへの送信は一切行わない（仕様書2章の制約）。
   =========================================================================== */

const STORAGE_KEY = 'fridgekeeper.state.v1';

function emptyState() {
  return { version: 1, items: [], sampleLoaded: false };
}

/**
 * 保存された状態を読む。
 * プライベートウィンドウやサイトデータ遮断では localStorage が例外を投げるため、
 * 読めなかった場合も空の状態でアプリが成立するようにしておく。
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return withSample(emptyState());
    const parsed = JSON.parse(raw);
    return { ...emptyState(), ...parsed };
  } catch (e) {
    return withSample(emptyState());
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* 保存できなくても画面は動かす。次回起動時に消えるだけで操作は妨げない */
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* --- 初回のサンプルデータ ------------------------------------------------ */

/**
 * 初回起動で空のリストを見せても何のアプリか伝わらないため、
 * 緊急度が一通り揃うサンプルを入れておく。ヘッダーからまとめて削除できる。
 * 期限は「今日」からの相対で作るので、いつ開いても同じ見え方になる。
 */
function withSample(state) {
  const today = todayIso();
  const sample = [
    { name: '豚こま切れ肉', category: 'MEAT_FISH', storageLocation: 'FRIDGE', expiryType: 'USE_BY', offset: 0, quantity: 1, memo: '半額だったもの' },
    { name: 'にんじん', category: 'VEGETABLE', storageLocation: 'VEGETABLE_DRAWER', expiryType: 'UNKNOWN', registeredOffset: -9, quantity: 3, memo: null },
    { name: '絹ごし豆腐', category: 'PROCESSED', storageLocation: 'FRIDGE', expiryType: 'USE_BY', offset: 1, quantity: 2, memo: null },
    { name: '牛乳', category: 'DAIRY', storageLocation: 'FRIDGE', expiryType: 'BEST_BEFORE', offset: 2, quantity: 1, memo: null },
    { name: 'キャベツ', category: 'VEGETABLE', storageLocation: 'VEGETABLE_DRAWER', expiryType: 'UNKNOWN', registeredOffset: -3, quantity: 1, memo: '半玉' },
    { name: '卵', category: 'EGG', storageLocation: 'FRIDGE', expiryType: 'BEST_BEFORE', offset: 6, quantity: 8, memo: null },
    { name: '冷凍うどん', category: 'FROZEN', storageLocation: 'FREEZER', expiryType: 'BEST_BEFORE', registeredOffset: -10, quantity: 4, memo: null },
    { name: 'しょうゆ', category: 'SEASONING', storageLocation: 'ROOM_TEMP', expiryType: 'BEST_BEFORE', offset: 210, quantity: 1, memo: null },
  ];

  state.items = sample.map((s) => ({
    id: newId(),
    name: s.name,
    category: s.category,
    storageLocation: s.storageLocation,
    expiryType: s.expiryType,
    expiryDate: s.offset === undefined ? null : addDays(today, s.offset),
    quantity: s.quantity,
    registeredAt: s.registeredOffset === undefined ? today : addDays(today, s.registeredOffset),
    janCode: null,
    memo: s.memo,
    sample: true,
  }));
  state.sampleLoaded = true;
  return state;
}
