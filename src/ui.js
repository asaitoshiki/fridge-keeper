/* ===========================================================================
   画面 — 状態を描き、入力を受け取る。ロジックは domain.js に置く。
   =========================================================================== */

(function () {
  'use strict';


  let state = loadState();
  let view = 'fridge';
  /* 冷蔵庫タブの中の見せ方。図と期限順は同じ在庫の別の見え方なので、タブは分けない */
  let fridgeMode = 'figure';
  let editingLayout = false;
  /* 直前に描いたタブ。タブを変えたときだけ先頭へ戻すための覚え */
  let renderedView = null;
  /* 帯の状態。初回描画より前に置く。let は宣言行を通るまで触れられない */
  let undoState = null;
  let undoPending = false;
  let banner = null;
  let bannerTimer = null;
  /* 編集中に調整している対象。段か収納のどちらか */
  let selection = { type: 'comp', id: null };
  let kindFilter = 'ALL';
  /* 名前での絞り込み。件数が増えると、図でも一覧でも探すより打つほうが早くなる */
  let query = '';
  /* レポートで見る期間（日数） */
  let reportDays = 30;
  /* 履歴の絞り込み。ALL / EATEN / DISCARDED / DELETED */
  let historyFilter = 'ALL';
  let editingId = null;
  /* 見本帳の絞り込み。開いている間だけ使う */
  let foodsCategory = 'ALL';
  let foodsQuery = '';
  /* 読み取り中のカメラと、読めたときの行き先。閉じるときに必ず止める */
  let scanMode = null;
  let scanStream = null;
  let scanTimer = null;
  let scanDone = null;

  /* タブのアイコン。太さと大きさを揃えて、並べたときに粒が揃うようにしてある */
  const ICON_FRIDGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 10h12"/><path d="M9 6.5v2"/><path d="M9 13v2.5"/></svg>';
  const ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>';
  const ICON_BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.8 6-1.8 6h15.6S18 13.5 18 9"/><path d="M10.3 18.5a2 2 0 0 0 3.4 0"/></svg>';
  const ICON_REPORT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"/><path d="M5 19h15"/><path d="M9 16v-5"/><path d="M13.5 16V8"/><path d="M18 16v-3"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6"/></svg>';
  const ICON_CART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z"/><path d="M9 7V5.5A3 3 0 0 1 15 5.5V7"/></svg>';

  const ICON_BASKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5h17l-1.4 8.1a2 2 0 0 1-2 1.7H6.9a2 2 0 0 1-2-1.7z"/><path d="M8.5 9.5 11 4.5"/><path d="M15.5 9.5 13 4.5"/><path d="M9.5 13v3M14.5 13v3"/></svg>';
  const ICON_SCAN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8"/><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8"/><path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 8.5v7M11 8.5v7M14.5 8.5v7M17.5 8.5v7"/></svg>';

  const root = document.getElementById('app');
  const dialog = buildDialog();
  const confirmDialog = buildConfirmDialog();
  const actionDialog = buildActionDialog();
  const shareDialog = buildShareDialog();
  const scanDialog = buildScanDialog();
  const foodsDialog = buildFoodsDialog();
  const shapesDialog = buildShapesDialog();
  document.body.appendChild(dialog);
  document.body.appendChild(confirmDialog);
  document.body.appendChild(actionDialog);
  document.body.appendChild(shareDialog);
  document.body.appendChild(scanDialog);
  document.body.appendChild(foodsDialog);
  document.body.appendChild(shapesDialog);

  applyTheme();
  render();

  /* --- 描画 ------------------------------------------------------------ */

  function render() {
    const today = todayIso();
    /**
     * 描き直しでは中身を丸ごと入れ替えるので、何もしないと先頭へ飛ぶ。
     * 段を選ぶ・大きさを変えるたびに冷蔵庫の上まで戻されては、
     * 下のほうの段を触っていられない。同じタブの間は見ていた位置を保つ。
     */
    const previous = root.querySelector('.screen');
    const keepTop = previous && renderedView === view ? previous.scrollTop : 0;

    root.innerHTML = [
      appBar(),
      '<main class="screen">',
      view === 'fridge' ? summary(today) : '',
      view === 'fridge' ? streakBanner(today) : '',
      paneHead(),
      paneFor(view, today),
      view === 'fridge' || view === 'notices' ? disclaimer() : '',
      '</main>',
      quickBar(),
      bannerMarkup(),
      navBar(),
    ].join('');

    if (keepTop) {
      const screen = root.querySelector('.screen');
      if (screen) screen.scrollTop = keepTop;
    }
    renderedView = view;

    bind(today);
  }

  function kindFor(item) {
    return kindOf(state.layout, item);
  }

  function appBar() {
    return `
      <header class="appbar">
        <h1 class="wordmark">冷蔵庫<span>の地図</span></h1>
        <span class="tally">${state.items.length}</span>
      </header>`;
  }

  /** 下の固定タブ。Android 版の NavigationBar にそのまま対応する */
  function navBar() {
    const item = (key, label, icon) => `
      <button class="nav-item" type="button" data-view="${key}" aria-pressed="${view === key || (key === 'report' && view === 'history')}">
        ${icon}<span>${label}</span>
      </button>`;

    return `
      <nav class="navbar" aria-label="画面の切り替え">
        ${item('fridge', '冷蔵庫', ICON_FRIDGE)}
        ${item('shopping', '買い物', ICON_CART)}
        ${item('notices', 'お知らせ', ICON_BELL)}
        ${item('report', 'レポート', ICON_REPORT)}
        ${item('settings', '設定', ICON_GEAR)}
      </nav>`;
  }

  /** いま見ている画面の名前と、その画面だけの操作 */
  function paneHead() {
    const titles = {
      fridge: '冷蔵庫', shopping: '買い物リスト',
      notices: 'お知らせ', report: 'レポート', settings: '設定', history: '履歴',
    };

    if (view === 'report') {
      return `
        <div class="pane-head">
          <h2>${titles[view]}</h2>
          <button class="tab-action" type="button" data-view="history">履歴</button>
        </div>`;
    }
    if (view === 'history') {
      return `
        <div class="pane-head">
          <button class="tab-action back-action" type="button" data-view="report">‹ レポート</button>
          <h2>${titles[view]}</h2>
        </div>`;
    }

    if (view !== 'fridge') return `<div class="pane-head"><h2>${titles[view]}</h2></div>`;

    const seg = (key, label) =>
      `<button class="seg" type="button" data-mode="${key}" aria-pressed="${fridgeMode === key}">${label}</button>`;

    return `
      <div class="pane-head">
        <div class="segmented">${seg('figure', '図')}${seg('expiry', '期限順')}</div>
        ${/* 冷蔵庫の形は一度決めたら変えないので、入口は設定に置いてある */ ''}
        ${editingLayout
          ? `<button class="tab-action" type="button" id="toggle-layout" aria-pressed="true">編集を終える</button>`
          : ''}
      </div>`;
  }

  /**
   * 開いた瞬間に全体の状況が分かるようにする。
   * Web版では定時通知を出せないため、ここが唯一の「気づかせる」経路になる（仕様書8.3）。
   * 冷蔵庫の図を見ているときも隠れないよう、タブより上に常に置く。
   */
  function summary(today) {
    if (state.items.length === 0) return '';

    const urgent = state.items
      .map((item) => ({ item, u: urgencyOf(item, kindFor(item), today) }))
      .filter((x) => wantsNotice(x.item, x.u.days))
      .sort((a, b) => a.u.days - b.u.days);

    if (urgent.length === 0) {
      return `
        <section class="summary" data-level="NONE">
          <span class="summary-eyebrow">今日 ${formatDate(today)}</span>
          <span class="summary-head">${state.notify.daysBefore}日以内に期限を迎える食材はありません</span>
          <span class="summary-names">在庫 ${state.items.length} 件を管理中です。</span>
        </section>`;
    }

    const worst = urgent[0].u.level;
    const names = urgent.slice(0, 3).map((x) => esc(x.item.name)).join('、');
    const rest = urgent.length > 3 ? ` 他${urgent.length - 3}件` : '';
    const expired = urgent.filter((x) => x.u.days < 0).length;

    /**
     * 使い切りたいものがあるときは、押せるようにしてお知らせへ渡す。
     * ここを読んで「で、どれ」と思った先に、一件ずつ減らせる画面がある。
     */
    return `
      <button class="summary summary-link" type="button" data-view="notices" data-level="${worst}">
        <span class="summary-eyebrow">今日 ${formatDate(today)}</span>
        <span class="summary-head">使い切りたい食材が <b>${urgent.length}</b> つあります</span>
        <span class="summary-names">${names}${rest}${expired > 0 ? `／うち期限超過 ${expired}件` : ''}</span>
        <span class="summary-go">お知らせで見る</span>
      </button>`;
  }

  /**
   * 食品ロスなし継続日数。捨てた記録を入れると0に戻る。
   * 「捨てなかった」ことを積み上げて見せる、ポジティブな動機付けの数字。
   */
  function streakBanner(today) {
    if (state.items.length === 0 && state.logs.length === 0) return '';
    const days = streakDays(state.logs, state.startedAt, today);
    const best = Math.max(state.bestStreak, days);

    return `
      <section class="streak">
        <span class="streak-label">食品ロスなし</span>
        <span class="streak-days"><b>${days}</b>日</span>
        <span class="streak-best">最高 ${best}日</span>
      </section>`;
  }

  function paneFor(current, today) {
    if (current === 'fridge') return fridgeMode === 'figure' ? fridgePane(today) : listPane(today);
    if (current === 'shopping') return shoppingPane();
    if (current === 'notices') return noticesPane(today);
    if (current === 'report') return reportPane(today);
    if (current === 'history') return historyPane(today);
    return settingsPane();
  }

  /* --- 冷蔵庫の図 ------------------------------------------------------- */

  function fridgePane(today) {
    return `<div id="fridge-pane">${FridgeView.markup(state, {
      editing: editingLayout,
      selection,
      kindFor,
      today,
    })}</div>`;
  }

  /* --- 期限順リスト ----------------------------------------------------- */

  function listPane(today) {
    const needle = query.trim().toLowerCase();
    const visible = state.items
      .filter((i) => kindFilter === 'ALL' || kindFor(i) === kindFilter)
      .filter((i) => needle === '' || i.name.toLowerCase().includes(needle));
    const sorted = sortByExpiry(visible, kindFor, today);
    return searchBox() + filters() + sheet(sorted, today);
  }

  function searchBox() {
    return `
      <div class="search">
        <input type="search" id="search-input" placeholder="名前で探す" value="${esc(query)}"
               autocomplete="off" enterkeyhint="search">
        ${query.trim() === ''
          ? ''
          : '<button class="search-clear" type="button" id="search-clear" aria-label="検索を消す">✕</button>'}
      </div>`;
  }

  function filters() {
    /* 件数は検索の結果に合わせる。絞り込んだ後に「すべて9」と出ると食い違って見える */
    const needle = query.trim().toLowerCase();
    const pool = state.items.filter((i) => needle === '' || i.name.toLowerCase().includes(needle));
    const counts = { ALL: pool.length };
    Object.keys(STORAGE_LABELS).forEach((key) => {
      counts[key] = pool.filter((i) => kindFor(i) === key).length;
    });

    const chip = (key, label) => `
      <button class="chip-filter" type="button" data-filter="${key}" aria-pressed="${kindFilter === key}">
        ${label}<em>${counts[key]}</em>
      </button>`;

    return `
      <nav class="filters" aria-label="収納の種類で絞り込む">
        ${chip('ALL', 'すべて')}
        ${Object.entries(STORAGE_LABELS).map(([k, v]) => chip(k, v)).join('')}
      </nav>`;
  }

  function sheet(items, today) {
    if (items.length === 0) {
      /* 空の理由ごとに、次にできることを書く。同じ文言だと手詰まりに見える */
      let message;
      if (state.items.length === 0) {
        message = '<strong>食材がまだ登録されていません</strong>下の入力欄から入れてください。';
      } else if (query.trim() !== '') {
        message = `<strong>「${esc(query.trim())}」は見つかりません</strong>名前の一部でも探せます。`;
      } else {
        message = '<strong>ここには何もありません</strong>ほかの場所を見てください。';
      }
      return `<div class="sheet"><div class="empty">${message}</div></div>`;
    }
    return `<div class="sheet">${items.map((item) => row(item, today)).join('')}</div>`;
  }

  function row(item, today) {
    const u = urgencyOf(item, kindFor(item), today);
    const badges = [
      u.estimated && u.date ? '<span class="badge badge-estimate">目安</span>' : '',
      item.expiryType === 'USE_BY' ? '<span class="badge badge-useby">消費期限</span>' : '',
    ].join('');

    return `
      <div class="row-wrap" data-id="${item.id}">
        <div class="row-behind" aria-hidden="true">
          <span class="behind behind-eat">食べた</span>
          <span class="behind behind-off">食べきった</span>
        </div>
        <div class="row" data-level="${u.level}" data-estimated="${u.estimated}">
          <span class="row-bar" aria-hidden="true"></span>
          ${item.icon ? `<span class="row-icon" aria-hidden="true">${item.icon}</span>` : ''}
          <span class="row-main">
            <span class="row-name">${esc(item.name)}${item.quantity > 1 ? `<span class="qty">×${item.quantity}</span>` : ''}</span>
            <span class="row-meta">
              ${esc(compartmentPath(state.layout, item.compartmentId))}・${CATEGORY_LABELS[item.category]}
              ${badges}
            </span>
          </span>
          <span class="row-side">
            <span class="row-days">${remainingLabel(u.days)}</span>
            <span class="row-date">${u.date ? formatDate(u.date) : '—'}</span>
          </span>
        </div>
      </div>`;
  }

  /* --- お知らせ ----------------------------------------------------------- */

  /**
   * いま気づくべきことを一枚にまとめる。
   * Android では毎朝ここの中身をそのまま通知に出す。Web では鳴らせないので、
   * 開いたときに必ず目に入る場所として置いてある（仕様書8.3）。
   */
  function noticesPane(today) {
    const graded = state.items
      .map((item) => ({ item, u: urgencyOf(item, kindFor(item), today) }))
      .filter((x) => x.u.days !== null)
      .sort((a, b) => a.u.days - b.u.days);

    const expired = graded.filter((x) => x.u.days < 0);
    const soon = graded.filter((x) => x.u.days !== null && x.u.days >= 0 && wantsNotice(x.item, x.u.days));
    const unplaced = state.items.filter((i) => !findCompartment(state.layout, i.compartmentId));

    const group = (title, tone, entries, note) => {
      if (entries.length === 0) return '';
      return `
        <section class="notice-group" data-tone="${tone}">
          <header><h3>${title}</h3><span>${entries.length}件</span></header>
          ${note ? `<p>${note}</p>` : ''}
          <ul>
            ${entries.map((x) => `
              <li>
                <span>${esc(x.item.name)}</span>
                <em>${remainingLabel(x.u.days)}${x.u.estimated ? '（目安）' : ''}</em>
              </li>`).join('')}
          </ul>
        </section>`;
    };

    const nothing = expired.length === 0 && soon.length === 0 && unplaced.length === 0;

    return `
      <div class="notices">
        ${nothing ? '<p class="notices-empty">いま気にすることはありません。</p>' : ''}
        ${group('期限を過ぎています', 'critical', expired,
          '見た目とにおいを確かめてから判断してください。消費期限のものは食べないでください。')}
        ${/* 食材ごとに日数を変えられるので、見出しに全体の設定値は出さない */ ''}
        ${group('もうすぐ期限を迎えます', 'warn', soon, '')}
        ${unplaced.length > 0 ? `
          <section class="notice-group" data-tone="plain">
            <header><h3>まだ冷蔵庫に入れていません</h3><span>${unplaced.length}件</span></header>
            <p>入れる場所を決めると、期限の目安が付きます。</p>
            <ul>${unplaced.map((i) => `<li><span>${esc(i.name)}</span><em>未収納</em></li>`).join('')}</ul>
          </section>` : ''}

        <p class="notices-note">
          Android 版ではこの内容を毎朝 ${state.notify.time} に1通だけ通知します。
          通知の時刻と日数は設定から変えられます。
        </p>
      </div>`;
  }

  /* --- 履歴 ------------------------------------------------------------- */

  const HISTORY_LABELS = { EATEN: '食べた', DISCARDED: '捨てた', DELETED: '削除' };
  const HISTORY_FILTERS = [['ALL', 'すべて'], ['EATEN', '食べた'], ['DISCARDED', '捨てた'], ['DELETED', '削除']];

  /**
   * 食べた・捨てた・削除の記録を新しい順に並べ、一件ずつ取り消せるようにする。
   * 取り消しの帯は数秒で消えるので、あとから押し間違いに気づいたときの戻り道がここ。
   */
  function historyPane(today) {
    const logs = state.logs
      .filter((log) => historyFilter === 'ALL' || log.type === historyFilter)
      .slice()
      .sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date));

    const filters = `
      <div class="seg seg-wrap history-filter">
        ${HISTORY_FILTERS.map(([key, label]) => `
          <button class="seg-btn" type="button" data-history-filter="${key}" aria-pressed="${historyFilter === key}">${label}</button>`).join('')}
      </div>`;

    if (logs.length === 0) {
      return `${filters}<p class="report-empty">まだ記録がありません。食べた・捨てた・削除した食材がここに並び、あとから取り消せます。</p>`;
    }

    const yesterday = addDays(today, -1);
    const dayLabel = (date) => (date === today ? '今日' : date === yesterday ? '昨日' : formatDate(date));
    const groups = [];
    logs.forEach((log) => {
      const last = groups[groups.length - 1];
      if (last && last.date === log.date) last.logs.push(log);
      else groups.push({ date: log.date, logs: [log] });
    });

    return `
      ${filters}
      <p class="hint history-hint">押し間違えたものは「取り消す」で在庫に戻せます。</p>
      ${groups.map((group) => `
        <section class="history-day">
          <h3 class="history-date">${dayLabel(group.date)}</h3>
          <ul class="history-list">
            ${group.logs.map(historyRow).join('')}
          </ul>
        </section>`).join('')}`;
  }

  function historyRow(log) {
    const icon = (log.item && log.item.icon) || iconForName(log.name);
    const time = log.at ? new Date(log.at).toTimeString().slice(0, 5) : '';
    const action = log.type === 'EATEN' && log.item && log.quantity >= log.item.quantity ? '食べきった' : HISTORY_LABELS[log.type];
    return `
      <li class="history-row" data-type="${log.type}">
        <span class="history-icon" aria-hidden="true">${icon}</span>
        <span class="history-main">
          <span class="history-name">${esc(log.name)}</span>
          <span class="history-meta"><b>${action}</b>${log.quantity > 1 ? ` ×${log.quantity}` : ''}${time ? `・${time}` : ''}</span>
        </span>
        <button class="mini" type="button" data-revert="${log.id}">取り消す</button>
      </li>`;
  }

  /**
   * 記録を一件取り消す。食材は在庫に戻り、記録は消える。
   * 食材がまだ在庫にあれば数を足し、もう無ければ記録したときの姿で戻す。
   * 捨てた記録を消せば、食品ロスなしの日数もその分さかのぼって戻る。
   */
  function revertLog(logId) {
    const log = state.logs.find((l) => l.id === logId);
    if (!log) return;
    const label = log.type === 'DELETED' ? '削除' : HISTORY_LABELS[log.type];

    askConfirm(`「${log.name}を${label}」を取り消しますか`, `${log.name}${log.quantity > 1 ? `（${log.quantity}）` : ''}が在庫に戻ります。`, () => {
      const existing = log.itemId ? state.items.find((i) => i.id === log.itemId) : null;
      if (existing) {
        existing.quantity += log.quantity;
      } else {
        const base = log.item ? JSON.parse(JSON.stringify(log.item)) : {
          id: newId('item'),
          name: log.name,
          category: log.category,
          icon: iconForName(log.name),
          compartmentId: null,
          expiryType: 'BEST_BEFORE',
          expiryDate: null,
          registeredAt: log.date,
          janCode: null,
          memo: null,
          notifyDaysBefore: null,
          notifyTime: null,
        };
        base.quantity = log.quantity;
        /* 置いていた段が今はもう無ければ、「買ってきたもの」に戻す */
        if (!findCompartment(state.layout, base.compartmentId)) base.compartmentId = null;
        state.items.push(base);
      }
      state.logs = state.logs.filter((l) => l.id !== logId);
      saveState(state);
      render();
      toast(`${log.name}を在庫に戻しました`);
    }, '取り消す');
  }

  /* --- レポート ----------------------------------------------------------- */

  const REPORT_RANGES = [[7, '7日'], [30, '30日'], [90, '90日']];

  function reportPane(today) {
    const days = streakDays(state.logs, state.startedAt, today);
    const best = Math.max(state.bestStreak, days);
    const stats = consumptionStats(state.logs, addDays(today, -(reportDays - 1)), today);

    return `
      <div class="report">
        <section class="hero">
          <span class="hero-label">食品ロスなし</span>
          <span class="hero-number">${days}<i>日</i></span>
          <span class="hero-sub">最高記録 ${best}日</span>
        </section>

        <div class="report-head-row">
          <h3 class="report-head">直近${reportDays}日</h3>
          <div class="seg">
            ${REPORT_RANGES.map(([value, label]) => `
              <button class="seg-btn" type="button" data-range="${value}" aria-pressed="${reportDays === value}">${label}</button>`).join('')}
          </div>
        </div>
        ${stats.total === 0
          ? '<p class="report-empty">まだ記録がありません。食べた・捨てたを記録すると、ここに出ます。</p>'
          : `
            <div class="stats">
              <div class="stat"><span>食べた</span><b>${stats.eaten}</b></div>
              <div class="stat"><span>捨てた</span><b>${stats.discarded}</b></div>
              <div class="stat"><span>食べきり率</span><b>${Math.round(stats.rate * 100)}<i>%</i></b></div>
            </div>
            ${discardChart(stats.discardedByCategory)}`}
      </div>`;
  }

  /**
   * 捨てたものの内訳。
   * 一つの量を並べて比べるだけなので、棒は一色で足りる。
   * 期限の警告に使う赤・橙・黄はここでも使わない。あれは緊急度だけの色で、
   * 統計の棒に混ぜると「この棒は危ない」と読めてしまう。
   */
  function discardChart(rows) {
    if (rows.length === 0) return '';
    const max = Math.max(...rows.map((row) => row.count));

    return `
      <section class="chart">
        <h4>捨てたものの内訳</h4>
        <ul class="bars">
          ${rows.map((row) => `
            <li>
              <span class="bar-label">${CATEGORY_LABELS[row.category]}</span>
              <span class="bar-track">
                <span class="bar-fill" style="width:${Math.max(4, (row.count / max) * 100)}%"></span>
              </span>
              <span class="bar-value">${row.count}</span>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  /* --- 設定 --------------------------------------------------------------- */

  function settingsPane() {
    const ai = AiAssist.loadSettings();
    const remembered = Object.keys(state.janNames).length;
    const themeOption = (value, label) => `
      <button class="seg-btn" type="button" data-theme="${value}" aria-pressed="${state.theme === value}">${label}</button>`;

    return `
      <div class="settings-pane">
        <section class="settings-block">
          <h3>表示</h3>
          <div class="field-row">
            <span>配色</span>
            <div class="seg">
              ${themeOption('auto', '端末に合わせる')}
              ${themeOption('light', 'ライト')}
              ${themeOption('dark', 'ダーク')}
            </div>
          </div>
        </section>

        <section class="settings-block">
          <h3>お知らせ</h3>
          <label class="check-row">
            <input type="checkbox" id="notify-enabled" ${state.notify.enabled ? 'checked' : ''}>
            <span>期限が近いものを知らせる</span>
          </label>
          <div class="field-row">
            <span>時刻</span>
            <input type="time" id="notify-time" value="${state.notify.time}">
          </div>
          <div class="field-row">
            <span>何日前</span>
            <input type="number" id="notify-days" min="0" max="14" value="${state.notify.daysBefore}">
          </div>
          <p class="hint">
            Web 版では通知を鳴らせません。この設定は Android 版で使われます。
            通知は届かないことがあるので、アプリを開けば必ず状況が分かる作りにしてあります。
          </p>
        </section>

        <section class="settings-block">
          <h3>AI での入力補助</h3>
          <p class="warn">
            このアプリは端末内で完結し、データを外へ出しません。
            AI を有効にすると、入力した食品名が下の接続先へ送られます。
            既定は無効で、有効にしない限り通信は起きません。
          </p>
          <label class="check-row">
            <input type="checkbox" id="ai-enabled" ${ai.enabled ? 'checked' : ''}>
            <span>AI を有効にする</span>
          </label>
          <div class="field">
            <label for="ai-endpoint">接続先</label>
            <input id="ai-endpoint" type="url" placeholder="https://..." value="${esc(ai.endpoint)}" autocomplete="off">
          </div>
          <div class="field">
            <label for="ai-model">モデル</label>
            <input id="ai-model" type="text" value="${esc(ai.model)}" autocomplete="off">
          </div>
          <div class="field">
            <label for="ai-key">APIキー</label>
            <input id="ai-key" type="password" value="${esc(ai.apiKey)}" autocomplete="off">
          </div>
          <p class="hint">通信部分はまだ実装されていないため、有効にしても動作しません。</p>
        </section>

        <button class="btn btn-primary" type="button" id="save-settings">設定を保存する</button>

        <section class="settings-block">
          <h3>免責事項</h3>
          <p class="hint">
            本アプリが表示する期限および目安日数は一般的な参考情報であり、食品の実際の安全性を
            保証するものではありません。実際の日持ちは、購入時の鮮度・開封の有無・保管温度等により
            大きく変動します。喫食の可否は、必ずご自身で食品の状態（見た目・におい等）を確認して
            ご判断ください。また、端末の状態により通知が遅延・不達となる場合があり、通知の到達
            およびデータの保全を保証するものではありません。
            本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を負いません。
          </p>
        </section>

        <section class="settings-block">
          <h3>冷蔵庫の中の分け方</h3>
          <div class="seg seg-wrap">
            ${Object.entries(LAYOUT_MODE_LABELS).map(([key, label]) => `
              <button class="seg-btn" type="button" data-layout-mode="${key}"
                      aria-pressed="${state.layoutMode === key}">${label}${key === 'ZONES' ? '（おすすめ）' : ''}</button>`).join('')}
          </div>
          ${state.layoutMode === 'ZONES' ? `
          <p class="hint">
            冷蔵・野菜室・冷凍・常温の4つに分けます。期限の目安が変わるのはこの区分だけなので、
            ふだんはこれで足ります。登録のときに段を選ぶ手間もかかりません。
          </p>
          <p class="hint">「段まで細かく」にすると、棚やドアポケット、扉の開き方まで実物に合わせて描けます。</p>
          ` : `
          <p class="hint">
            段の数・名前・大きさ・色・扉・ドアポケットを変えられます。
            冷蔵庫は買い替えるまで変わらないので、最初に一度だけ整えておけば足ります。
            「温度帯だけ」に戻しても、この形は控えておくので、あとでそのまま戻せます。
          </p>
          <div class="settings-actions">
            <button class="btn btn-ghost" type="button" id="edit-layout">冷蔵庫の形を変える</button>
            <button class="btn btn-ghost" type="button" id="pick-shape">型から選ぶ</button>
          </div>
          <div class="unit-doors">
            ${state.layout.map((u) => `
              <div class="unit-door-row">
                <span class="unit-door-name">${esc(u.name)}<em>${u.compartments.length}段</em></span>
                <div class="seg seg-wrap">
                  ${Object.entries(DOOR_STYLE_LABELS).map(([key, label]) => `
                    <button class="seg-btn" type="button" data-set-door="${u.id}" data-door-value="${key}"
                            aria-pressed="${u.doorStyle === key}">${label}</button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <p class="hint">扉は開けた状態で図に描きます。扉の無い棚やラックは「開かない」にします。</p>
          `}
        </section>

        <section class="settings-block">
          <h3>データ</h3>
          <p class="hint">
            データはこの端末の中だけに保存されます。機種変更やブラウザのデータ削除で消えるので、
            控えを取っておくと戻せます。
          </p>
          <div class="settings-actions">
            <button class="btn btn-ghost" type="button" id="export-data">控えを書き出す</button>
            <label class="btn btn-ghost" for="import-data">控えから戻す</label>
            <input type="file" id="import-data" accept="application/json,.json" hidden>
          </div>
          <div class="settings-actions">
            ${state.sampleLoaded
              ? '<button class="btn btn-ghost" type="button" id="clear-sample">サンプルデータを消す</button>'
              : ''}
            <button class="btn btn-danger-outline" type="button" id="wipe-data">すべてのデータを消す</button>
          </div>
        </section>

        <section class="settings-block">
          <h3>覚えたバーコード</h3>
          <p class="hint">
            ${remembered === 0
              ? 'まだありません。バーコードを読んで商品名を入れると、次から名前が入るようになります。'
              : `${remembered}件の商品名を覚えています。外部へ問い合わせず、この端末の中だけで引いています。`}
          </p>
          ${remembered > 0
            ? '<div class="settings-actions"><button class="btn btn-ghost" type="button" id="clear-jan">覚えたものを消す</button></div>'
            : ''}
        </section>

        <section class="settings-block">
          <h3>このアプリについて</h3>
          <dl class="about">
            <dt>名前</dt><dd>冷蔵庫の地図</dd>
            <dt>版</dt><dd>${APP_VERSION}</dd>
            <dt>保存先</dt><dd>この端末の中だけ（外部送信なし）</dd>
            <dt>在庫</dt><dd>${state.items.length}件／記録 ${state.logs.length}件</dd>
            <dt>利用開始</dt><dd>${formatDate(state.startedAt)}</dd>
          </dl>
          <p class="hint">
            <a href="https://github.com/asaitoshiki/fridge-keeper" target="_blank" rel="noopener">ソースコード</a>
          </p>
        </section>
      </div>`;
  }

  /* --- 買い物リスト ------------------------------------------------------ */

  function shoppingPane() {
    const rows = state.shopping.map((entry) => `
      <label class="buy-row${entry.done ? ' is-done' : ''}">
        <input type="checkbox" data-buy-toggle="${entry.id}" ${entry.done ? 'checked' : ''}>
        <span>${esc(entry.name)}</span>
        <button class="buy-remove" type="button" data-buy-remove="${entry.id}" aria-label="${esc(entry.name)}を消す">✕</button>
      </label>`).join('');

    return `
      <section class="buy">
        <form class="buy-add" id="buy-form">
          <input type="text" id="buy-input" placeholder="買うものを足す" autocomplete="off">
          <button class="btn btn-primary" type="submit">追加</button>
        </form>
        ${state.shopping.length === 0
          ? '<p class="buy-empty">買うものを書いておくと、まとめて家族へ送れます。</p>'
          : `<div class="buy-list">${rows}</div>`}
        <div class="buy-actions">
          <button class="btn btn-ghost" type="button" id="clear-bought" ${state.shopping.some((e) => e.done) ? '' : 'disabled'}>
            買ったものを消す
          </button>
          <button class="btn btn-ghost" type="button" id="clear-shopping" ${state.shopping.length === 0 ? 'disabled' : ''}>
            全部消す
          </button>
        </div>

        <div class="buy-share">
          <h3>家族に送る</h3>
          <p>LINE やメールなど、ふだん使っているもので送れます。送り先はこの端末が選ぶので、
             アプリが外部へデータを預けることはありません。</p>
          <div class="buy-actions">
            <button class="btn btn-primary" type="button" id="share-shopping" ${state.shopping.length === 0 ? 'disabled' : ''}>
              買い物リストを送る
            </button>
            <button class="btn btn-primary" type="button" id="share-fridge">冷蔵庫の地図を送る</button>
          </div>
        </div>
      </section>`;
  }

  /* --- 共有 --------------------------------------------------------------- */

  /**
   * 家族への共有は、自前のサーバーを持たずに済ませる。
   *
   * 共有シートが開けるかは端末と埋め込み先で変わるので、片方だけに賭けない。
   * 文面をその場に出し、「送る」でも「コピー」でも、最後は選んで手で写してでも
   * 渡せるようにしてある。
   */
  function openShare(title, text) {
    const area = shareDialog.querySelector('#share-text');
    shareDialog.querySelector('#share-title').textContent = title;
    /* 共有シートが無い端末で押せない「送る」を見せても仕方がない */
    shareDialog.querySelector('#share-send').hidden = !navigator.share;
    /* 「送る」を伏せたときは「コピー」が主役になる。主役のない画面を出さない */
    const copy = shareDialog.querySelector('#share-copy');
    copy.classList.toggle('btn-primary', !navigator.share);
    copy.classList.toggle('btn-ghost', Boolean(navigator.share));
    setShareLead(navigator.share
      ? 'そのまま送るか、コピーして貼り付けてください。'
      : 'この文面をコピーして、LINE やメールに貼り付けてください。');
    area.value = text;
    shareDialog.dataset.title = title;
    shareDialog.showModal();
    area.select();
  }

  async function sendShare() {
    const text = shareDialog.querySelector('#share-text').value;
    try {
      await navigator.share({ title: shareDialog.dataset.title, text });
      shareDialog.close();
    } catch (error) {
      /* 送るのをやめただけなら何も言わない。本当に開けなかったときだけ道を示す */
      if (error && error.name === 'AbortError') return;
      setShareLead('この端末では共有シートを開けませんでした。コピーして貼り付けてください。');
    }
  }

  function setShareLead(message) {
    shareDialog.querySelector('#share-lead').textContent = message;
  }

  function fridgeShareText(today) {
    const urgent = state.items
      .map((item) => ({ item, u: urgencyOf(item, kindFor(item), today) }))
      .filter((x) => wantsNotice(x.item, x.u.days))
      .sort((a, b) => a.u.days - b.u.days);

    const lines = [`冷蔵庫の地図（${formatDate(today)}）`, ''];
    if (urgent.length === 0) {
      lines.push('急いで使い切るものはありません。');
    } else {
      lines.push('早めに使い切りたいもの');
      urgent.forEach((x) => {
        lines.push(`・${x.item.name}（${remainingLabel(x.u.days)}${x.u.estimated ? '／目安' : ''}）`);
      });
    }
    lines.push('', `在庫 ${state.items.length} 件`);
    return lines.join('\n');
  }

  function shoppingShareText() {
    const pending = state.shopping.filter((entry) => !entry.done);
    return ['買い物リスト', '', ...pending.map((entry) => `・${entry.name}`)].join('\n');
  }

  function toast(message) {
    armBanner(message, false);
    render();
  }

  /* --- 共通パーツ ------------------------------------------------------- */

  function disclaimer() {
    return `
      <section class="disclaimer">
        <h2>免責</h2>
        本アプリが表示する期限および目安日数は一般的な参考情報であり、食品の実際の安全性を保証するものではありません。
        実際の日持ちは、購入時の鮮度・開封の有無・保管温度等により大きく変動します。
        喫食の可否は、必ずご自身で食品の状態（見た目・におい等）を確認してご判断ください。
        本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を負いません。
      </section>`;
  }

  /**
   * 買ってきたものを次々に放り込むための入り口。
   * 親指の届く下端に置き、よく買うものはタップだけで入るようにする。
   * まず「買ってきたもの」に溜まり、どの段へ入れるかは後から図の上で決められる。
   */
  function quickBar() {
    if (editingLayout || view !== 'fridge') return '';

    const names = templateNames();
    const chips = names.map((name) =>
      `<button class="quick-chip" type="button" data-quick="${esc(name)}">${esc(name)}</button>`).join('');

    return `
      <div class="quickbar">
        ${names.length > 0 ? `<div class="quick-templates">${chips}</div>` : ''}
        <form class="quick-add" id="quick-form">
          <input type="text" id="quick-input" placeholder="買ってきたものを入れる" autocomplete="off">
          <button class="quick-scan" type="button" id="quick-foods" aria-label="よく使う食品から選ぶ">${ICON_BASKET}</button>
          <button class="quick-scan" type="button" id="quick-barcode" aria-label="バーコードを読む">${ICON_SCAN}</button>
          <button class="quick-go" type="submit" aria-label="入れる">入れる</button>
          <button class="quick-more" type="button" id="open-full" aria-label="詳しく入力">詳しく</button>
        </form>
      </div>`;
  }

  /** よく買うもの。履歴がなければ、いま入っているものから拾う */
  function templateNames() {
    if (state.templates.length > 0) return state.templates.slice(0, 6);
    return [...new Set(state.items.map((item) => item.name))].slice(0, 6);
  }

  /* --- 操作 ------------------------------------------------------------ */

  function bind(today) {
    root.querySelectorAll('[data-view]').forEach((el) => {
      el.addEventListener('click', () => {
        view = el.dataset.view;
        editingLayout = false;
        render();
      });
    });

    const toggle = root.querySelector('#toggle-layout');
    if (toggle) {
      toggle.addEventListener('click', () => {
        editingLayout = !editingLayout;
        /* 編集に入ったら最初の段を選んでおく。何も選ばれていない画面は用が無い */
        if (editingLayout) selection = { type: 'comp', id: firstCompartmentId() };
        render();
      });
    }

    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        kindFilter = el.dataset.filter;
        render();
      });
    });

    root.querySelectorAll('.row-wrap').forEach(attachSwipe);

    const addButton = root.querySelector('#add-item');
    if (addButton) addButton.addEventListener('click', () => openEditor(null));

    const undoButton = root.querySelector('#undo-button');
    if (undoButton) undoButton.addEventListener('click', undo);

    root.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        fridgeMode = el.dataset.mode;
        editingLayout = false;
        render();
      });
    });

    bindSettings();

    const saveSettings = root.querySelector('#save-settings');
    if (saveSettings) {
      saveSettings.addEventListener('click', () => {
        state.notify = {
          enabled: root.querySelector('#notify-enabled').checked,
          time: root.querySelector('#notify-time').value || '08:00',
          daysBefore: Math.min(14, Math.max(0, Number(root.querySelector('#notify-days').value) || 0)),
        };
        AiAssist.saveSettings({
          enabled: root.querySelector('#ai-enabled').checked,
          endpoint: root.querySelector('#ai-endpoint').value.trim(),
          model: root.querySelector('#ai-model').value.trim(),
          apiKey: root.querySelector('#ai-key').value,
        });
        saveState(state);
        render();
        toast('設定を保存しました');
      });
    }

    const quickForm = root.querySelector('#quick-form');
    if (quickForm) {
      quickForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = root.querySelector('#quick-input');
        const name = input.value.trim();
        if (!name) return;
        input.value = '';
        quickAdd(name);
      });
    }

    root.querySelectorAll('[data-quick]').forEach((el) => {
      el.addEventListener('click', () => quickAdd(el.dataset.quick));
    });

    const openFull = root.querySelector('#open-full');
    if (openFull) openFull.addEventListener('click', () => openEditor(null));

    const quickFoods = root.querySelector('#quick-foods');
    if (quickFoods) quickFoods.addEventListener('click', openFoods);

    const quickBarcode = root.querySelector('#quick-barcode');
    if (quickBarcode) {
      quickBarcode.addEventListener('click', () => {
        openScan('barcode', (result) => applyJan(result.jan));
      });
    }

    const buyForm = root.querySelector('#buy-form');
    if (buyForm) {
      buyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = root.querySelector('#buy-input');
        const name = input.value.trim();
        if (!name) return;
        state.shopping.push({ id: newId('buy'), name, done: false });
        input.value = '';
        saveState(state);
        render();
      });
    }

    root.querySelectorAll('[data-buy-toggle]').forEach((el) => {
      el.addEventListener('change', () => {
        const entry = state.shopping.find((e) => e.id === el.dataset.buyToggle);
        entry.done = el.checked;
        saveState(state);
        render();
      });
    });

    root.querySelectorAll('[data-buy-remove]').forEach((el) => {
      el.addEventListener('click', () => {
        state.shopping = state.shopping.filter((e) => e.id !== el.dataset.buyRemove);
        saveState(state);
        render();
      });
    });

    const shareShopping = root.querySelector('#share-shopping');
    if (shareShopping) {
      shareShopping.addEventListener('click', () => openShare('買い物リスト', shoppingShareText()));
    }

    /* 打つたびに描き直すと入力が飛ぶので、値を覚えて焦点と位置だけ戻す */
    const search = root.querySelector('#search-input');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        const at = search.selectionStart;
        render();
        const next = root.querySelector('#search-input');
        if (next) {
          next.focus();
          next.setSelectionRange(at, at);
        }
      });
    }

    const searchClear = root.querySelector('#search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        query = '';
        render();
      });
    }

    root.querySelectorAll('[data-history-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        historyFilter = el.dataset.historyFilter;
        render();
      });
    });
    root.querySelectorAll('[data-revert]').forEach((el) => {
      el.addEventListener('click', () => revertLog(el.dataset.revert));
    });

    root.querySelectorAll('[data-range]').forEach((el) => {
      el.addEventListener('click', () => {
        reportDays = Number(el.dataset.range);
        render();
      });
    });

    const clearShopping = root.querySelector('#clear-shopping');
    if (clearShopping) {
      clearShopping.addEventListener('click', () => {
        askConfirm('買い物リストを全部消しますか', `${state.shopping.length}件が消えます。`, () => {
          state.shopping = [];
          saveState(state);
          render();
        });
      });
    }

    const clearBought = root.querySelector('#clear-bought');
    if (clearBought) {
      clearBought.addEventListener('click', () => {
        state.shopping = state.shopping.filter((e) => !e.done);
        saveState(state);
        render();
      });
    }

    const shareFridge = root.querySelector('#share-fridge');
    if (shareFridge) {
      shareFridge.addEventListener('click', () => openShare('冷蔵庫の地図', fridgeShareText(today)));
    }

    const clear = root.querySelector('#clear-sample');
    if (clear) {
      clear.addEventListener('click', () => {
        state.items = state.items.filter((i) => !i.sample);
        state.sampleLoaded = false;
        commit();
      });
    }

    const pane = root.querySelector('#fridge-pane');
    if (pane) {
      FridgeView.bind(pane, state, {
        editing: editingLayout,
        selection,
        kindFor,
        today,
        onMove: moveItem,
        onOpenItem: openActions,
        onRedraw: render,
        onLayout: applyLayout,
        onSelect: select,
        onAddCompartment: addCompartment,
        onAddCompartmentNear: addCompartmentNear,
        onAddUnit: addUnit,
        onDeleteCompartment: deleteCompartment,
        onDeleteUnit: deleteUnit,
        onTogglePockets: togglePockets,
        onDeleteDoor: deleteDoor,
        onAddPocket: addPocket,
      });
    }
  }

  function commit() {
    /* 帯は描く前に決める。描いたあとに足すと、もう一度描き直すことになる */
    if (undoPending && undoState) {
      undoPending = false;
      armBanner(undoState.message, true);
    }
    saveState(state);
    render();
  }

  function firstCompartmentId() {
    const all = state.layout.flatMap((unit) => unit.compartments);
    return all.length > 0 ? all[0].id : null;
  }

  function select(type, id) {
    selection = { type, id };
    render();
  }

  /**
   * ドアポケットの有り無し。
   * 無しにすると扉の板ごと消えるので、中の食材がどうなるかを先に見せてから消す。
   */
  function togglePockets(unitId, on) {
    const unit = state.layout.find((u) => u.id === unitId);
    if (!unit) return;
    const pockets = unit.compartments.filter((c) => c.form === 'POCKET');

    if (on) {
      if (pockets.length > 0) return;
      unit.compartments.unshift(comp(newId('c'), 'ドアポケット', 'FRIDGE', 'POCKET', 100, 44));
      selection = { type: 'unit', id: unitId };
      commit();
      return;
    }

    if (pockets.length === 0) return;
    const ids = pockets.map((c) => c.id);
    const inside = state.items.filter((i) => ids.includes(i.compartmentId)).length;
    askConfirm(
      'ドアポケットを無しにしますか',
      inside > 0
        ? `ドアポケット${pockets.length}段が消えます。中の${inside}件は「買ってきたもの」に戻ります。`
        : `ドアポケット${pockets.length}段が消えます。`,
      () => {
        releaseItemsIn(ids);
        unit.compartments = unit.compartments.filter((c) => c.form !== 'POCKET');
        selection = { type: 'unit', id: unitId };
        commit();
      },
      '無しにする',
    );
  }

  /**
   * 開いた扉を一枚外す。その扉の内側のポケットも一緒に消える。
   * 2ドア・3ドアでは選んだ扉だけを外し、ほかの扉は残す。
   * 最後の扉を外したときだけ、収納を「開かない」にする。設定からいつでも戻せる。
   */
  function deleteDoor(unitId, firstId) {
    const unit = state.layout.find((u) => u.id === unitId);
    if (!unit) return;
    const section = FridgeView.doorSectionOf(unit, firstId);
    if (!section) return;
    const pockets = section.pockets;
    const ids = pockets.map((c) => c.id);
    const inside = state.items.filter((i) => ids.includes(i.compartmentId)).length;
    const doors = FridgeView.sections(unit.compartments)
      .filter((s) => s.type === 'door' && FridgeView.sectionHasDoor(s));
    const lastDoor = doors.length <= 1;

    const lines = [];
    if (pockets.length > 0) lines.push(`この扉のポケット${pockets.length}段も消えます。`);
    if (inside > 0) lines.push(`中の${inside}件は「買ってきたもの」に戻ります。`);
    lines.push(lastDoor
      ? 'あとで「開き方」を選べば扉を付け直せます。'
      : 'ほかの扉はそのまま残ります。棚をタップすると扉を付け直せます。');

    askConfirm(lastDoor ? `${unit.name}の扉を外しますか` : `${unit.name}のこの扉を外しますか`, lines.join(''), () => {
      releaseItemsIn(ids);
      const rest = section.items.filter((c) => c.form !== 'POCKET');
      /* 扉の区切りの印がポケットに付いていたら、残る段へ引き継いで、上の扉とつながらないようにする */
      if (rest.length > 0 && section.items[0].newDoor) rest[0].newDoor = true;
      section.items.forEach((c) => { c.doorHeight = null; c.noDoor = false; });
      unit.compartments = unit.compartments.filter((c) => !ids.includes(c.id));

      if (lastDoor) {
        unit.compartments.forEach((c) => { c.noDoor = false; });
        unit.doorStyle = 'NONE';
      } else if (rest.length > 0) {
        rest[0].noDoor = true;
      }
      selection = { type: 'unit', id: unitId };
      commit();
    }, '外す');
  }

  /**
   * 扉の内側にポケットを一段足す。
   * where が 'end' なら、その扉のポケットの一番下に足す。省くと扉の一番上に入れる。
   * side は観音開きのとき、どちらの扉に付けるか。
   */
  function addPocket(unitId, firstId, where, side) {
    const unit = state.layout.find((u) => u.id === unitId);
    if (!unit) return;
    const created = comp(newId('c'), 'ポケット', 'FRIDGE', 'POCKET', 100, 44);
    /* 観音開きでは、押した側の扉に付ける */
    created.side = side || null;
    const section = FridgeView.doorSectionOf(unit, firstId);
    const lastPocket = section && section.pockets[section.pockets.length - 1];

    if (where === 'end' && lastPocket) {
      const at = unit.compartments.findIndex((c) => c.id === lastPocket.id);
      unit.compartments.splice(at + 1, 0, created);
    } else {
      let index = unit.compartments.findIndex((c) => c.id === (section ? section.items[0].id : firstId));
      if (index < 0) index = 0;
      const first = unit.compartments[index];
      /* 扉の始まりの印と、外した・高さの印は先頭の段が持つので、新しい先頭へ引き継ぐ */
      if (first) {
        created.newDoor = first.newDoor;
        created.doorHeight = first.doorHeight;
        created.noDoor = first.noDoor;
        first.newDoor = false;
        first.doorHeight = null;
        first.noDoor = false;
      }
      unit.compartments.splice(index, 0, created);
    }
    selection = { type: 'comp', id: created.id };
    commit();
  }

  /**
   * 選んだ段のすぐ上か下に段を足す。
   * 一番下にしか足せないと、上段の間に棚を一枚入れたいだけでも並べ替えが要る。
   * 形と種類は隣の段に合わせる。扉の中に足せば扉の段、引き出しの並びなら引き出し。
   */
  function addCompartmentNear(compartmentId, where) {
    const unit = findUnitOf(state.layout, compartmentId);
    if (!unit) return;
    const index = unit.compartments.findIndex((c) => c.id === compartmentId);
    const neighbour = unit.compartments[index];
    const created = comp(newId('c'), '新しい段', neighbour.kind, neighbour.form,
      100, neighbour.form === 'POCKET' ? 44 : 68);

    /**
     * 観音開きのポケットは左右交互に振り分けて描くので、間に足すと後ろのポケットが反対の扉へずれる。
     * 足す前に今の左右を書き留め、新しい段は隣と同じ扉に付ける。
     */
    if (neighbour.form === 'POCKET' && unit.doorStyle === 'FRENCH') {
      const section = FridgeView.doorSectionOf(unit, neighbour.id);
      if (section) {
        section.pockets.forEach((c, i) => { c.side = c.side || (i % 2 === 0 ? 'left' : 'right'); });
      }
      created.side = neighbour.side;
    }

    if (where === 'before') {
      /* 扉の一番上の段の上に足すときは、扉の始まりを新しい段へ引き継ぐ */
      if (neighbour.newDoor) {
        created.newDoor = true;
        neighbour.newDoor = false;
      }
      unit.compartments.splice(index, 0, created);
    } else {
      unit.compartments.splice(index + 1, 0, created);
    }
    selection = { type: 'comp', id: created.id };
    commit();
  }

  function addCompartment(unitId) {
    const unit = state.layout.find((u) => u.id === unitId);
    const created = comp(newId('c'), '新しい段', 'FRIDGE', 'SHELF', 100, 68);
    unit.compartments.push(created);
    selection = { type: 'comp', id: created.id };
    commit();
  }

  function addUnit() {
    const created = makeUnit({
      name: '新しい収納',
      type: 'SHELF',
      compartments: [comp(newId('c'), '棚', 'ROOM_TEMP', 'SHELF', 100, 68)],
    });
    state.layout.push(created);
    selection = { type: 'unit', id: created.id };
    commit();
  }

  /** 収納を移すと、期限を入力していない食材の目安日数も変わる */
  function moveItem(itemId, compartmentId) {
    state.items.find((i) => i.id === itemId).compartmentId = compartmentId;
    commit();
  }

  /** keepFocus: 名前の入力中に再描画でフォーカスを奪わないための逃げ道 */
  function applyLayout(mutate, keepFocus) {
    mutate(state.layout);
    saveState(state);
    if (!keepFocus) render();
  }

  function deleteCompartment(compartmentId) {
    const inside = state.items.filter((i) => i.compartmentId === compartmentId).length;
    const name = compartmentPath(state.layout, compartmentId);

    askConfirm(`${name}を削除しますか`, inside > 0 ? `中の${inside}件は「買ってきたもの」に戻ります。` : '', () => {
      releaseItemsIn([compartmentId]);
      const unit = findUnitOf(state.layout, compartmentId);
      unit.compartments = unit.compartments.filter((c) => c.id !== compartmentId);
      if (selection.id === compartmentId) selection = { type: 'comp', id: firstCompartmentId() };
      commit();
    });
  }

  function deleteUnit(unitId) {
    const unit = state.layout.find((u) => u.id === unitId);
    const ids = unit.compartments.map((c) => c.id);
    const inside = state.items.filter((i) => ids.includes(i.compartmentId)).length;

    askConfirm(`${unit.name}を丸ごと削除しますか`, inside > 0 ? `中の${inside}件は「買ってきたもの」に戻ります。` : '', () => {
      releaseItemsIn(ids);
      state.layout = state.layout.filter((u) => u.id !== unitId);
      selection = { type: 'comp', id: firstCompartmentId() };
      commit();
    });
  }

  function releaseItemsIn(compartmentIds) {
    state.items.forEach((item) => {
      if (compartmentIds.includes(item.compartmentId)) item.compartmentId = null;
    });
  }

  /* --- 確認ダイアログ --------------------------------------------------- */

  /**
   * ブラウザの confirm() は使わない。
   * サンドボックス化された iframe（Artifact などの埋め込み）では無効化され、
   * 常に false を返してしまうため、押しても何も起きない削除ボタンになる。
   */
  function buildConfirmDialog() {
    const el = document.createElement('dialog');
    el.id = 'confirm';
    el.innerHTML = `
      <div class="sheet-form confirm-form">
        <h2 id="confirm-title"></h2>
        <p id="confirm-body"></p>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" id="confirm-cancel">やめる</button>
          <button class="btn btn-delete" type="button" id="confirm-ok">削除する</button>
        </div>
      </div>`;
    el.querySelector('#confirm-cancel').addEventListener('click', () => el.close());
    return el;
  }

  /** okLabel を省くと「削除する」。消す以外の確認では何が起きるかを言葉にして渡す */
  function askConfirm(title, body, onYes, okLabel) {
    confirmDialog.querySelector('#confirm-title').textContent = title;
    const bodyEl = confirmDialog.querySelector('#confirm-body');
    bodyEl.textContent = body;
    bodyEl.hidden = !body;

    const ok = confirmDialog.querySelector('#confirm-ok');
    /* 差し替えて前回の確認の宛先が残らないようにする */
    const fresh = ok.cloneNode(true);
    fresh.textContent = okLabel || '削除する';
    ok.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      confirmDialog.close();
      onYes();
    });

    confirmDialog.showModal();
    confirmDialog.querySelector('#confirm-cancel').focus();
  }

  /**
   * 名前だけで登録する。
   * 期限も置き場所も後から決められるようにして、レジ袋を空けながらでも
   * 入力が止まらないようにする。カテゴリは名前から推すので指定もいらない。
   */
  /**
   * 名前だけで足す。
   * 見本帳にある名前なら、カテゴリも絵文字もそこから引く。
   * silent は見本帳から続けて選んでいるとき。一件ごとに帯を出すと読む間がない。
   */
  function quickAdd(name, opts) {
    const preset = FOOD_BY_NAME[name] || null;
    state.items.push({
      id: newId('item'),
      name,
      category: preset ? preset.category : guessCategoryByName(name),
      icon: preset ? preset.icon : iconForName(name),
      compartmentId: null,
      expiryType: 'BEST_BEFORE',
      expiryDate: null,
      quantity: 1,
      registeredAt: todayIso(),
      janCode: null,
      memo: null,
      notifyDaysBefore: null,
      notifyTime: null,
    });
    rememberTemplate(name);
    saveState(state);
    render();
    if (!(opts && opts.silent)) toast(`${name} を「買ってきたもの」に入れました`);
  }

  function rememberTemplate(name) {
    state.templates = [name, ...state.templates.filter((n) => n !== name)].slice(0, 12);
  }

  /* --- スワイプ --------------------------------------------------------- */

  /* 指を離した時点でどの操作になるかの境目 */
  const SWIPE_ACT = 76;
  const SWIPE_DEEP = 168;

  /**
   * 右へ引けば「食べた」、左へ引けば「食べきった」、さらに引き切ると「捨てた」。
   * 捨てるのは取り消しの効かない記録なので、浅い操作では起きないようにしてある。
   */
  function attachSwipe(wrap) {
    const rowEl = wrap.querySelector('.row');
    const offLabel = wrap.querySelector('.behind-off');
    const id = wrap.dataset.id;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let swiping = false;

    const modeOf = (value) => {
      if (value >= SWIPE_ACT) return 'eat';
      if (value <= -SWIPE_DEEP) return 'discard';
      if (value <= -SWIPE_ACT) return 'finish';
      return '';
    };

    const paint = () => {
      const mode = modeOf(dx);
      wrap.dataset.mode = mode;
      offLabel.textContent = mode === 'discard' ? '捨てた' : '食べきった';
      rowEl.style.transform = `translateX(${dx}px)`;
    };

    const reset = () => {
      wrap.dataset.mode = '';
      rowEl.style.transform = '';
      dx = 0;
      tracking = false;
      swiping = false;
    };

    wrap.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      tracking = true;
      swiping = false;
    });

    wrap.addEventListener('pointermove', (event) => {
      if (!tracking) return;
      const moveX = event.clientX - startX;
      const moveY = event.clientY - startY;

      if (!swiping) {
        if (Math.abs(moveX) < 10 && Math.abs(moveY) < 10) return;
        /* 縦に動かしているなら画面のスクロールに譲る */
        if (Math.abs(moveY) >= Math.abs(moveX)) {
          tracking = false;
          return;
        }
        swiping = true;
        wrap.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      dx = moveX;
      paint();
    });

    wrap.addEventListener('pointerup', () => {
      if (!tracking) return;
      const mode = modeOf(dx);
      const wasSwiping = swiping;
      reset();

      if (!wasSwiping) {
        openActions(id);
        return;
      }
      if (mode === 'eat') eatOne(id);
      else if (mode === 'finish') eatAll(id);
      else if (mode === 'discard') discardItem(id);
    });

    wrap.addEventListener('pointercancel', reset);
  }

  /* --- 消費と廃棄 ------------------------------------------------------- */

  function findItem(id) {
    return state.items.find((i) => i.id === id);
  }

  /**
   * 食べた・捨てた・削除を記録する。
   * 履歴から取り消せるよう、記録した瞬間の食材の姿（期限・置き場所など）も一緒に残す。
   * 削除は登録の間違いを消すためのもので、食べた・捨てたの集計には数えない。
   */
  function logConsumption(item, type, quantity) {
    state.logs.push({
      id: newId('log'),
      name: item.name,
      category: item.category,
      type,
      quantity,
      date: todayIso(),
      at: new Date().toISOString(),
      itemId: item.id,
      item: JSON.parse(JSON.stringify(item)),
    });
  }

  function eatOne(id) {
    const item = findItem(id);
    if (!item) return;
    snapshot(`${item.name}を1つ「食べた」にしました`);

    logConsumption(item, 'EATEN', 1);
    item.quantity -= 1;
    if (item.quantity <= 0) state.items = state.items.filter((i) => i.id !== id);
    commit();
  }

  function eatAll(id) {
    const item = findItem(id);
    if (!item) return;
    snapshot(`${item.name}を「食べきった」にしました`);

    logConsumption(item, 'EATEN', item.quantity);
    state.items = state.items.filter((i) => i.id !== id);
    commit();
  }

  function discardItem(id) {
    const item = findItem(id);
    if (!item) return;
    snapshot(`${item.name}を「捨てた」にしました`);

    /* 捨てた瞬間にストリークが0へ戻るので、その前に最高記録を確定させる */
    state.bestStreak = Math.max(state.bestStreak, streakDays(state.logs, state.startedAt, todayIso()));
    logConsumption(item, 'DISCARDED', item.quantity);
    state.items = state.items.filter((i) => i.id !== id);
    commit();
  }

  /** 記録に数えずに消す。登録の間違いや、二重に入れたものを消すため */
  function deleteItem(id) {
    const item = findItem(id);
    if (!item) return;
    snapshot(`${item.name}を削除しました`);

    logConsumption(item, 'DELETED', item.quantity);
    state.items = state.items.filter((i) => i.id !== id);
    commit();
  }

  /* --- 取り消しとお知らせの帯 --------------------------------------------- */

  /**
   * 帯は画面の骨格の一部として描く。
   * body に貼り付けて position:fixed にすると、端末枠に収めたときに枠の外へ出る。
   * 描き直しで消えないよう、DOM を直接いじらず状態から組み立てる。
   */
  function bannerMarkup() {
    if (!banner) return '';
    return `
      <div class="undo-bar">
        <span class="undo-text">${esc(banner.message)}</span>
        ${banner.undoable ? '<button class="undo-button" type="button" id="undo-button">取り消す</button>' : ''}
      </div>`;
  }

  function armBanner(message, undoable) {
    banner = { message, undoable };
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      banner = null;
      undoState = null;
      render();
    }, undoable ? 8000 : 4000);
  }

  /** 誤タップ・誤スワイプの取り返しがつくよう、操作前の状態をまるごと控えておく */
  function snapshot(message) {
    undoPending = true;
    undoState = {
      message,
      items: JSON.parse(JSON.stringify(state.items)),
      logs: JSON.parse(JSON.stringify(state.logs)),
      bestStreak: state.bestStreak,
    };
  }

  function undo() {
    if (!undoState) return;
    state.items = undoState.items;
    state.logs = undoState.logs;
    state.bestStreak = undoState.bestStreak;
    undoState = null;
    banner = null;
    clearTimeout(bannerTimer);
    saveState(state);
    render();
  }

  /* --- アクション ------------------------------------------------------- */

  function buildActionDialog() {
    const el = document.createElement('dialog');
    el.id = 'actions';
    el.innerHTML = `
      <div class="sheet-form action-form">
        <h2 id="action-title"></h2>
        <p id="action-sub"></p>
        <button class="action-btn" type="button" data-act="eat">食べた<span>1つ減らす</span></button>
        <button class="action-btn" type="button" data-act="finish">食べきった<span>在庫から消す</span></button>
        <button class="action-btn action-bad" type="button" data-act="discard">捨てた<span>継続日数が0に戻ります</span></button>
        <button class="action-btn action-plain" type="button" data-act="edit">編集する</button>
        <button class="action-btn action-plain action-delete" type="button" data-act="delete">削除する<span>登録の間違いなど。食べた・捨てたには数えません</span></button>
        <button class="btn btn-ghost" type="button" data-act="close">閉じる</button>
      </div>`;

    el.querySelectorAll('[data-act]').forEach((button) => {
      button.addEventListener('click', () => {
        /**
         * 食材のタップは指を離した瞬間に開く。スマホではそのあとに来るクリックが
         * 開いたばかりのシートの上で判定されるので、指の下にあったボタンが押されてしまう。
         * 開いた直後のクリックは捨てる。
         */
        if (Date.now() - Number(el.dataset.openedAt || 0) < 450) return;
        const id = el.dataset.itemId;
        el.close();
        if (button.dataset.act === 'eat') eatOne(id);
        else if (button.dataset.act === 'finish') eatAll(id);
        else if (button.dataset.act === 'discard') discardItem(id);
        else if (button.dataset.act === 'edit') openEditor(id);
        else if (button.dataset.act === 'delete') deleteItem(id);
      });
    });
    return el;
  }

  function openActions(id) {
    const item = findItem(id);
    if (!item) return;
    const u = urgencyOf(item, kindFor(item), todayIso());

    actionDialog.dataset.itemId = id;
    actionDialog.querySelector('#action-title').textContent =
      item.quantity > 1 ? `${item.name}（${item.quantity}）` : item.name;
    actionDialog.querySelector('#action-sub').textContent =
      `${compartmentPath(state.layout, item.compartmentId)}・${remainingLabel(u.days)}${u.estimated && u.date ? '（目安）' : ''}`;
    actionDialog.querySelector('[data-act="eat"]').hidden = item.quantity <= 1;
    actionDialog.dataset.openedAt = String(Date.now());
    actionDialog.showModal();
  }

  /* --- 設定 --------------------------------------------------------------- */

  function buildShareDialog() {
    const el = document.createElement('dialog');
    el.id = 'share-fallback';
    el.innerHTML = `
      <div class="sheet-form">
        <div class="form-head">
          <h2 id="share-title">送る文面</h2>
          <button class="icon-btn" type="button" data-close aria-label="閉じる">×</button>
        </div>
        <p class="hint" id="share-lead"></p>
        <textarea id="share-text" rows="9" readonly></textarea>
        <div class="form-actions">
          <button class="btn btn-primary" type="button" id="share-send">送る</button>
          <button class="btn btn-ghost" type="button" id="share-copy">コピー</button>
          <button class="btn btn-ghost" type="button" data-close>閉じる</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => el.close()));
    el.querySelector('#share-send').addEventListener('click', sendShare);
    el.querySelector('#share-copy').addEventListener('click', copyShareText);
    return el;
  }

  async function copyShareText() {
    const area = shareDialog.querySelector('#share-text');
    area.select();
    try {
      await navigator.clipboard.writeText(area.value);
      setShareLead('コピーしました。貼り付けて送ってください。');
    } catch (error) {
      /* クリップボードが使えない端末では、選択済みの文面を手で写してもらう */
      setShareLead('コピーできませんでした。文面を選んだ状態にしてあるので、長押しでコピーしてください。');
    }
  }

  /* --- 入力ダイアログ --------------------------------------------------- */

  function buildDialog() {
    const el = document.createElement('dialog');
    el.id = 'editor';
    el.innerHTML = `
      <form class="sheet-form" method="dialog" id="editor-form">
        <div class="form-head">
          <h2 id="editor-title">食材を追加</h2>
          <button class="icon-btn" type="button" id="editor-close" aria-label="閉じる">×</button>
        </div>

        <div class="field">
          <label for="f-name">商品名</label>
          <div class="field-with-scan">
            <input id="f-name" name="name" type="text" required autocomplete="off" placeholder="にんじん">
            <button class="btn btn-ghost btn-scan" type="button" id="scan-barcode">${ICON_SCAN}バーコード</button>
          </div>
          <input id="f-jan" name="janCode" type="hidden">
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="f-category">カテゴリ</label>
            <select id="f-category" name="category">
              ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-quantity">個数</label>
            <div class="stepper">
              <button class="step-btn" type="button" id="qty-minus" aria-label="1つ減らす">−</button>
              <input id="f-quantity" name="quantity" type="number" min="1" step="1" value="1" inputmode="numeric">
              <button class="step-btn" type="button" id="qty-plus" aria-label="1つ増やす">＋</button>
            </div>
          </div>
        </div>

        <div class="field">
          <label for="f-place">入れる場所</label>
          <select id="f-place" name="compartmentId"></select>
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="f-type">期限の種別</label>
            <select id="f-type" name="expiryType">
              <option value="BEST_BEFORE">賞味期限</option>
              <option value="USE_BY">消費期限</option>
              <option value="UNKNOWN">書いていない</option>
            </select>
          </div>
          <div class="field">
            <label for="f-date">期限日 <span class="optional">任意</span></label>
            <div class="field-with-scan">
              <input id="f-date" name="expiryDate" type="date">
              <button class="btn btn-ghost btn-scan" type="button" id="scan-expiry">${ICON_SCAN}読む</button>
            </div>
          </div>
        </div>

        <p class="scan-result" id="editor-note" hidden></p>
        <div class="hint" id="f-hint"></div>

        <div class="field-pair">
          <div class="field">
            <label for="f-notify-days">知らせる <span class="optional">この食材だけ</span></label>
            <select id="f-notify-days" name="notifyDaysBefore">
              <option value="">設定どおり</option>
              <option value="0">当日</option>
              <option value="1">1日前</option>
              <option value="2">2日前</option>
              <option value="3">3日前</option>
              <option value="5">5日前</option>
              <option value="7">7日前</option>
              <option value="off">知らせない</option>
            </select>
          </div>
          <div class="field">
            <label for="f-notify-time">時刻</label>
            <input id="f-notify-time" name="notifyTime" type="time">
          </div>
        </div>

        <div class="field">
          <label for="f-memo">メモ <span class="optional">— 任意</span></label>
          <textarea id="f-memo" name="memo" rows="2" placeholder="半額だったもの／半玉だけ残り など"></textarea>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" type="submit" id="editor-save">保存する</button>
          <button class="btn btn-danger" type="button" id="editor-delete">削除</button>
        </div>
      </form>`;

    el.querySelector('#editor-close').addEventListener('click', () => el.close());
    el.querySelector('#editor-form').addEventListener('submit', onSubmit);
    el.querySelector('#editor-delete').addEventListener('click', onDelete);
    /* 入力の途中から読み取りへ寄り道して、戻ってきた値を欄に入れる */
    const qty = el.querySelector('#f-quantity');
    const bump = (delta) => {
      qty.value = Math.max(1, (Number(qty.value) || 1) + delta);
    };
    el.querySelector('#qty-minus').addEventListener('click', () => bump(-1));
    el.querySelector('#qty-plus').addEventListener('click', () => bump(1));

    el.querySelector('#scan-barcode').addEventListener('click', () => {
      openScan('barcode', (result) => applyJan(result.jan));
    });
    el.querySelector('#scan-expiry').addEventListener('click', () => {
      openScan('expiry', (result) => applyExpiry(result.expiry));
    });
    ['f-category', 'f-place', 'f-date'].forEach((id) => {
      el.querySelector(`#${id}`).addEventListener('change', updateHint);
    });
    return el;
  }

  /** 収納はユーザーが編集するので、開くたびに選択肢を組み直す */
  function placeOptions() {
    const groups = state.layout
      .map((unit) => `<optgroup label="${esc(unit.name)}">${unit.compartments
        .map((c) => `<option value="${c.id}">${esc(c.name)}（${STORAGE_LABELS[c.kind]}）</option>`)
        .join('')}</optgroup>`)
      .join('');
    return `<option value="">まだ入れない（買ってきたもの）</option>${groups}`;
  }

  function openEditor(id) {
    editingId = id;
    const item = id ? state.items.find((i) => i.id === id) : null;

    dialog.querySelector('#f-place').innerHTML = placeOptions();
    dialog.querySelector('#editor-title').textContent = item ? '食材を編集' : '食材を追加';
    dialog.querySelector('#editor-delete').hidden = !item;
    dialog.querySelector('#f-name').value = item ? item.name : '';
    dialog.querySelector('#f-category').value = item ? item.category : 'VEGETABLE';
    dialog.querySelector('#f-place').value = item && item.compartmentId ? item.compartmentId : '';
    dialog.querySelector('#f-type').value = item ? item.expiryType : 'BEST_BEFORE';
    dialog.querySelector('#f-quantity').value = item ? item.quantity : 1;
    dialog.querySelector('#f-date').value = item && item.expiryDate ? item.expiryDate : '';
    dialog.querySelector('#f-memo').value = item && item.memo ? item.memo : '';
    dialog.querySelector('#f-jan').value = item && item.janCode ? item.janCode : '';
    /* 既定と同じなら空にしておく。わざわざこの食材だけ変えた、が見て分かるようにする */
    dialog.querySelector('#f-notify-days').value = notifyDaysValue(item);
    dialog.querySelector('#f-notify-time').value = item && item.notifyTime ? item.notifyTime : '';
    setEditorNote('');

    updateHint();
    dialog.showModal();
    dialog.querySelector('#f-name').focus();
  }

  /**
   * 期限日が空のときに、プリセットから導いた目安をその場で見せる。
   * 「入力しなくても管理される」ことが伝わらないと、期限入力が実質必須になってしまうため。
   */
  function updateHint() {
    const hint = dialog.querySelector('#f-hint');
    const date = dialog.querySelector('#f-date').value;

    if (date) {
      hint.textContent = '入力された期限日を使います。';
      return;
    }

    const category = dialog.querySelector('#f-category').value;
    const compartmentId = dialog.querySelector('#f-place').value;
    const compartment = findCompartment(state.layout, compartmentId);
    const days = presetDaysFor(category, compartment ? compartment.kind : null);
    const base = editingId ? state.items.find((i) => i.id === editingId).registeredAt : todayIso();

    if (!compartment) {
      hint.innerHTML = 'まだどこにも入れていないため <b>期限なし</b> として扱います。冷蔵庫に入れると目安が付きます。';
      return;
    }
    if (days === null) {
      hint.innerHTML = `${CATEGORY_LABELS[category]}を${STORAGE_LABELS[compartment.kind]}で保管する場合の目安がないため、<b>期限なし</b>として扱います。`;
      return;
    }
    hint.innerHTML = `期限を空にすると、目安の <b>${days}日</b> を使って <b>${formatDate(addDays(base, days))}</b> まで（目安）として表示します。`;
  }

  function onSubmit(event) {
    event.preventDefault();
    /* form.name はフォーム自身の name 属性を指してしまうため elements 経由で取る */
    const f = event.target.elements;
    const name = f.name.value.trim();
    if (!name) return;

    const values = {
      name,
      category: f.category.value,
      compartmentId: f.compartmentId.value || null,
      expiryType: f.expiryType.value,
      expiryDate: f.expiryDate.value || null,
      quantity: Math.max(1, Number(f.quantity.value) || 1),
      memo: f.memo.value.trim() || null,
      janCode: f.janCode.value || null,
      notifyDaysBefore: parseNotifyDays(f.notifyDaysBefore.value),
      notifyTime: f.notifyTime.value || null,
    };
    if (!existingItem(editingId)) values.icon = iconForName(name);

    /* 読ませたバーコードと名前の組を覚える。次に同じ商品を買ったとき手で打たずに済む */
    if (values.janCode) {
      state.janNames[values.janCode] = { name: values.name, category: values.category };
    }

    const existing = editingId ? state.items.find((i) => i.id === editingId) : null;
    if (existing) {
      Object.assign(existing, values);
    } else {
      state.items.push({ id: newId('item'), registeredAt: todayIso(), ...values });
      rememberTemplate(values.name);
    }

    dialog.close();
    commit();
  }

  function onDelete() {
    state.items = state.items.filter((i) => i.id !== editingId);
    dialog.close();
    commit();
  }



  /* --- 設定の操作 ----------------------------------------------------------- */

  /**
   * 配色を根の要素に書く。
   * CSS 側は :root[data-theme] と prefers-color-scheme の両方を見ているので、
   * 'auto' のときは属性を外して端末の設定に委ねる。
   */
  function applyTheme() {
    if (state.theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = state.theme;
    }
  }

  function bindSettings() {
    root.querySelectorAll('[data-theme]').forEach((el) => {
      el.addEventListener('click', () => {
        state.theme = el.dataset.theme;
        saveState(state);
        applyTheme();
        render();
      });
    });

    /* 冷蔵庫の中の分け方。食材は同じ温度帯の段へ移すので、切り替えても消えない */
    root.querySelectorAll('[data-layout-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.dataset.layoutMode;
        if (mode === state.layoutMode) return;
        if (mode === 'ZONES') useZones(state);
        else useDetailed(state);
        editingLayout = false;
        selection = { type: 'comp', id: firstCompartmentId() };
        saveState(state);
        render();
        toast(mode === 'ZONES' ? '温度帯だけで分けるようにしました' : '段まで細かく分けるようにしました');
      });
    });

    const editLayout = root.querySelector('#edit-layout');
    if (editLayout) {
      editLayout.addEventListener('click', () => {
        /* 形を直すには図が見えていないと話にならないので、冷蔵庫タブへ連れていく */
        view = 'fridge';
        fridgeMode = 'figure';
        editingLayout = true;
        selection = { type: 'unit', id: state.layout[0] ? state.layout[0].id : null };
        render();
      });
    }

    /* 収納ごとの扉。冷蔵庫の形を開かずに、ここだけ直せるようにしておく */
    root.querySelectorAll('[data-set-door]').forEach((el) => {
      el.addEventListener('click', () => {
        const unit = state.layout.find((u) => u.id === el.dataset.setDoor);
        if (!unit) return;
        unit.doorStyle = el.dataset.doorValue;
        saveState(state);
        render();
      });
    });

    const pickShape = root.querySelector('#pick-shape');
    if (pickShape) pickShape.addEventListener('click', openShapes);

    const exportButton = root.querySelector('#export-data');
    if (exportButton) exportButton.addEventListener('click', downloadBackup);

    const importInput = root.querySelector('#import-data');
    if (importInput) {
      importInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (file) restoreBackup(file);
      });
    }

    const wipe = root.querySelector('#wipe-data');
    if (wipe) {
      wipe.addEventListener('click', () => {
        askConfirm(
          'すべてのデータを消しますか',
          `在庫 ${state.items.length}件、記録 ${state.logs.length}件、収納の配置、買い物リストがすべて消えます。元に戻せません。`,
          () => {
            state = emptyState();
            saveState(state);
            applyTheme();
            render();
            toast('すべて消しました');
          },
          'すべて消す',
        );
      });
    }

    const clearJan = root.querySelector('#clear-jan');
    if (clearJan) {
      clearJan.addEventListener('click', () => {
        askConfirm('覚えたバーコードを消しますか', '次からは商品名を手で入れ直すことになります。', () => {
          state.janNames = {};
          saveState(state);
          render();
          toast('覚えたバーコードを消しました');
        }, '消す');
      });
    }
  }

  /** 控えをファイルとして渡す。端末の中だけに置く作りなので、持ち出す道を用意しておく */
  function downloadBackup() {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    /* Chrome は日本語のファイル名を捨てて「download」にしてしまうので ASCII で付ける */
    link.download = `fridge-map-${todayIso()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    /* 取り消しが早すぎると保存前に失効する端末があるので、少し待ってから */
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('控えを書き出しました');
  }

  async function restoreBackup(file) {
    const text = await file.text();
    const restored = importState(text);
    if (!restored) {
      toast('その控えは読めませんでした');
      return;
    }
    askConfirm(
      '控えから戻しますか',
      `いまの在庫 ${state.items.length}件は、控えの ${restored.items.length}件で置き換わります。元に戻せません。`,
      () => {
        state = restored;
        saveState(state);
        applyTheme();
        render();
        toast('控えから戻しました');
      },
      '戻す',
    );
  }



  /* --- 冷蔵庫の型から選ぶ --------------------------------------------------- */

  /**
   * よくある冷蔵庫の形を、そのまま選べるようにする。
   * 段を一つずつ足して組み立てるのは、最初の一度とはいえ重い。
   * 近い型を選んでから、違うところだけ直せば済む。
   */
  function buildShapesDialog() {
    const el = document.createElement('dialog');
    el.id = 'shapes';
    el.innerHTML = `
      <div class="sheet-form shapes">
        <div class="form-head">
          <h2>冷蔵庫の型</h2>
          <button class="icon-btn" type="button" id="shapes-close" aria-label="閉じる">×</button>
        </div>
        <p class="hint">近い型を選んでください。選んだあと、段の名前や大きさは自由に直せます。</p>
        <div class="shape-list" id="shape-list"></div>
      </div>`;
    el.querySelector('#shapes-close').addEventListener('click', () => el.close());
    return el;
  }

  function openShapes() {
    shapesDialog.querySelector('#shape-list').innerHTML = FRIDGE_SHAPES.map((shape) => `
      <button class="shape-btn" type="button" data-shape="${shape.id}">
        <span class="shape-name">${esc(shape.name)}</span>
        <span class="shape-note">${esc(shape.note)}</span>
        <span class="shape-rows">${shape.rows.length}段</span>
      </button>`).join('');

    shapesDialog.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.addEventListener('click', () => applyShape(btn.dataset.shape));
    });
    shapesDialog.showModal();
  }

  /**
   * 型を当てる。
   * いまの収納を置き換えるか、隣に足すかは選んでもらう。
   * 冷蔵庫とセカンド冷凍庫の両方を持っている家があるため。
   */
  function applyShape(shapeId) {
    const shape = FRIDGE_SHAPES.find((x) => x.id === shapeId);
    if (!shape) return;
    shapesDialog.close();

    const inside = state.items.filter((i) => findCompartment(state.layout, i.compartmentId)).length;
    askConfirm(
      `「${shape.name}」にしますか`,
      `いまの収納（${state.layout.length}個）を置き換えます。`
        + (inside > 0 ? `入っている${inside}件は「買ってきたもの」に戻ります。` : ''),
      () => {
        state.items.forEach((item) => { item.compartmentId = null; });
        state.layout = [unitFromShape(shape)];
        state.layoutMode = 'DETAILED';
        state.detailed = null;
        selection = { type: 'unit', id: state.layout[0].id };
        view = 'fridge';
        fridgeMode = 'figure';
        editingLayout = true;
        commit();
        toast(`「${shape.name}」にしました`);
      },
      'この型にする',
    );
  }

  /* --- よく使う食品から選ぶ ------------------------------------------------ */

  /**
   * 名前を打たずに選ぶだけで登録できるようにする。
   * 買ってきたものをまとめて入れるときは、一件ずつ打つのが一番の重荷になる。
   * 選んでも閉じないので、続けて何件でも入れられる。
   */
  function buildFoodsDialog() {
    const el = document.createElement('dialog');
    el.id = 'foods';
    el.innerHTML = `
      <div class="sheet-form foods">
        <div class="form-head">
          <h2>よく使う食品</h2>
          <button class="icon-btn" type="button" id="foods-close" aria-label="閉じる">×</button>
        </div>
        <div class="search">
          <input type="search" id="foods-search" placeholder="名前で探す" autocomplete="off">
        </div>
        <div class="foods-cats" id="foods-cats"></div>
        <div class="foods-grid" id="foods-grid"></div>
        <p class="hint" id="foods-note">選ぶと「買ってきたもの」に入ります。続けて選べます。</p>
      </div>`;
    el.querySelector('#foods-close').addEventListener('click', () => el.close());
    el.querySelector('#foods-search').addEventListener('input', (event) => {
      foodsQuery = event.target.value;
      paintFoods(true);
    });
    return el;
  }

  function openFoods() {
    foodsCategory = 'ALL';
    foodsQuery = '';
    foodsDialog.querySelector('#foods-search').value = '';
    setFoodsNote('選ぶと「買ってきたもの」に入ります。続けて選べます。');
    paintFoods();
    foodsDialog.showModal();
  }

  function visibleFoods() {
    const needle = foodsQuery.trim().toLowerCase();
    return FOOD_PRESETS.filter((food) => {
      if (foodsCategory !== 'ALL' && food.category !== foodsCategory) return false;
      if (needle === '') return true;
      /* 漢字の食品は読みでも引く。「とうふ」と打つ人のほうが多い */
      return food.name.toLowerCase().includes(needle)
        || (food.kana && food.kana.includes(needle));
    });
  }

  /** keepSearch のときは検索欄を描き直さない。打っている最中に焦点を失わせないため */
  function paintFoods(keepSearch) {
    const list = visibleFoods();

    if (!keepSearch) {
      const counts = { ALL: FOOD_PRESETS.length };
      Object.keys(CATEGORY_LABELS).forEach((key) => {
        counts[key] = FOOD_PRESETS.filter((f) => f.category === key).length;
      });
      const chip = (key, label) => `
        <button class="chip-filter" type="button" data-food-cat="${key}" aria-pressed="${foodsCategory === key}">
          ${label}<em>${counts[key]}</em>
        </button>`;
      foodsDialog.querySelector('#foods-cats').innerHTML = [
        chip('ALL', 'すべて'),
        ...Object.entries(CATEGORY_LABELS).map(([k, v]) => chip(k, v)),
      ].join('');
      foodsDialog.querySelectorAll('[data-food-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          foodsCategory = btn.dataset.foodCat;
          paintFoods();
        });
      });
    }

    foodsDialog.querySelector('#foods-grid').innerHTML = list.length === 0
      ? '<p class="foods-empty">見つかりません。閉じて名前を打つと、そのまま入れられます。</p>'
      : list.map((food) => `
          <button class="food-btn" type="button" data-food="${esc(food.name)}">
            <span class="food-icon">${food.icon}</span>
            <span class="food-name">${esc(food.name)}</span>
          </button>`).join('');

    foodsDialog.querySelectorAll('[data-food]').forEach((btn) => {
      btn.addEventListener('click', () => {
        quickAdd(btn.dataset.food, { silent: true });
        btn.classList.add('is-added');
        setFoodsNote(`「${btn.dataset.food}」を入れました。続けて選べます。`);
      });
    });
  }

  function setFoodsNote(message) {
    foodsDialog.querySelector('#foods-note').textContent = message;
  }

  /* --- 読み取り（バーコード・賞味期限） ----------------------------------- */

  /**
   * カメラから読む画面。
   * 端末や埋め込み先によってカメラも認識も使えないことがあるので、
   * 「写真から読む」と「手で入れる」を常に並べて、どこでも行き止まりにしない。
   */
  function buildScanDialog() {
    const el = document.createElement('dialog');
    el.id = 'scanner';
    el.innerHTML = `
      <div class="sheet-form scan">
        <div class="form-head">
          <h2 id="scan-title">読み取り</h2>
          <button class="icon-btn" type="button" id="scan-close" aria-label="閉じる">×</button>
        </div>

        <div class="scan-stage" id="scan-stage">
          <video id="scan-video" playsinline muted autoplay></video>
          <div class="scan-guide"><span id="scan-guide-label"></span></div>
        </div>
        <canvas id="scan-shot" hidden></canvas>

        <p class="hint" id="scan-note"></p>

        <div class="scan-actions">
          <button class="btn btn-primary" type="button" id="scan-shoot">読み取る</button>
          <label class="btn btn-ghost" for="scan-file">写真から読む</label>
          <input type="file" id="scan-file" accept="image/*" capture="environment" hidden>
        </div>

        <div class="field scan-manual">
          <label for="scan-input" id="scan-manual-label">手で入れる</label>
          <div class="scan-manual-row">
            <input id="scan-input" type="text" autocomplete="off">
            <button class="btn btn-ghost" type="button" id="scan-manual-ok">これで進む</button>
          </div>
        </div>

        <p class="hint scan-privacy">撮った画像も読み取った文字も、この端末の中だけで処理します。
           どこにも送信しません。</p>
      </div>`;

    el.querySelector('#scan-close').addEventListener('click', closeScan);
    el.addEventListener('cancel', closeScan);
    el.querySelector('#scan-shoot').addEventListener('click', shootScan);
    el.querySelector('#scan-file').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) readFromFile(file);
    });
    el.querySelector('#scan-manual-ok').addEventListener('click', submitManual);
    return el;
  }

  const SCAN_COPY = {
    barcode: {
      title: 'バーコードを読む',
      guide: 'バーコードを枠に合わせてください',
      manual: '読めないときは、バーコードの下の数字を入れる',
      placeholder: '4901234567894',
      inputType: 'text',
    },
    expiry: {
      title: '賞味期限を読む',
      guide: '期限の印字を枠いっぱいに写してください',
      manual: '読めないときは、期限日を入れる',
      placeholder: '',
      inputType: 'date',
    },
  };

  /**
   * 読み取りを開く。
   * mode は 'barcode' か 'expiry'。読めた値は onResult へ渡し、
   * 確定はさせずに呼び出し側が人に見せて確かめる（読み違いは必ず起こる）。
   */
  async function openScan(mode, onResult) {
    scanMode = mode;
    scanDone = onResult;

    const copy = SCAN_COPY[mode];
    const input = scanDialog.querySelector('#scan-input');
    scanDialog.querySelector('#scan-title').textContent = copy.title;
    scanDialog.querySelector('#scan-guide-label').textContent = copy.guide;
    scanDialog.querySelector('#scan-manual-label').textContent = copy.manual;
    input.type = copy.inputType;
    input.placeholder = copy.placeholder;
    input.value = '';
    /* バーコードは見つけ次第に進むので、押すボタンは期限のときだけ出す */
    scanDialog.querySelector('#scan-shoot').hidden = mode === 'barcode';
    const fileLabel = scanDialog.querySelector('[for="scan-file"]');
    fileLabel.classList.remove('btn-primary');
    fileLabel.classList.add('btn-ghost');
    scanDialog.querySelector('#scan-stage').hidden = false;

    const support = Scan.support();
    if (mode === 'barcode' && !support.barcode) {
      setScanNote('この端末ではバーコードの読み取りに対応していません。写真から読むか、数字を手で入れてください。');
    } else if (mode === 'expiry' && !support.text) {
      /* 文字認識を落としてくることは先に伝える。黙って通信するアプリにはしない */
      setScanNote('初回だけ文字認識の仕組みを読み込みます（約2MB）。読み込んだあとの処理は端末の中だけで行います。');
    } else {
      setScanNote('');
    }

    scanDialog.showModal();
    await startScanCamera(support);
  }

  async function startScanCamera(support) {
    const stage = scanDialog.querySelector('#scan-stage');
    const video = scanDialog.querySelector('#scan-video');

    if (!support.live) {
      noCamera('この画面ではカメラを開けません。写真から読むか、手で入れてください。');
      return;
    }

    try {
      scanStream = await Scan.openStream();
      video.srcObject = scanStream;
      stage.hidden = false;
      await video.play().catch(() => {});
    } catch (error) {
      noCamera('カメラを使えませんでした。写真から読むか、手で入れてください。');
      return;
    }

    if (scanMode === 'barcode' && support.barcode) startBarcodeLoop(video);
  }

  /** カメラが無いときは「読み取る」を伏せ、写真から読む道だけを残す */
  function noCamera(message) {
    scanDialog.querySelector('#scan-stage').hidden = true;
    scanDialog.querySelector('#scan-shoot').hidden = true;
    /* 残った一本を目立たせる。btn-ghost を外さないと背景が透明のままになる */
    scanDialog.querySelector('[for="scan-file"]').classList.remove('btn-ghost');
    scanDialog.querySelector('[for="scan-file"]').classList.add('btn-primary');
    setScanNote(message);
  }

  /** バーコードは連続で探す。枠に合った瞬間に進むほうが手数が少ない */
  function startBarcodeLoop(video) {
    const detector = Scan.barcodeDetector();
    if (!detector) return;

    let busy = false;
    scanTimer = setInterval(async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      const jan = await Scan.detectBarcode(detector, video);
      busy = false;
      if (jan) finishScan({ jan });
    }, 220);
  }

  async function shootScan() {
    const video = scanDialog.querySelector('#scan-video');
    if (!scanStream || video.readyState < 2) {
      setScanNote('カメラの映像がまだ出ていません。写真から読むか、手で入れてください。');
      return;
    }
    await processSource(video, video.videoWidth, video.videoHeight);
  }

  async function readFromFile(file) {
    try {
      const image = await Scan.imageFromFile(file);
      await processSource(image, image.naturalWidth, image.naturalHeight);
    } catch (error) {
      setScanNote('その画像は読めませんでした。別の写真で試してください。');
    }
  }

  async function processSource(source, width, height) {
    if (scanMode === 'barcode') {
      const detector = Scan.barcodeDetector();
      const canvas = Scan.prepare(source, width, height, false);
      const jan = await Scan.detectBarcode(detector, canvas);
      if (jan) {
        finishScan({ jan });
        return;
      }
      setScanNote('バーコードを読み取れませんでした。もう少し近づけるか、数字を手で入れてください。');
      return;
    }

    setScanNote('読み取っています…');
    try {
      const canvas = Scan.prepare(source, width, height, true);
      const text = await Scan.readText(canvas, setScanNote);
      const found = Scan.parseExpiry(text, todayIso());
      if (found) {
        finishScan({ expiry: found });
        return;
      }
      setScanNote('日付を見つけられませんでした。印字を枠いっぱいに写すか、日付を手で入れてください。');
    } catch (error) {
      setScanNote(`${error.message}。日付を手で入れてください。`);
    }
  }

  function submitManual() {
    const value = scanDialog.querySelector('#scan-input').value.trim();
    if (!value) return;

    if (scanMode === 'barcode') {
      const jan = Scan.normalizeJan(value);
      if (!jan) {
        setScanNote('その番号はバーコードの数字として合いません。13桁か8桁を確かめてください。');
        return;
      }
      finishScan({ jan });
      return;
    }
    finishScan({ expiry: { date: value, expiryType: null, raw: value, others: [] } });
  }

  function setScanNote(message) {
    scanDialog.querySelector('#scan-note').textContent = message;
  }

  function finishScan(result) {
    const done = scanDone;
    closeScan();
    if (done) done(result);
  }

  /** カメラは必ず止める。止め忘れるとランプが点いたままになる */
  function closeScan() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    Scan.stopStream(scanStream);
    scanStream = null;
    const video = scanDialog.querySelector('#scan-video');
    video.srcObject = null;
    scanMode = null;
    scanDone = null;
    if (scanDialog.open) scanDialog.close();
  }

  /* --- 読み取った結果の扱い ------------------------------------------------ */

  /**
   * バーコードから商品名を引く。
   * 外部の商品データベースは叩かないので、初めての商品は名前が出ない。
   * そのときは人が入れた名前を覚えて、次からは読ませるだけで済むようにする。
   */
  function applyJan(jan) {
    const known = state.janNames[jan] || null;
    /* 編集の途中から読んだときは、入力済みの欄を消さずにそのまま埋める */
    if (!dialog.open) openEditor(null);
    dialog.querySelector('#f-jan').value = jan;

    if (known) {
      dialog.querySelector('#f-name').value = known.name;
      dialog.querySelector('#f-category').value = known.category;
      setEditorNote(`この商品は覚えています（${jan}）。`);
      dialog.querySelector('#f-date').focus();
    } else {
      setEditorNote(`初めてのバーコードです（${jan}）。商品名を入れると、次からは読ませるだけで入ります。`);
      dialog.querySelector('#f-name').focus();
    }
  }

  function applyExpiry(found) {
    dialog.querySelector('#f-date').value = found.date;
    if (found.expiryType) dialog.querySelector('#f-type').value = found.expiryType;

    const others = found.others && found.others.length > 0
      ? `ほかに ${found.others.map(formatDate).join('、')} も読めました。`
      : '';
    setEditorNote(`読み取った期限を入れました：${formatDate(found.date)}。違っていたら直してください。${others}`);
    updateHint();
  }

  function setEditorNote(message) {
    const note = dialog.querySelector('#editor-note');
    note.textContent = message;
    note.hidden = !message;
  }

  /* --- ユーティリティ --------------------------------------------------- */


  function existingItem(id) {
    return id ? state.items.find((i) => i.id === id) || null : null;
  }

  /** 選択欄の値。null は「設定どおり」、-1 は「知らせない」 */
  function notifyDaysValue(item) {
    if (!item || item.notifyDaysBefore === null || item.notifyDaysBefore === undefined) return '';
    return item.notifyDaysBefore < 0 ? 'off' : String(item.notifyDaysBefore);
  }

  function parseNotifyDays(raw) {
    if (raw === '') return null;
    if (raw === 'off') return -1;
    return Number(raw);
  }

  /**
   * この食材を何日前に知らせるか。
   * 食材ごとの設定があればそれを、なければアプリ全体の設定を使う。
   * -1 はこの食材だけ知らせない指定。
   */
  /**
   * この食材を、残り days 日の時点で知らせるか。
   * 食材ごとに「知らせない」を選べるので、全体の設定だけでは決められない。
   */
  function wantsNotice(item, days) {
    if (days === null) return false;
    const threshold = notifyDaysFor(item);
    if (threshold < 0) return false;
    return days <= threshold;
  }

  function notifyDaysFor(item) {
    if (item.notifyDaysBefore === null || item.notifyDaysBefore === undefined) return state.notify.daysBefore;
    return item.notifyDaysBefore;
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
})();
