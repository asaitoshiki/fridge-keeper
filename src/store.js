/* ===========================================================================
   永続化層 — 端末内の localStorage だけを使う。
   サーバーへの送信は一切行わない（仕様書2章の制約）。
   =========================================================================== */

const STORAGE_KEY = 'fridgekeeper.state.v2';
const LEGACY_KEY = 'fridgekeeper.state.v1';

/**
 * 収納は「筐体（冷蔵庫・棚）」と、その中の「段・引き出し」の2階層で持つ。
 * 段の名前・形・幅・大きさ・数はユーザーが自由に変えられるが、期限の目安に効くのは kind だけ。
 * 見た目の自由度と、日持ちの計算とを切り離しておくための構造。
 *
 * form  段の見た目。SHELF=棚 / DRAWER=引き出し / POCKET=ドアポケット
 * span  2=全幅 / 1=半分（隣の半幅の段と横に並ぶ。製氷室と小さな冷凍室のような並び）
 *
 * 初期値は日本の家庭用冷蔵庫によくある構成に寄せてある。
 */
function defaultLayout() {
  return [
    {
      id: 'unit-fridge',
      name: '冷蔵庫',
      type: 'FRIDGE',
      compartments: [
        { id: 'c-door', name: 'ドアポケット', kind: 'FRIDGE', form: 'POCKET', span: 2, size: 1 },
        { id: 'c-upper', name: '上段', kind: 'FRIDGE', form: 'SHELF', span: 2, size: 2 },
        { id: 'c-middle', name: '中段', kind: 'FRIDGE', form: 'SHELF', span: 2, size: 2 },
        { id: 'c-chilled', name: 'チルド室', kind: 'FRIDGE', form: 'DRAWER', span: 2, size: 1 },
        { id: 'c-ice', name: '製氷室', kind: 'FREEZER', form: 'DRAWER', span: 1, size: 1 },
        { id: 'c-freezer-s', name: '小さな冷凍室', kind: 'FREEZER', form: 'DRAWER', span: 1, size: 1 },
        { id: 'c-veg', name: '野菜室', kind: 'VEGETABLE_DRAWER', form: 'DRAWER', span: 2, size: 2 },
        { id: 'c-freezer', name: '冷凍室', kind: 'FREEZER', form: 'DRAWER', span: 2, size: 2 },
      ],
    },
    {
      id: 'unit-pantry',
      name: '常温の棚',
      type: 'SHELF',
      compartments: [
        { id: 'c-pantry', name: '棚', kind: 'ROOM_TEMP', form: 'SHELF', span: 2, size: 2 },
      ],
    },
  ];
}

const FORM_LABELS = { SHELF: '棚', DRAWER: '引き出し', POCKET: 'ドアポケット' };

/** 形を指定せずに作られた段に、種類から素直な形をあてがう */
function defaultFormFor(kind) {
  if (kind === 'VEGETABLE_DRAWER' || kind === 'FREEZER') return 'DRAWER';
  return 'SHELF';
}

function emptyState() {
  return { version: 2, items: [], layout: defaultLayout(), sampleLoaded: false };
}

/**
 * 保存された状態を読む。
 * プライベートウィンドウやサイトデータ遮断では localStorage が例外を投げるため、
 * 読めなかった場合も空の状態でアプリが成立するようにしておく。
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateFromV1(JSON.parse(legacy));

    return withSample(emptyState());
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

/** 形・幅が無かった頃の保存データにも既定値を補い、古い状態のまま描画されないようにする */
function normalize(parsed) {
  const state = { ...emptyState(), ...parsed };
  if (!Array.isArray(state.layout) || state.layout.length === 0) {
    state.layout = defaultLayout();
    return state;
  }
  state.layout.forEach((unit) => {
    if (!unit.type) unit.type = 'FRIDGE';
    unit.compartments.forEach((c) => {
      if (!c.form) c.form = defaultFormFor(c.kind);
      if (!c.span) c.span = 2;
    });
  });
  return state;
}

/** 収納が引き出し単位になる前の保存データを、種類が一致する最初の段へ移す */
function migrateFromV1(parsed) {
  const state = emptyState();
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  state.items = items.map((item) => {
    const target = allCompartments(state.layout).find((c) => c.kind === item.storageLocation);
    const { storageLocation, ...rest } = item;
    return { ...rest, compartmentId: target ? target.id : null };
  });
  state.sampleLoaded = Boolean(parsed.sampleLoaded);
  return state;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* --- 収納の参照 --------------------------------------------------------- */

function allCompartments(layout) {
  return layout.flatMap((unit) => unit.compartments);
}

function findCompartment(layout, compartmentId) {
  if (!compartmentId) return null;
  return allCompartments(layout).find((c) => c.id === compartmentId) || null;
}

function findUnitOf(layout, compartmentId) {
  return layout.find((u) => u.compartments.some((c) => c.id === compartmentId)) || null;
}

/** 収納の種類。まだどこにも入れていない食材は null（期限の目安は出さない） */
function kindOf(layout, item) {
  const compartment = findCompartment(layout, item.compartmentId);
  return compartment ? compartment.kind : null;
}

/** 「冷蔵庫 上段」のように筐体名を添えた表示名 */
function compartmentPath(layout, compartmentId) {
  const compartment = findCompartment(layout, compartmentId);
  if (!compartment) return '未収納';
  const unit = findUnitOf(layout, compartmentId);
  return `${unit.name} ${compartment.name}`;
}

/* --- 初回のサンプルデータ ------------------------------------------------ */

/**
 * 初回起動で空の冷蔵庫を見せても何のアプリか伝わらないため、
 * 緊急度が一通り揃うサンプルを入れておく。画面下部からまとめて削除できる。
 * 期限は「今日」からの相対で作るので、いつ開いても同じ見え方になる。
 */
function withSample(state) {
  const today = todayIso();
  const sample = [
    { name: '豚こま切れ肉', category: 'MEAT_FISH', at: 'c-chilled', expiryType: 'USE_BY', offset: 0, quantity: 1, memo: '半額だったもの' },
    { name: 'にんじん', category: 'VEGETABLE', at: 'c-veg', expiryType: 'UNKNOWN', registeredOffset: -9, quantity: 3, memo: null },
    { name: '絹ごし豆腐', category: 'PROCESSED', at: 'c-upper', expiryType: 'USE_BY', offset: 1, quantity: 2, memo: null },
    { name: '牛乳', category: 'DAIRY', at: 'c-door', expiryType: 'BEST_BEFORE', offset: 2, quantity: 1, memo: null },
    { name: 'キャベツ', category: 'VEGETABLE', at: 'c-veg', expiryType: 'UNKNOWN', registeredOffset: -3, quantity: 1, memo: '半玉' },
    { name: '卵', category: 'EGG', at: 'c-middle', expiryType: 'BEST_BEFORE', offset: 6, quantity: 8, memo: null },
    { name: '冷凍うどん', category: 'FROZEN', at: 'c-freezer', expiryType: 'BEST_BEFORE', registeredOffset: -10, quantity: 4, memo: null },
    { name: 'しょうゆ', category: 'SEASONING', at: 'c-pantry', expiryType: 'BEST_BEFORE', offset: 210, quantity: 1, memo: null },
    { name: 'ヨーグルト', category: 'DAIRY', at: null, expiryType: 'BEST_BEFORE', offset: 9, quantity: 4, memo: null },
  ];

  state.items = sample.map((s) => ({
    id: newId('item'),
    name: s.name,
    category: s.category,
    compartmentId: s.at,
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
