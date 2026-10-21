/* ===========================================================================
   永続化層 — 端末内の localStorage だけを使う。
   サーバーへの送信は一切行わない（仕様書2章の制約）。
   =========================================================================== */

const APP_VERSION = '0.8.0';
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
 * 段まで細かく分けるときの初期値。日本の家庭用冷蔵庫によくある構成に寄せてある。
 */
function detailedLayout() {
  return [
    {
      id: 'unit-fridge',
      name: '冷蔵庫',
      type: 'FRIDGE',
      color: null,
      doorStyle: 'RIGHT',
      doorWidth: DOOR_WIDTH_DEFAULT,
      compartments: [
        /* 扉の内側のポケット。卵・小物・ボトルの三段が日本の冷蔵庫によくある形 */
        comp('c-egg', '卵ケース', 'FRIDGE', 'POCKET', 100, 44),
        comp('c-door-s', '小物ポケット', 'FRIDGE', 'POCKET', 100, 44),
        comp('c-door', 'ボトルポケット', 'FRIDGE', 'POCKET', 100, 60),
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
      doorStyle: 'NONE',
      doorWidth: DOOR_WIDTH_DEFAULT,
      compartments: [
        comp('c-pantry', '棚', 'ROOM_TEMP', 'SHELF', 100, 72),
      ],
    },
  ];
}

/**
 * 温度帯だけで分けた冷蔵庫。これが既定。
 *
 * 期限の目安が変わるのは温度帯（冷蔵・野菜室・冷凍・常温）だけで、
 * 段まで記録しても冷蔵庫の中の物は毎日動くので、すぐ実物とずれる。
 * 登録のたびに段を選ぶ手間のほうが重いので、既定はここまでにしておく。
 * 段まで分けたい人は、設定から細かい形に切り替えられる。
 */
function zoneLayout() {
  return [
    makeUnit({
      id: 'unit-fridge',
      name: '冷蔵庫',
      type: 'FRIDGE',
      doorStyle: 'NONE',
      compartments: [
        comp('z-fridge', '冷蔵室', 'FRIDGE', 'SHELF', 100, 150),
        comp('z-veg', '野菜室', 'VEGETABLE_DRAWER', 'DRAWER', 100, 96),
        comp('z-freezer', '冷凍室', 'FREEZER', 'DRAWER', 100, 96),
      ],
    }),
    makeUnit({
      id: 'unit-pantry',
      name: '常温の棚',
      type: 'SHELF',
      compartments: [comp('z-pantry', '常温', 'ROOM_TEMP', 'SHELF', 100, 96)],
    }),
  ];
}

/** 冷蔵庫の中の分け方。ZONES=温度帯だけ（既定） / DETAILED=段まで細かく */
const LAYOUT_MODE_LABELS = { ZONES: '温度帯だけ', DETAILED: '段まで細かく' };

/**
 * その種類の食材を置く段。ドアポケットより棚や引き出しを、小さな段より大きな段を先に選ぶ。
 * 製氷室のような小さな区画に、冷凍食品がまとめて入ってしまわないようにする。
 * 分け方を切り替えたときに、食材を同じ温度帯へ移すのに使う。
 */
function firstCompartmentOfKind(layout, kind) {
  const all = allCompartments(layout).filter((c) => c.kind === kind);
  const pool = all.some((c) => c.form !== 'POCKET') ? all.filter((c) => c.form !== 'POCKET') : all;
  const main = pool.reduce((best, c) => (!best || c.width * c.height > best.width * best.height ? c : best), null);
  return main ? main.id : null;
}

/**
 * 温度帯だけに切り替える。
 * 細かい形と、食材がどの段にあったかは控えておくので、戻せばそのまま元に戻る。
 */
function useZones(state) {
  if (state.layoutMode === 'ZONES') return;
  const zones = zoneLayout();
  state.detailed = {
    layout: state.layout,
    placements: Object.fromEntries(state.items.map((item) => [item.id, item.compartmentId])),
  };
  state.items.forEach((item) => {
    const kind = kindOf(state.layout, item);
    item.compartmentId = kind ? firstCompartmentOfKind(zones, kind) : null;
  });
  state.layout = zones;
  state.layoutMode = 'ZONES';
}

/**
 * 段まで細かく分ける形に切り替える。
 * 前に細かくしていたなら、その形と段の位置に戻す。温度帯を移した食材は、移った先の温度帯の段に置く。
 */
function useDetailed(state) {
  if (state.layoutMode === 'DETAILED') return;
  const saved = state.detailed;
  const layout = saved && Array.isArray(saved.layout) && saved.layout.length > 0 ? saved.layout : detailedLayout();
  const placements = (saved && saved.placements) || {};
  state.items.forEach((item) => {
    const kind = kindOf(state.layout, item);
    if (!kind) {
      item.compartmentId = null;
      return;
    }
    const before = findCompartment(layout, placements[item.id]);
    item.compartmentId = before && before.kind === kind ? before.id : firstCompartmentOfKind(layout, kind);
  });
  state.layout = layout;
  state.layoutMode = 'DETAILED';
  state.detailed = null;
}

/**
 * 段を一つ作る。段はここ以外で組み立てない。
 * doorHeight は扉の始まりの段だけが使う、開いた扉の高さ（null なら庫内に合わせる）。
 * noDoor も扉の始まりの段だけが使う。true ならその区画は扉を外してある。
 * 2ドアの下の扉だけ外す、のように扉は区画ごとに外せる。
 * side は観音開きのポケットがどちらの扉に付くか（'left' | 'right'）。null なら左右交互に振り分ける。
 */
function comp(id, name, kind, form, width, height, newDoor) {
  return { id, name, kind, form, width, height, color: null, newDoor: Boolean(newDoor), doorHeight: null, noDoor: false, side: null };
}

/**
 * 開いた扉の幅。収納の隣の列に対する割合（%）。
 * 狭すぎるとポケットの名前が読めず、広すぎると扉の下に棚を置く場所が無くなる。
 */
const DOOR_WIDTH_DEFAULT = 78;
const DOOR_WIDTH_MIN = 40;
const DOOR_WIDTH_MAX = 100;
const DOOR_HEIGHT_MAX = 420;

function clampDoorWidth(value) {
  return Math.min(DOOR_WIDTH_MAX, Math.max(DOOR_WIDTH_MIN, Math.round(value)));
}

/**
 * 扉の開き方。図では扉を開けた状態で描く。
 * RIGHT は右へ開く（扉が冷蔵庫の右隣に開いて見える）。LEFT はその逆。
 * FRENCH は観音開きで、扉が左右2枚に割れる。
 * NONE は扉の無い収納。棚やラックのように、開くものが無い。
 */
const DOOR_STYLE_LABELS = { RIGHT: '右に開く', LEFT: '左に開く', FRENCH: '観音開き', NONE: '開かない' };

/** 扉が横に開くか。開いた扉は収納の隣の列に描く */
function opensSideways(unit) {
  return unit.doorStyle === 'RIGHT' || unit.doorStyle === 'LEFT';
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
    layout: zoneLayout(),
    /* 冷蔵庫の中の分け方。段まで分けていたときの形は detailed に控えておく */
    layoutMode: 'ZONES',
    detailed: null,
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
    /* 配色。'auto' は端末の設定に従う。明るい場所で使う人のために選べるようにしてある */
    theme: 'auto',
    /* 部屋の暑さ。常温の目安を変える。気温は外から取らず、月と地域か、使う人の選択で決める */
    /**
     * consent   位置情報を使う同意。null=まだ聞いていない / 'GRANTED' / 'DENIED'
     * source    地域をどう決めたか。'LOCATION'=位置情報から / 'MANUAL'=自分で選んだ
     * locatedAt 位置情報から地域を決めた日。位置（緯度経度）そのものは保存しない
     */
    climate: { mode: 'AUTO', region: 'HONSHU', consent: null, source: 'MANUAL', locatedAt: null },
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
    state.layout = zoneLayout();
    state.layoutMode = 'ZONES';
    state.detailed = null;
    return state;
  }
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!Array.isArray(state.shopping)) state.shopping = [];
  if (!Array.isArray(state.templates)) state.templates = [];
  if (!state.janNames || typeof state.janNames !== 'object') state.janNames = {};
  if (!['auto', 'light', 'dark'].includes(state.theme)) state.theme = 'auto';
  state.climate = { mode: 'AUTO', region: 'HONSHU', consent: null, source: 'MANUAL', locatedAt: null, ...(state.climate || {}) };
  if (!['GRANTED', 'DENIED'].includes(state.climate.consent)) state.climate.consent = null;
  if (!CLIMATE_LABELS[state.climate.mode]) state.climate.mode = 'AUTO';
  if (!CLIMATE_REGIONS[state.climate.region]) state.climate.region = 'HONSHU';
  /* 絵文字と食材ごとの通知を持たなかった頃の保存データを補う */
  state.items.forEach((item) => {
    if (item.icon === undefined) item.icon = iconForName(item.name);
    if (item.notifyDaysBefore === undefined) item.notifyDaysBefore = null;
    if (item.notifyTime === undefined) item.notifyTime = null;
    /* 開けた日。null なら開ける前（または分からない） */
    if (item.openedAt === undefined) item.openedAt = null;
    /* 野菜・果物の包み方。true=ラップ・袋 / false=むき出し / null=分からない（包んである扱い） */
    if (item.wrapped === undefined) item.wrapped = null;
    /* 状態（切った・開けた・加熱した・解凍した）。持たなかった頃のデータは開けた日から読み替える */
    if (!CONDITION_LABELS[item.condition]) item.condition = conditionOf(item);
    /* 自分で冷凍した日。冷凍庫での目安はこの日から数える */
    if (item.frozenAt === undefined) item.frozenAt = null;
  });
  state.notify = { enabled: true, time: '08:00', daysBefore: 3, ...(state.notify || {}) };
  if (!state.startedAt) state.startedAt = todayIso();
  if (typeof state.bestStreak !== 'number') state.bestStreak = 0;
  normalizeLayout(state.layout);
  if (!state.detailed || !Array.isArray(state.detailed.layout)) state.detailed = null;
  if (state.detailed) normalizeLayout(state.detailed.layout);

  /**
   * 分け方を持たなかった頃の保存データは段まで細かく分けてある。
   * 既定を温度帯だけに変えたので、そちらへ移す。細かい形は控えておくので、設定から戻せる。
   */
  if (!LAYOUT_MODE_LABELS[parsed.layoutMode]) {
    state.layoutMode = 'DETAILED';
    useZones(state);
  }
  return state;
}

/** 収納と段に、古い保存データに無い項目を補う */
function normalizeLayout(layout) {
  layout.forEach((unit) => {
    if (!unit.type) unit.type = 'FRIDGE';
    if (unit.color === undefined) unit.color = null;
    if (typeof unit.doorWidth !== 'number') unit.doorWidth = DOOR_WIDTH_DEFAULT;
    unit.doorWidth = clampDoorWidth(unit.doorWidth);
    /* 取っ手は描かなくなった。古い保存データに残っていても使わないので消しておく */
    delete unit.handle;
    delete unit.handleColor;
    /* 片開きしか無かった頃の保存データは、冷蔵庫なら右開き、棚なら扉なしに寄せる */
    if (!DOOR_STYLE_LABELS[unit.doorStyle]) unit.doorStyle = unit.type === 'FRIDGE' ? 'RIGHT' : 'NONE';
    unit.compartments.forEach((c) => {
      if (!c.form) c.form = defaultFormFor(c.kind);
      if (!c.width) c.width = c.span === 1 ? 50 : 100;
      if (!c.height) c.height = 32 + (c.size || 2) * 18;
      if (c.color === undefined) c.color = null;
      /* 扉の区切りを持たなかった頃の保存データは、扉が一枚だった頃の見え方を保つ */
      if (c.newDoor === undefined) c.newDoor = false;
      if (c.doorHeight === undefined) c.doorHeight = null;
      if (c.noDoor === undefined) c.noDoor = false;
      if (c.side !== 'left' && c.side !== 'right') c.side = null;
      delete c.span;
      delete c.size;
    });
  });
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

/**
 * 保存データをそのまま書き出す。
 * 端末の中だけに持つ作りなので、機種変更や初期化で消える。
 * 自分で控えを取れる道がないと、使い続けるほど失うものが大きくなる。
 */
function exportState(state) {
  return JSON.stringify({ app: 'fridge-keeper', version: APP_VERSION, savedAt: todayIso(), state }, null, 2);
}

/**
 * 控えから戻す。
 * 他のアプリの JSON を読まされても壊れないよう、形を確かめてから normalize に通す。
 * 戻り値が null なら取り込めなかったということ。
 */
function importState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return null;
  }
  const body = parsed && parsed.state ? parsed.state : parsed;
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return null;
  return normalize(body);
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

/**
 * 食材を別の段へ移す。食材の置き場所はここ以外で書き換えない。
 *
 * 温度帯をまたぐときは状態も変える。冷凍庫へ入れたら冷凍した日を記し（冷凍庫での目安はその日から）、
 * 冷凍庫から出したら解凍したものとして、その日から数え直す。
 * 戻り値は状態を変えたときだけ 'FROZEN' か 'THAWED'。知らせの文言に使う。
 */
function relocateItem(layout, item, compartmentId) {
  const before = kindOf(layout, item);
  item.compartmentId = compartmentId || null;
  const after = kindOf(layout, item);
  if (before === after || !after) return null;

  const today = todayIso();
  if (after === 'FREEZER') {
    item.frozenAt = today;
    return 'FROZEN';
  }
  if (before === 'FREEZER') {
    /* 加熱したものを解凍したときは、加熱したものとして数え直す */
    if (conditionOf(item) !== 'COOKED') item.condition = 'THAWED';
    item.openedAt = today;
    return 'THAWED';
  }
  return null;
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


/* ===========================================================================
   冷蔵庫の型 — よくある形をそのまま選べるようにする。

   段を一つずつ足して組み立てるのは、最初の一度とはいえ重い。
   自分の冷蔵庫に近い型を選んでから、違うところだけ直せば済むようにする。
   =========================================================================== */

/**
 * 型から段の並びを作る。
 * d(...) は新しい扉の始まり。これを境に扉が分かれる。
 */
function shapeCompartments(rows) {
  return rows.map((row, index) => comp(
    newId('c'), row.name, row.kind, row.form,
    row.width || 100, row.height || 68,
    index === 0 ? false : Boolean(row.newDoor),
  ));
}

const FRIDGE_SHAPES = [
  {
    id: 'two-door-top',
    name: '2ドア（上が冷凍）',
    note: '冷凍室が上、冷蔵室が下。一人暮らし向けに多い形。',
    doorStyle: 'RIGHT',
    rows: [
      { name: '冷凍室', kind: 'FREEZER', form: 'SHELF', height: 72 },
      { name: 'ドアポケット', kind: 'FRIDGE', form: 'POCKET', height: 52, newDoor: true },
      { name: '上段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '下段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
    ],
  },
  {
    id: 'two-door-bottom',
    name: '2ドア（下が冷凍）',
    note: '冷蔵室が上、冷凍室の引き出しが下。',
    doorStyle: 'RIGHT',
    rows: [
      { name: 'ドアポケット', kind: 'FRIDGE', form: 'POCKET', height: 52 },
      { name: '上段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '下段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '冷凍室', kind: 'FREEZER', form: 'DRAWER', height: 84 },
    ],
  },
  {
    id: 'three-door',
    name: '3ドア',
    note: '冷蔵室・冷凍室・野菜室。',
    doorStyle: 'RIGHT',
    rows: [
      { name: 'ドアポケット', kind: 'FRIDGE', form: 'POCKET', height: 52 },
      { name: '上段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '中段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '冷凍室', kind: 'FREEZER', form: 'DRAWER', height: 76 },
      { name: '野菜室', kind: 'VEGETABLE_DRAWER', form: 'DRAWER', height: 76 },
    ],
  },
  {
    id: 'five-door',
    name: '5ドア',
    note: '製氷室と小さな冷凍室が横に並ぶ、家族向けの標準的な形。',
    doorStyle: 'RIGHT',
    rows: [
      { name: '卵ケース', kind: 'FRIDGE', form: 'POCKET', height: 44 },
      { name: '小物ポケット', kind: 'FRIDGE', form: 'POCKET', height: 44 },
      { name: 'ボトルポケット', kind: 'FRIDGE', form: 'POCKET', height: 60 },
      { name: '上段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '中段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: 'チルド室', kind: 'FRIDGE', form: 'DRAWER', height: 52 },
      { name: '製氷室', kind: 'FREEZER', form: 'DRAWER', width: 50, height: 52 },
      { name: '小さな冷凍室', kind: 'FREEZER', form: 'DRAWER', width: 50, height: 52 },
      { name: '野菜室', kind: 'VEGETABLE_DRAWER', form: 'DRAWER', height: 76 },
      { name: '冷凍室', kind: 'FREEZER', form: 'DRAWER', height: 76 },
    ],
  },
  {
    id: 'french',
    name: '観音開き（6ドア）',
    note: '冷蔵室の扉が左右2枚に割れる大型。ポケットは両方の扉に付く。',
    doorStyle: 'FRENCH',
    rows: [
      { name: '卵ケース', kind: 'FRIDGE', form: 'POCKET', height: 44 },
      { name: '小物ポケット', kind: 'FRIDGE', form: 'POCKET', height: 44 },
      { name: '調味料ポケット', kind: 'FRIDGE', form: 'POCKET', height: 52 },
      { name: 'ボトルポケット', kind: 'FRIDGE', form: 'POCKET', height: 60 },
      { name: '上段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '中段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: '下段', kind: 'FRIDGE', form: 'SHELF', height: 68 },
      { name: 'チルド室', kind: 'FRIDGE', form: 'DRAWER', height: 52 },
      { name: '製氷室', kind: 'FREEZER', form: 'DRAWER', width: 50, height: 52 },
      { name: '小さな冷凍室', kind: 'FREEZER', form: 'DRAWER', width: 50, height: 52 },
      { name: '野菜室', kind: 'VEGETABLE_DRAWER', form: 'DRAWER', height: 76 },
      { name: '冷凍室', kind: 'FREEZER', form: 'DRAWER', height: 76 },
    ],
  },
  {
    id: 'one-door',
    name: '1ドア',
    note: '小型。中に小さな冷凍室がある形。',
    doorStyle: 'RIGHT',
    rows: [
      { name: 'ドアポケット', kind: 'FRIDGE', form: 'POCKET', height: 52 },
      { name: '冷凍室', kind: 'FREEZER', form: 'SHELF', height: 52 },
      { name: '棚', kind: 'FRIDGE', form: 'SHELF', height: 76 },
    ],
  },
  {
    id: 'freezer-only',
    name: '冷凍庫（単体）',
    note: 'セカンド冷凍庫。引き出しだけの形。',
    doorStyle: 'NONE',
    rows: [
      { name: '上の段', kind: 'FREEZER', form: 'DRAWER', height: 64 },
      { name: '中の段', kind: 'FREEZER', form: 'DRAWER', height: 64 },
      { name: '下の段', kind: 'FREEZER', form: 'DRAWER', height: 64 },
    ],
  },
  {
    id: 'pantry',
    name: '常温の棚',
    note: '冷蔵庫ではない置き場所。調味料や乾物に。',
    doorStyle: 'NONE',
    rows: [
      { name: '上の棚', kind: 'ROOM_TEMP', form: 'SHELF', height: 68 },
      { name: '下の棚', kind: 'ROOM_TEMP', form: 'SHELF', height: 68 },
    ],
  },
];

/**
 * 収納を一つ作る。収納はここ以外で組み立てない。
 * 項目を足したときに作る場所の一つだけ書き忘れると、その収納を描くところで止まる。
 * 実際に「収納を追加」で扉の開き方が抜け、冷蔵庫の図が描けなくなったことがある。
 */
function makeUnit({ id, name, type, doorStyle, compartments }) {
  const isShelf = type === 'SHELF';
  return {
    id: id || newId('unit'),
    name,
    type,
    color: null,
    doorStyle: doorStyle || (isShelf ? 'NONE' : 'RIGHT'),
    doorWidth: DOOR_WIDTH_DEFAULT,
    compartments,
  };
}

/** 型から収納を一つ作る。棚は扉も取っ手も持たない */
function unitFromShape(shape, name) {
  return makeUnit({
    name: name || shape.name,
    type: shape.id === 'pantry' ? 'SHELF' : 'FRIDGE',
    doorStyle: shape.doorStyle,
    compartments: shapeCompartments(shape.rows),
  });
}

/* --- 初回のサンプルデータ ------------------------------------------------ */

/**
 * 初回起動で空の冷蔵庫を見せても何のアプリか伝わらないため、
 * 緊急度が一通り揃うサンプルを入れておく。画面下部からまとめて削除できる。
 * 期限は「今日」からの相対で作るので、いつ開いても同じ見え方になる。
 */
function withSample(state) {
  /* サンプルは細かい形の段で書いてある。温度帯だけのときは、同じ温度帯の段へ置く */
  const placeSample = (layout, at) => {
    if (findCompartment(layout, at)) return at;
    const original = findCompartment(detailedLayout(), at);
    return original ? firstCompartmentOfKind(layout, original.kind) : null;
  };
  const today = todayIso();
  const sample = [
    { name: '豚こま切れ肉', category: 'MEAT_FISH', at: 'c-chilled', expiryType: 'USE_BY', offset: 0, quantity: 1, memo: '半額だったもの' },
    { name: 'にんじん', category: 'VEGETABLE', at: 'c-veg', expiryType: 'UNKNOWN', registeredOffset: -9, quantity: 3, memo: null },
    { name: '絹ごし豆腐', category: 'PROCESSED', at: 'c-upper', expiryType: 'USE_BY', offset: 1, quantity: 2, memo: null },
    { name: '牛乳', category: 'DAIRY', at: 'c-door', expiryType: 'BEST_BEFORE', offset: 2, quantity: 1, memo: null },
    { name: 'キャベツ', category: 'VEGETABLE', at: 'c-veg', expiryType: 'UNKNOWN', registeredOffset: -3, quantity: 1, memo: '半玉' },
    { name: '卵', category: 'EGG', at: 'c-egg', expiryType: 'BEST_BEFORE', offset: 6, quantity: 8, memo: null },
    { name: '冷凍うどん', category: 'FROZEN', at: 'c-freezer', expiryType: 'BEST_BEFORE', registeredOffset: -10, quantity: 4, memo: null },
    { name: 'しょうゆ', category: 'SEASONING', at: 'c-pantry', expiryType: 'BEST_BEFORE', offset: 210, quantity: 1, memo: null },
    { name: 'ヨーグルト', category: 'DAIRY', at: null, expiryType: 'BEST_BEFORE', offset: 9, quantity: 4, memo: null },
  ];

  state.items = sample.map((s) => ({
    id: newId('item'),
    name: s.name,
    icon: iconForName(s.name),
    notifyDaysBefore: null,
    notifyTime: null,
    category: s.category,
    compartmentId: s.at ? placeSample(state.layout, s.at) : null,
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
