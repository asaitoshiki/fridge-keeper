/* ===========================================================================
   読み取り層 — バーコードと賞味期限をカメラから読む。

   読み取った画像も文字も、この端末から出さない。
   バーコードから商品名を引く辞書も端末内に持ち、外部の商品データベースは叩かない
   （仕様書2章の「完全ローカル完結」）。

   文字認識だけは例外で、使うと決めたときに限り CDN から tesseract.js を読み込む。
   読み込むのはプログラムで、撮った画像は端末の中で処理される。押すまで何も落ちない。

   日付の読み取り規則（parseExpiry）はこのファイルの要で、
   Android へ移すときもここの規則がそのまま対応物になる。
   =========================================================================== */

const Scan = (function () {
  const OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  /* --- 使える手段を調べる ------------------------------------------------- */

  /**
   * 何が使えるかは端末と埋め込み先で変わる。
   * カメラが開けない場所でも「写真から読む」だけは残るようにしてある。
   */
  function support() {
    return {
      live: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      barcode: typeof window.BarcodeDetector === 'function',
      text: typeof window.TextDetector === 'function',
    };
  }

  /* --- JAN コード --------------------------------------------------------- */

  /**
   * JAN/EAN として筋の通った数字列か確かめる。
   * 読み取りの誤りはチェックディジットでほぼ落ちるので、
   * 怪しい数字を商品名の辞書に登録してしまう事故を防げる。
   */
  function normalizeJan(raw) {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length !== 13 && digits.length !== 8) return null;

    const body = digits.slice(0, -1).split('').map(Number);
    const check = Number(digits.slice(-1));
    /* 右端から数えて偶数桁を3倍して足す。13桁と8桁で重みの向きが同じになる */
    const sum = body
      .reverse()
      .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check ? digits : null;
  }

  /* --- 日付の読み取り ------------------------------------------------------ */

  /** 全角数字と各種の区切りを半角に寄せる。以降の規則を一通りで書けるようにする */
  function normalizeText(text) {
    return String(text)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[．。]/g, '.')
      .replace(/[－‐‑–—ー]/g, '-')
      .replace(/／/g, '/')
      .replace(/[\r\n\t]+/g, ' ');
  }

  /**
   * 日付に見える並びを拾う規則。上から順に当てて、当たった桁は空白で潰す。
   * 潰さないと 2026.10.05 の中から 26.10.05 を二重に拾ってしまう。
   */
  const PATTERNS = [
    /* 2026.10.05 / 2026年10月5日 / 2026-10-5 */
    {
      re: /(\d{4})\s*[.\-\/年]\s*(\d{1,2})\s*[.\-\/月]\s*(\d{1,2})\s*日?/g,
      build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
    },
    /* 26.10.05 — 下2桁の年。食品の印字でいちばん多い形 */
    {
      re: /(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/g,
      build: (m) => ({ year: 2000 + Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
    },
    /* 2026.10 / 2026年10月 — 日が無いときは月末まで保つという意味に読む */
    {
      re: /(\d{4})\s*[.\-\/年]\s*(\d{1,2})\s*月?/g,
      build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: null }),
    },
    /* 10.05 / 10月5日 — 年が無い。牛乳や豆腐のような短い期限の印字 */
    {
      re: /(\d{1,2})\s*[.\-\/月]\s*(\d{1,2})\s*日?/g,
      build: (m) => ({ year: null, month: Number(m[1]), day: Number(m[2]) }),
    },
  ];

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  /** 実在する日付か。2月30日のような読み取り誤りをここで落とす */
  function isRealDate(year, month, day) {
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > daysInMonth(year, month)) return false;
    return year >= 2000 && year <= 2099;
  }

  /**
   * 年が印字されていないときに年を決める。
   * 期限は過ぎているか、これから来るかのどちらかなので、
   * 今日を挟んで「少し前から1年先まで」に収まる年を選ぶ。
   */
  function guessYear(month, day, today) {
    const thisYear = Number(today.slice(0, 4));
    const candidates = [thisYear, thisYear + 1, thisYear - 1];
    const fitting = candidates
      .filter((year) => isRealDate(year, month, day))
      .map((year) => ({ year, diff: diffDays(today, isoOf(year, month, day)) }))
      .filter((x) => x.diff >= -45 && x.diff <= 365);
    if (fitting.length === 0) return null;
    /* 同じ条件に収まるなら、今日に近いほうを採る */
    fitting.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    return fitting[0].year;
  }

  function isoOf(year, month, day) {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  /**
   * 読み取った文字列から期限を取り出す。
   *
   * 候補が複数あるときは、今日以降でいちばん早い日を採る。
   * 製造日と賞味期限が並んで印字されていることがあり、
   * 遅いほうを選ぶと実際より長く保つように見せてしまうため、早いほうへ寄せる。
   *
   * 戻り値が null なのは異常ではなく「読み取れなかった」正常な状態。
   * 読み取れた場合も確定とはせず、呼び出し側が必ず人に見せて確かめる。
   */
  function parseExpiry(text, today) {
    let work = normalizeText(text);
    const found = [];

    function apply(rules) {
      rules.forEach(({ re, build }) => {
        work = work.replace(re, (whole, ...rest) => {
          const groups = [whole, ...rest.slice(0, -2)];
          const raw = build(groups);
          const year = raw.year === null ? guessYear(raw.month, raw.day, today) : raw.year;
          const day = raw.day === null && year !== null ? daysInMonth(year, raw.month) : raw.day;

          if (year !== null && day !== null && isRealDate(year, raw.month, day)) {
            found.push({ date: isoOf(year, raw.month, day), text: whole.trim() });
          }
          /* 読んだ桁は空白で潰す。長さを保って後続の規則の位置をずらさない */
          return ' '.repeat(whole.length);
        });
      });
    }

    apply(PATTERNS.slice(0, 3));
    /**
     * 年のない「10.05」は内容量の「1.5」などとも見分けが付かない。
     * 年まで入った日付が一つでも読めたときは、こちらには手を出さない。
     */
    if (found.length === 0) apply(PATTERNS.slice(3));

    if (found.length === 0) return null;

    const future = found.filter((c) => diffDays(today, c.date) >= 0);
    const pool = future.length > 0 ? future : found;
    pool.sort((a, b) => (future.length > 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));

    return {
      date: pool[0].date,
      /* 消費期限は過ぎたら食べてはいけないので、書かれていたら必ず拾う */
      expiryType: expiryTypeIn(text),
      raw: pool[0].text,
      others: pool.slice(1).map((c) => c.date),
    };
  }

  function expiryTypeIn(text) {
    if (/消費期限|消費\s*期限/.test(text)) return 'USE_BY';
    if (/賞味期限|賞味\s*期限/.test(text)) return 'BEST_BEFORE';
    return null;
  }

  /* --- カメラ ------------------------------------------------------------- */

  async function openStream() {
    /* 背面カメラを頼む。無い端末では既定のカメラにそのまま落ちる */
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }

  /** 選んだ写真を、認識にかけられる画像にする */
  function imageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('画像を読めませんでした'));
      };
      image.src = url;
    });
  }

  /**
   * 認識にかける前に画像を整える。
   * 期限の印字は小さく薄いので、長辺1600pxまで伸ばし、白黒にして濃淡を強める。
   */
  function prepare(source, width, height, forText) {
    const long = Math.max(width, height);
    const scale = forText ? Math.min(2.5, Math.max(1, 1600 / long)) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (!forText) return canvas;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      /* 中間を押し広げる。印字と地色の差が小さい写真でも輪郭が残る */
      const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
      px[i] = boosted;
      px[i + 1] = boosted;
      px[i + 2] = boosted;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  /* --- バーコードの検出 ---------------------------------------------------- */

  const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

  function barcodeDetector() {
    if (typeof window.BarcodeDetector !== 'function') return null;
    try {
      return new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    } catch (error) {
      /* 対応していない形式を渡すと例外になる端末がある。既定の形式で作り直す */
      try {
        return new window.BarcodeDetector();
      } catch (fallbackError) {
        return null;
      }
    }
  }

  async function detectBarcode(detector, source) {
    if (!detector) return null;
    try {
      const codes = await detector.detect(source);
      for (const code of codes) {
        const jan = normalizeJan(code.rawValue);
        if (jan) return jan;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /* --- 文字の検出 ---------------------------------------------------------- */

  let ocrWorker = null;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = url;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('文字認識の読み込みに失敗しました'));
      document.head.appendChild(tag);
    });
  }

  /**
   * 文字認識を用意する。押されたときに初めて読み込む。
   * 数字と区切りだけに絞ると、日付の読み違いが目に見えて減る。
   */
  async function ensureOcr(onProgress) {
    if (typeof window.Tesseract === 'undefined') {
      onProgress('文字認識を読み込んでいます…');
      await loadScript(OCR_URL);
    }
    if (!ocrWorker) {
      onProgress('文字認識を準備しています…');
      ocrWorker = await window.Tesseract.createWorker('eng', 1);
      await ocrWorker.setParameters({ tessedit_char_whitelist: '0123456789./-' });
    }
    return ocrWorker;
  }

  /** 端末が持つ文字認識。あればこちらが速く、何も落とさずに済む */
  async function detectTextNative(source) {
    if (typeof window.TextDetector !== 'function') return null;
    try {
      const blocks = await new window.TextDetector().detect(source);
      return blocks.map((block) => block.rawValue).join(' ');
    } catch (error) {
      return null;
    }
  }

  async function readText(canvas, onProgress) {
    const native = await detectTextNative(canvas);
    if (native && /\d/.test(native)) return native;

    const worker = await ensureOcr(onProgress);
    onProgress('読み取っています…');
    const result = await worker.recognize(canvas);
    return result.data.text;
  }

  return {
    support,
    normalizeJan,
    parseExpiry,
    normalizeText,
    expiryTypeIn,
    openStream,
    stopStream,
    imageFromFile,
    prepare,
    barcodeDetector,
    detectBarcode,
    readText,
    BARCODE_FORMATS,
  };
})();
