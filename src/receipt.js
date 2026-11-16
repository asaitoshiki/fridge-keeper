/* ===========================================================================
   レシートの読み取り — 読めた文字の行から、買った食材の候補を拾う。

   文字を読むのは端末の文字認識（Android のアプリ）。ここは読めた文字を受け取って、
   商品の行だけを残し、値段や合計などを落とすところ。DOM にも保存にも触れない。

   レシートの書き方は店ごとに違い、文字認識も読み違える。だから拾ったものをそのまま入れず、
   必ず一覧で見せて、入れるものを選んでもらう。ここは「打つ手間を減らす下書き」を作るだけ。
   外へは何も送らない。AI も使わない。
   =========================================================================== */

const Receipt = (function () {
  'use strict';

  /* 商品ではない行に出る語。合計・税・支払い・店の情報など */
  const SKIP_WORDS = [
    '合計', '小計', '総計', '現計', 'お預', '預り', 'お釣', '釣銭', 'おつり', '税', '対象', '内訳',
    '値引', '割引', 'クーポン', 'ポイント', 'ﾎﾟｲﾝﾄ', 'クレジット', '現金', '電子マネー', 'カード', '支払', '残高',
    '領収', 'レシート', '登録番号', '電話', 'TEL', 'ＴＥＬ', '店', '営業', 'レジ', '担当', '責任者', '責No', 'No.',
    '点数', 'お買上', '買上', 'ありがとう', 'またの', '毎度', 'いらっしゃ', '会員', 'お客様', '年', '曜',
    'http', 'www', '株式会社', '有限会社', '返品', '交換', '保管', '軽減', '※印', '*印', 'マーク',
    'レジ袋', 'ポリ袋', '袋代',
  ];

  /** 全角の英数と半角カナを、ふつうの形にそろえる。レシートは半角カナが多い */
  function clean(text) {
    return String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  /** カタカナをひらがなに。「ニンジン」と「にんじん」を同じものとして見比べるため */
  function toHiragana(text) {
    return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  /** 見比べるときの形。ひらがなにそろえ、空白と記号を落とす */
  function keyOf(text) {
    return toHiragana(clean(text)).replace(/[\s・\-ー()（）\[\]【】]/g, '').toLowerCase();
  }

  /**
   * 文字認識が返す行（{text, x, y, h}）を、紙の上の一行ずつにまとめ直す。
   * 文字認識は商品名と値段を別々の行として返すことが多いので、高さの近いものを左から右へつなぐ。
   * 位置の無い入力（ただの文字の並び）は、そのまま一行ずつとして扱う。
   */
  function toRows(lines) {
    const placed = lines.filter((l) => l && typeof l.text === 'string' && l.text.trim());
    if (placed.length === 0) return [];
    if (!placed.every((l) => Number.isFinite(l.y) && Number.isFinite(l.h))) return placed.map((l) => clean(l.text));

    const sorted = placed.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    const rows = [];
    sorted.forEach((line) => {
      const middle = line.y + line.h / 2;
      const last = rows[rows.length - 1];
      /* 行の高さの半分より近ければ、同じ行とみなす */
      if (last && Math.abs(middle - last.middle) < Math.max(last.h, line.h) * 0.55) {
        last.parts.push(line);
        last.middle = (last.middle * (last.parts.length - 1) + middle) / last.parts.length;
        last.h = Math.max(last.h, line.h);
      } else {
        rows.push({ middle, h: line.h, parts: [line] });
      }
    });
    return rows.map((row) => clean(row.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' ')));
  }

  /** 行の終わりの値段、頭の商品番号、まとめ買いの印などを取り、商品名だけにする */
  function stripDecorations(row) {
    let text = row;
    let quantity = 1;

    /* 「2コ」「2個」「×2」「2点」「@98 x 2」。数だけの行は呼び出し側で前の商品に付ける */
    const count = text.match(/(?:[x×✕*]\s*(\d{1,2})(?!\d))|(?:(\d{1,2})\s*(?:コ|個|点|ケ|本|袋|パック)(?![ぁ-んァ-ヶ一-龠]))/i);
    if (count) {
      quantity = Number(count[1] || count[2]);
      text = text.replace(count[0], ' ');
    }

    text = text
      /* 値段: ¥198 / 198円 / 198 / 1,280 と、そのあとの軽減税率の印など */
      .replace(/[¥\\￥]\s*-?[\d,]+/g, ' ')
      .replace(/-?[\d,]+\s*円/g, ' ')
      .replace(/@\s*[\d,]+/g, ' ')
      .replace(/(^|\s)-?[\d,]{2,}(?=\s*[※*軽外内非A-Za-z]?\s*$)/g, ' ')
      /* 頭の商品番号・部門番号・JAN */
      .replace(/^\s*[\d\-]{3,}\s+/, ' ')
      .replace(/^\s*\d{1,3}\s+(?=\D)/, ' ')
      /* 税の印や飾り */
      .replace(/[※*＊#]/g, ' ')
      .replace(/\s(軽|外|内|非)\s*$/g, ' ')
      .replace(/^\s*(軽|外|内)\s+/, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { text, quantity: quantity >= 1 && quantity <= 30 ? quantity : 1 };
  }

  /** 商品名として残してよいか。日本語の文字を2つ以上含み、数字や記号だけではないこと */
  function looksLikeProduct(text) {
    if (text.length < 2 || text.length > 30) return false;
    const letters = (text.match(/[ぁ-んァ-ヶ一-龠々ー]/g) || []).length;
    if (letters < 2) return false;
    const digits = (text.match(/\d/g) || []).length;
    return digits <= letters;
  }

  /**
   * 見本帳の食品と見比べて、合うものを探す。合えばその名前・絵・種類を使う。
   * レシートの名前は「国産ブタバラウスギリ」のように飾りが付くので、含んでいれば合うとみなす。
   * いちばん長く合ったものを選ぶ（「トマト」より「ミニトマト」）。
   */
  function matchFood(text, foods) {
    const key = keyOf(text);
    let best = null;
    foods.forEach((food) => {
      /* 読みが「〜にく」の食品は、「ブタバラ」「トリモモ」のように肉を省いた書き方でも合わせる */
      const short = food.kana && /にく$/.test(food.kana) && food.kana.length >= 6 ? food.kana.replace(/にく$/, '') : null;
      [food.name, food.kana, short].filter(Boolean).forEach((label) => {
        const foodKey = keyOf(label);
        if (foodKey.length < 2 || !key.includes(foodKey)) return;
        if (!best || foodKey.length > best.length) best = { food, length: foodKey.length };
      });
    });
    return best ? best.food : null;
  }

  /**
   * 読めた行から、食材の候補を作る。
   *
   * @param lines 文字認識の行。{text, x, y, h} か、文字だけの {text}
   * @param foods 見本帳（FOOD_PRESETS）
   * @returns [{name, raw, quantity, known}]  known=見本帳に合った（食べ物である見込みが高い）
   */
  function parse(lines, foods) {
    const out = [];
    toRows(lines).forEach((row) => {
      /* 数だけの行（「2コ X 単98」など）は、直前の商品の数として読む */
      const onlyCount = row.match(/^\(?\s*(\d{1,2})\s*(?:コ|個|点)\s*[x×✕*]?\s*(?:単|@)?\s*[\d,]*\s*\)?[\s\d,¥円]*$/i);
      if (onlyCount && out.length > 0) {
        out[out.length - 1].quantity = Number(onlyCount[1]);
        return;
      }
      if (SKIP_WORDS.some((word) => row.includes(word))) return;
      /* 日付・時刻・電話番号の行 */
      if (/\d{1,2}:\d{2}/.test(row) || /\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(row) || /\d{2,4}-\d{2,4}-\d{3,4}/.test(row)) return;

      const { text, quantity } = stripDecorations(row);
      if (!looksLikeProduct(text)) return;
      const food = matchFood(text, foods);
      out.push({ name: food ? food.name : text, raw: text, quantity, known: Boolean(food) });
    });

    /* 同じものが2行あれば、数を足して一つにする */
    const merged = [];
    out.forEach((entry) => {
      const same = merged.find((m) => m.name === entry.name);
      if (same) same.quantity += entry.quantity;
      else merged.push(entry);
    });
    return merged;
  }

  return { parse, toRows, clean };
})();
