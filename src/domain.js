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
 * よく使う食品は shelflife.js に個別の値があり、そちらを先に使う。ここはその受け皿。
 * ここで返す日数は一般的な参考値であり、実際の安全性を保証するものではない。
 * この値から導いた期限を表示する箇所には必ず「目安」バッジを付けること。
 *
 * どの組み合わせにも値を持たせる。肉を常温に置いたときに「期限なし」と出すと、
 * いちばん危ない置き方がいちばん安心して見える。向かない置き方は 0（その日のうち）にする。
 */
const PRESET_DAYS = {
  VEGETABLE: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 3 },
  FRUIT: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 3 },
  MEAT_FISH: { FRIDGE: 2, FREEZER: 30, VEGETABLE_DRAWER: 1, ROOM_TEMP: 0 },
  DAIRY: { FRIDGE: 7, FREEZER: 14, VEGETABLE_DRAWER: 5, ROOM_TEMP: 0 },
  EGG: { FRIDGE: 14, FREEZER: 30, VEGETABLE_DRAWER: 10, ROOM_TEMP: 3 },
  PROCESSED: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 5, ROOM_TEMP: 30 },
  FROZEN: { FREEZER: 90, FRIDGE: 1, VEGETABLE_DRAWER: 1, ROOM_TEMP: 0 },
  SEASONING: { FRIDGE: 90, FREEZER: 180, VEGETABLE_DRAWER: 90, ROOM_TEMP: 90 },
  DRINK: { FRIDGE: 30, FREEZER: 30, VEGETABLE_DRAWER: 30, ROOM_TEMP: 30 },
  OTHER: { FRIDGE: 7, FREEZER: 30, VEGETABLE_DRAWER: 7, ROOM_TEMP: 7 },
};

/**
 * 開けた・切ったあとの冷蔵での目安。食品ごとの値が無いときに使う。
 * 常温で開けたまま置けるのは調味料くらいなので、それ以外の常温は 0 にする。
 */
const OPENED_DAYS = {
  VEGETABLE: 2, FRUIT: 1, MEAT_FISH: 1, DAIRY: 3, EGG: 2, PROCESSED: 2,
  FROZEN: 1, SEASONING: 30, DRINK: 2, OTHER: 3,
};
const OPENED_ROOM_DAYS = { SEASONING: 30 };

/* --- 部屋の暑さ ---------------------------------------------------------- */

/**
 * 常温の日持ちは部屋の暑さで大きく変わる。冷蔵庫と冷凍庫の中は一年中ほぼ同じなので変えない。
 * 気温を外から取ってくることはしない（端末の外へ出ない作り）。代わりに、
 * 月と地域から夏・冬を決めるか、使う人が「暑い」「涼しい」を選ぶ。
 *
 * HOT  暑い（おおむね25℃以上）。常温の野菜・果物・パン・卵などは短めに見る
 * MILD ふつう。表の値そのまま
 * COOL 涼しい（おおむね15℃以下）。丸ごとの白菜・大根・いも類などは長めに見る
 */
const CLIMATE_LABELS = { AUTO: '季節で自動', HOT: '暑い', MILD: 'ふつう', COOL: '涼しい' };

/** 地域ごとの、暑い月と涼しい月 */
const CLIMATE_REGIONS = {
  HOKKAIDO: { label: '北海道', hot: [7, 8], cool: [11, 12, 1, 2, 3] },
  TOHOKU: { label: '東北・北陸', hot: [7, 8], cool: [12, 1, 2, 3] },
  HONSHU: { label: '関東〜九州', hot: [6, 7, 8, 9], cool: [12, 1, 2] },
  OKINAWA: { label: '沖縄・奄美', hot: [5, 6, 7, 8, 9, 10], cool: [] },
  TROPICAL: { label: '一年中暑い地域', hot: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cool: [] },
  SOUTH: { label: '南半球', hot: [12, 1, 2, 3], cool: [6, 7, 8] },
};

/**
 * 緯度経度から地域を決める。端末の中だけで決め、位置そのものはどこにも残さない。
 * 細かい境目は気にしない。夏と冬の長さが大きく違う所だけ分かれれば足りる。
 */
function regionFromLocation(lat, lon) {
  const inJapan = lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154;
  if (inJapan) {
    if (lat < 29) return 'OKINAWA';
    if (lat >= 41.5) return 'HOKKAIDO';
    if (lat >= 37.5) return 'TOHOKU';
    return 'HONSHU';
  }
  if (Math.abs(lat) < 23.5) return 'TROPICAL';
  if (lat < 0) return 'SOUTH';
  if (lat >= 45) return 'HOKKAIDO';
  return 'HONSHU';
}

let climateSetting = { mode: 'AUTO', region: 'HONSHU' };

/** 設定の画面で選んだ部屋の暑さを、目安の計算に渡す */
function setClimate(setting) {
  const mode = setting && CLIMATE_LABELS[setting.mode] ? setting.mode : 'AUTO';
  const region = setting && CLIMATE_REGIONS[setting.region] ? setting.region : 'HONSHU';
  climateSetting = { mode, region };
}

/** その日の部屋の暑さ。登録した日（開けた日）の暑さで、その食材の目安を決める */
function climateOn(iso) {
  if (climateSetting.mode !== 'AUTO') return climateSetting.mode;
  const month = Number(String(iso || todayIso()).slice(5, 7));
  const region = CLIMATE_REGIONS[climateSetting.region];
  if (region.hot.includes(month)) return 'HOT';
  if (region.cool.includes(month)) return 'COOL';
  return 'MILD';
}

/**
 * 暑さで常温の目安を変えるカテゴリ。調味料・飲料・冷凍食品は、開ける前なら暑さで大きくは変わらない。
 * 60日以上持つもの（缶詰・乾物など）も変えない。
 */
const CLIMATE_SENSITIVE = ['VEGETABLE', 'FRUIT', 'EGG', 'PROCESSED', 'DAIRY', 'MEAT_FISH', 'OTHER'];

/**
 * 常温の目安を部屋の暑さに合わせる。
 * 食品ごとに暑いとき（Rs）・涼しいとき（Rw）の値があればそれを使う。
 * 無ければ、暑いときは暑さに弱いカテゴリだけ半分にする。涼しいときは値があるものだけ延ばす。
 */
function roomDaysFor(days, item, food, climate, hotKey, coolKey) {
  if (climate === 'HOT') {
    if (food && typeof food[hotKey] === 'number') return food[hotKey];
    if (CLIMATE_SENSITIVE.includes(item.category) && days < 60) return Math.floor(days / 2);
    return days;
  }
  if (climate === 'COOL' && food && typeof food[coolKey] === 'number') return food[coolKey];
  return days;
}

/* --- 野菜・果物の切り方と包み方 ----------------------------------------------- */

/**
 * 食材の状態。買ったままか、手を加えたかで日持ちが変わる。
 * 包装品なら開けたか、野菜・果物なら丸ごとか切ったか、肉や冷凍食品なら解凍したか、
 * どれでも加熱・調理したか。キャベツの一玉と半玉、生の鶏肉と焼いた鶏肉は別物として見る。
 *
 * item.condition に状態を、item.openedAt にその状態になった日を持つ（名前は昔の「開けた日」のまま）。
 *   NONE   買ったまま（丸ごと・開けていない・生・凍ったまま）
 *   CUT    切った（半玉・カット・使いかけ）
 *   PEELED 皮をむいた
 *   OPENED 開けた（包装を開けた）
 *   COOKED 加熱・調理した（作り置き・残りもの・ゆで卵など）
 *   THAWED 解凍した
 */
const CONDITION_LABELS = {
  NONE: '買ったまま', CUT: '切った', PEELED: '皮をむいた', OPENED: '開けた', COOKED: '加熱した', THAWED: '解凍した',
};
/* 一覧の印に使う、状態を表す短い言葉 */
const CONDITION_BADGES = {
  CUT: '切ってある', PEELED: '皮をむいた', OPENED: '開封済み', COOKED: '加熱済み', THAWED: '解凍済み',
};

/** その食材で選べる状態。食材の種類ごとに、ふつう起きることだけを並べる */
function conditionsFor(item) {
  if (isProduce(item)) {
    return [['NONE', '丸ごと'], ['CUT', '切った'], ['PEELED', '皮をむいた'], ['COOKED', '加熱した']];
  }
  switch (item.category) {
    case 'MEAT_FISH':
      return [['NONE', '生のまま'], ['OPENED', 'パックを開けた'], ['THAWED', '解凍した'], ['COOKED', '加熱した']];
    case 'FROZEN':
      return [['NONE', '凍ったまま'], ['THAWED', '解凍した'], ['COOKED', '加熱した']];
    case 'EGG':
      return [['NONE', '生'], ['COOKED', 'ゆでた・焼いた']];
    case 'SEASONING':
    case 'DRINK':
      return [['NONE', '開けていない'], ['OPENED', '開けた']];
    default:
      return [['NONE', '開けていない'], ['OPENED', '開けた'], ['COOKED', '加熱・調理した']];
  }
}

/** 状態ごとの保存のコツ。手を加えたあとは、その食品の丸ごとのときのコツより、こちらが効く */
const CONDITION_TIPS = {
  CUT: '切り口が乾かないよう、ラップで包むか保存袋に入れて冷蔵へ。',
  PEELED: '皮をむいたものは乾きやすく傷みやすいので、ラップか保存袋に入れて早めに使います。',
  OPENED: '開けたら口をしっかり閉じて冷蔵へ。',
  COOKED: '粗熱をとってから、ふたをして冷蔵へ。食べきれない分は早めに冷凍に。',
  THAWED: '解凍したものをもう一度凍らせると味と食感が落ちます。早めに使い切ってください。',
};

/** いまの状態。状態を持たなかった頃のデータは、開けた日があれば「開けた（野菜なら切った）」と読む */
function conditionOf(item) {
  if (item.condition && CONDITION_LABELS[item.condition]) return item.condition;
  if (item.openedAt) return isProduce(item) ? 'CUT' : 'OPENED';
  return 'NONE';
}
function isProduce(item) {
  return item.category === 'VEGETABLE' || item.category === 'FRUIT';
}

/** 名前から、切って売られているものを見分ける（キャベツ半玉、カットかぼちゃ など） */
const CUT_WORDS = ['半玉', '半分', 'ハーフ', '1/2', '1/4', '1/3', '½', '¼', 'カット', '切り身', '使いかけ', '残り'];
function looksCut(name) {
  return CUT_WORDS.some((word) => String(name || '').includes(word));
}

/**
 * むき出しで冷蔵庫に入れた野菜・果物や料理は乾いて早く傷むので、目安を縮める。
 * 丸ごとなら7割、切ったものや料理は半分。常温と冷凍は包み方で大きくは変わらないので変えない。
 * wrapped が null（分からない）のときは、包んであるものとして見る。
 */
function wrapMatters(item) {
  return isProduce(item) || conditionOf(item) === 'COOKED';
}

function wrapAdjusted(days, item, storageKind, cut) {
  if (days === null || !wrapMatters(item) || item.wrapped !== false) return days;
  if (storageKind !== 'FRIDGE' && storageKind !== 'VEGETABLE_DRAWER') return days;
  const shorter = Math.floor(days * (cut ? 0.5 : 0.7));
  return days > 0 ? Math.max(1, shorter) : 0;
}

/** カテゴリだけで引く目安日数。まだどこにも入れていない食材（kind が null）は null */
function presetDaysFor(category, storageKind) {
  if (!storageKind) return null;
  const days = (PRESET_DAYS[category] || PRESET_DAYS.OTHER)[storageKind];
  return days === undefined ? null : days;
}

/**
 * 食材の日持ちの目安日数。食品ごとの値があればそれ、無ければカテゴリの値。
 * まだどこにも入れていない食材では null を返し、期限なし扱いにする。
 * この null は異常ではなく「目安を出せない」正常な状態。
 */
function estimateDaysFor(item, storageKind) {
  if (!storageKind) return null;
  const food = typeof shelfLifeFor === 'function' ? shelfLifeFor(item.name, item.category) : null;
  const own = food ? food[SHELF_KEYS[storageKind]] : undefined;
  const days = typeof own === 'number' ? own : presetDaysFor(item.category, storageKind);
  if (days === null) return null;
  if (storageKind !== 'ROOM_TEMP') return wrapAdjusted(days, item, storageKind, false);
  return roomDaysFor(days, item, food, climateOn(item.registeredAt), 'Rs', 'Rw');
}

/**
 * 加熱・調理したもの（作り置き・残りもの）の冷蔵での目安。食品ごとの値（cooked）があればそちら。
 * 常温に置いた料理は数時間で傷みやすいので、その日のうちにする。
 */
const COOKED_DAYS = {
  VEGETABLE: 3, FRUIT: 2, MEAT_FISH: 3, DAIRY: 2, EGG: 2, PROCESSED: 3, FROZEN: 2,
  SEASONING: 7, DRINK: 2, OTHER: 2,
};

/** 解凍したものの冷蔵での目安。解凍した肉や魚は、生のときより早く使い切る */
const THAWED_DAYS = { MEAT_FISH: 1, FROZEN: 1, PROCESSED: 2, VEGETABLE: 2, FRUIT: 1, DAIRY: 2, OTHER: 1 };

/**
 * 状態が変わった日からの目安日数。冷凍庫では状態で日持ちはほとんど変わらないので null（変えない）。
 */
function conditionDaysFor(item, storageKind) {
  const condition = conditionOf(item);
  if (condition === 'NONE' || !storageKind || storageKind === 'FREEZER') return null;
  const food = typeof shelfLifeFor === 'function' ? shelfLifeFor(item.name, item.category) : null;

  if (condition === 'COOKED') {
    if (storageKind === 'ROOM_TEMP') return 0;
    const own = food && typeof food.cooked === 'number' ? food.cooked : null;
    return wrapAdjusted(own !== null ? own : (COOKED_DAYS[item.category] || 2), item, storageKind, true);
  }
  if (condition === 'THAWED') {
    if (storageKind === 'ROOM_TEMP') return 0;
    return THAWED_DAYS[item.category] !== undefined ? THAWED_DAYS[item.category] : 1;
  }
  return openedDaysFor(item, storageKind);
}

/**
 * 開けた・切ったあとの目安日数。
 */
function openedDaysFor(item, storageKind) {
  if (!storageKind || storageKind === 'FREEZER') return null;
  const food = typeof shelfLifeFor === 'function' ? shelfLifeFor(item.name, item.category) : null;
  if (storageKind === 'ROOM_TEMP') {
    let days = food && typeof food.openR === 'number' ? food.openR : OPENED_ROOM_DAYS[item.category];
    if (typeof days !== 'number') return 0;
    return roomDaysFor(days, item, food, climateOn(item.openedAt), 'openRs', 'openRw');
  }
  const days = food && typeof food.open === 'number'
    ? food.open
    : (OPENED_DAYS[item.category] !== undefined ? OPENED_DAYS[item.category] : OPENED_DAYS.OTHER);
  return wrapAdjusted(days, item, storageKind, true);
}

/**
 * 見本帳に無い食品を、どこへ入れるかの決め打ち。「おすすめ」とは言わず、入れる先を決めるだけに使う。
 * 飲料は開ける前なら常温でも冷蔵でもよいが、すぐ飲むことが多いので冷蔵に寄せる。
 */
const CATEGORY_STORAGE = {
  VEGETABLE: 'VEGETABLE_DRAWER', FRUIT: 'VEGETABLE_DRAWER', MEAT_FISH: 'FRIDGE', DAIRY: 'FRIDGE',
  EGG: 'FRIDGE', PROCESSED: 'FRIDGE', FROZEN: 'FREEZER', SEASONING: 'ROOM_TEMP', DRINK: 'FRIDGE',
};

/** 入れる先の収納の種類。食品ごとのおすすめ、無ければカテゴリの決め打ち */
function placementFor(item) {
  return bestStorageFor(item) || CATEGORY_STORAGE[item.category] || null;
}

/** その食品のおすすめの置き場所（収納の種類）。分からなければ null */
function bestStorageFor(item) {
  const food = typeof shelfLifeFor === 'function' ? shelfLifeFor(item.name, item.category) : null;
  /**
   * 手を加えたあとは、丸ごと・買ったままのときのおすすめは当てはまらない。
   * 解凍したものは凍らせ直さず冷蔵、料理も冷蔵。切った野菜は野菜室、切った果物は冷蔵。
   * 開けた包装品は、開けても常温に置けるもの（しょうゆなど）以外は冷蔵。
   */
  const condition = conditionOf(item);
  if (condition === 'THAWED' || condition === 'COOKED') return 'FRIDGE';
  if ((condition === 'CUT' || condition === 'PEELED') && isProduce(item)) {
    return item.category === 'FRUIT' ? 'FRIDGE' : 'VEGETABLE_DRAWER';
  }
  if (condition === 'OPENED') {
    if (food && typeof food.openR === 'number' && food.openR > 0 && food.best) return SHELF_KIND_OF[food.best];
    return 'FRIDGE';
  }
  if (!food || !food.best) return null;
  /* 暑い時期だけ置き場所を変えたほうがいいもの（たまねぎ・チョコなど） */
  if (climateOn(todayIso()) === 'HOT' && food.bestS) return SHELF_KIND_OF[food.bestS];
  return SHELF_KIND_OF[food.best];
}

/** 保存のコツの一文。暑い時期だけのコツがあれば、暑い時期はそちらを言う。分からなければ null */
function storageTipFor(item) {
  const food = typeof shelfLifeFor === 'function' ? shelfLifeFor(item.name, item.category) : null;
  if (!food) return null;
  if (climateOn(todayIso()) === 'HOT' && food.tipS) return food.tipS;
  return food.tip || null;
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
 * 実効期限 = 入力された期限、なければ 登録日（冷凍庫なら冷凍した日）+ 目安日数。
 * 状態が変わった日があれば、その日 + 状態ごとの目安日数 と比べて早いほうを使う。
 * 印字の期限は開ける前の話なので、開けたら印字より前に来ることが多い（牛乳など）。
 * 推定値は保存せず参照のたびにここで導出する。収納を移せば目安も変わる。
 * 戻り値 date が null なら期限なし扱い（アラート対象外）。opened は開けたあとの目安を使ったか。
 */
function effectiveExpiry(item, storageKind) {
  let date = item.expiryDate || null;
  let estimated = !item.expiryDate;
  let opened = false;

  if (!date) {
    const days = estimateDaysFor(item, storageKind);
    /* 自分で冷凍したものは、冷凍した日から数える */
    const from = storageKind === 'FREEZER' && item.frozenAt && item.frozenAt > item.registeredAt
      ? item.frozenAt
      : item.registeredAt;
    if (days !== null) date = addDays(from, days);
  }

  const condition = conditionOf(item);
  if (item.openedAt && condition !== 'NONE') {
    const days = conditionDaysFor(item, storageKind);
    if (days !== null) {
      const afterOpen = addDays(item.openedAt, days);
      /**
       * 解凍した・加熱したものは、買った日からの目安はもう当てにならない。その日から数え直す。
       * 一か月冷凍していたうどんを今日解凍しても、買った日から数えると切れていることになってしまう。
       * 印字の期限があるときだけは、そちらのほうが早ければそちらを使う。
       */
      const restart = (condition === 'COOKED' || condition === 'THAWED') && !item.expiryDate;
      if (restart || !date || afterOpen < date) {
        date = afterOpen;
        estimated = true;
        opened = true;
      }
    }
  }

  if (date === null) return { date: null, estimated: true, opened: false };
  return { date, estimated, opened };
}

/* --- 緊急度 ------------------------------------------------------------ */

/**
 * 残り日数から緊急度を決める。
 * 期限切れ / 当日〜1日前 / 2〜3日前 / 4〜7日前 / それ以降 / 期限なし。
 */
function urgencyOf(item, storageKind, today) {
  const { date, estimated, opened } = effectiveExpiry(item, storageKind);
  if (date === null) {
    return { level: 'NONE', days: null, date: null, estimated, opened };
  }
  const days = diffDays(today, date);
  return { level: levelForDays(days), days, date, estimated, opened };
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

/* --- 実績の集計 --------------------------------------------------------- */

/**
 * 期間内の食べた・捨てたを数える。
 * 食べきり率は、減らした総数のうち食べた分の割合。記録が無い間は null を返し、
 * 呼び出し側で「まだ出せない」と伝える。0% と書くと捨てたように見えてしまう。
 */
function consumptionStats(logs, fromIso, toIso) {
  const inRange = logs.filter((log) => log.date >= fromIso && log.date <= toIso);
  const sum = (type) => inRange
    .filter((log) => log.type === type)
    .reduce((total, log) => total + log.quantity, 0);

  const eaten = sum('EATEN');
  const discarded = sum('DISCARDED');
  const total = eaten + discarded;

  const byCategory = {};
  inRange
    .filter((log) => log.type === 'DISCARDED')
    .forEach((log) => {
      byCategory[log.category] = (byCategory[log.category] || 0) + log.quantity;
    });

  return {
    eaten,
    discarded,
    total,
    rate: total > 0 ? eaten / total : null,
    discardedByCategory: Object.entries(byCategory)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
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
