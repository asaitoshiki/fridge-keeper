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
 * form   段の見た目。SHELF=棚 / DRAWER=引き出し / POCKET=ドアポケット
 * width  幅の割合(%)。合計が100を超えたところで次の行へ折り返す
 * height 高さ(px)
 * color  庫内の色。null なら既定
 *
 * 初期値は日本の家庭用冷蔵庫によくある構成に寄せてある。
 */
function defaultLayout() {
  return [
    {
      id: 'unit-fridge',
      name: '冷蔵庫',
      type: 'FRIDGE',
      color: null,
      compartments: [
        comp('c-door', 'ドアポケット', 'FRIDGE', 'POCKET', 100, 52),
        comp('c-upper', '上段', 'FRIDGE', 'SHELF', 100, 68),
        comp('c-middle', '中段', 'FRIDGE', 'SHELF', 100, 68),
        comp('c-chilled', 'チルド室', 'FRIDGE', 'DRAWER', 100, 52),
        comp('c-ice', '製氷室', 'FREEZER', 'DRAWER', 50, 52),
        comp('c-freezer-s', '小さな冷凍室', 'FREEZER', 'DRAWER', 50, 52),
        comp('c-veg', '野菜室', 'VEGETABLE_DRAWER', 'DRAWER', 100, 76),
        comp('c-freezer', '冷凍室', 'FREEZER', 'DRAWER', 100, 76),
      ],
    },
    {
      id: 'unit-pantry',
      name: '常温の棚',
      type: 'SHELF',
      color: null,
      compartments: [
        comp('c-pantry', '棚', 'ROOM_TEMP', 'SHELF', 100, 72),
      ],
    },
  ];
}

function comp(id, name, kind, form, width, height) {
  return { id, name, kind, form, width, height, color: null };
}

const FORM_LABELS = { SHELF: '棚', DRAWER: '引き出し', POCKET: 'ドアポケット' };

/* 調整できる範囲。ここを外れると図として破綻するので端で止める */
const WIDTH_MIN = 20;
const WIDTH_MAX = 100;
const HEIGHT_MIN = 36;
const HEIGHT_MAX = 220;

/**
 * 筐体と庫内に使える色。
 * 期限の警告に使う赤・橙・黄はここに入れない。庫内をその色にできてしまうと、
 * 期限切れの食材が背景に紛れて見落とされる（仕様書8.2）。
 */
const CASE_COLORS = [
  { value: null, label: '既定' },
  { value: '#d8e4eb', label: 'ステンレス' },
  { value: '#f4f6f7', label: 'ホワイト' },
  { value: '#93a0aa', label: 'グレー' },
  { value: '#2f3a42', label: 'チャコール' },
  { value: '#26405c', label: 'ネイビー' },
  { value: '#3f6b63', label: 'ディープグリーン' },
  { value: '#e8ddcc', label: 'ベージュ' },
  { value: '#c0a98f', label: 'ウッド' },
];

/** 形を指定せずに作られた段に、種類から素直な形をあてがう */
function defaultFormFor(kind) {
  if (kind === 'VEGETABLE_DRAWER' || kind === 'FREEZER') return 'DRAWER';
  return 'SHELF';
}

function emptyState() {
  return {
    version: 2,
    items: [],
    layout: defaultLayout(),
    /* 食べた・捨てたの履歴。食材を消したあとも残るので別に持つ */
    logs: [],
    /* ストリークの起点。一度も捨てていない間はここから数える */
    startedAt: todayIso(),
    bestStreak: 0,
    /* 買い物リスト。共有はOSの共有シートへ投げるだけで、サーバーは持たない */
    shopping: [],
    /* よく買うもの。登録のたびに先頭へ積み、同じ名前は一つにまとめる */
    templates: [],
    /* 通知の設定。Web では鳴らせないが、Android へ持っていく値をここで決めておく */
    notify: { enabled: true, time: '08:00', daysBefore: 3 },
    /**
     * バーコードから商品名を引く辞書。
     * 外部の商品データベースは叩かず、一度登録した商品を端末が覚えていく。
     * 次に同じものを買ったときは、読ませるだけで名前とカテゴリが入る。
     */
    janNames: {},
    sampleLoaded: false,
  };
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

/**
 * 古い保存データに新しい項目を補う。
 * 幅と高さは段階指定（span 1|2 / size 1..4）から連続値へ変えたので、
 * 元の見え方をなるべく保つ値に読み替える。
 */
function normalize(parsed) {
  const state = { ...emptyState(), ...parsed };
  if (!Array.isArray(state.layout) || state.layout.length === 0) {
    state.layout = defaultLayout();
    return state;
  }
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!Array.isArray(state.shopping)) state.shopping = [];
  if (!Array.isArray(state.templates)) state.templates = [];
  if (!state.janNames || typeof state.janNames !== 'object') state.janNames = {};
  state.notify = { enabled: true, time: '08:00', daysBefore: 3, ...(state.notify || {}) };
  if (!state.startedAt) state.startedAt = todayIso();
  if (typeof state.bestStreak !== 'number') state.bestStreak = 0;
  state.layout.forEach((unit) => {
    if (!unit.type) unit.type = 'FRIDGE';
    if (unit.color === undefined) unit.color = null;
    unit.compartments.forEach((c) => {
      if (!c.form) c.form = defaultFormFor(c.kind);
      if (!c.width) c.width = c.span === 1 ? 50 : 100;
      if (!c.height) c.height = 32 + (c.size || 2) * 18;
      if (c.color === undefined) c.color = null;
      delete c.span;
      delete c.size;
    });
  });
  return state;
}

function clampWidth(value) {
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(value)));
}

function clampHeight(value) {
  return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, Math.round(value)));
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
