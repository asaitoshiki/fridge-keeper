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
  /* 帯の状態。初回描画より前に置く。let は宣言行を通るまで触れられない */
  let undoState = null;
  let undoPending = false;
  let banner = null;
  let bannerTimer = null;
  /* 編集中に調整している対象。段か収納のどちらか */
  let selection = { type: 'comp', id: null };
  let kindFilter = 'ALL';
  let editingId = null;
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

  const ICON_SCAN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8"/><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8"/><path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 8.5v7M11 8.5v7M14.5 8.5v7M17.5 8.5v7"/></svg>';

  const root = document.getElementById('app');
  const dialog = buildDialog();
  const confirmDialog = buildConfirmDialog();
  const actionDialog = buildActionDialog();
  const shareDialog = buildShareDialog();
  const scanDialog = buildScanDialog();
  document.body.appendChild(dialog);
  document.body.appendChild(confirmDialog);
  document.body.appendChild(actionDialog);
  document.body.appendChild(shareDialog);
  document.body.appendChild(scanDialog);

  render();

  /* --- 描画 ------------------------------------------------------------ */

  function render() {
    const today = todayIso();
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
      <button class="nav-item" type="button" data-view="${key}" aria-pressed="${view === key}">
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
      notices: 'お知らせ', report: 'レポート', settings: '設定',
    };

    if (view !== 'fridge') return `<div class="pane-head"><h2>${titles[view]}</h2></div>`;

    const seg = (key, label) =>
      `<button class="seg" type="button" data-mode="${key}" aria-pressed="${fridgeMode === key}">${label}</button>`;

    return `
      <div class="pane-head">
        <div class="segmented">${seg('figure', '図')}${seg('expiry', '期限順')}</div>
        ${fridgeMode === 'figure'
          ? `<button class="tab-action" type="button" id="toggle-layout" aria-pressed="${editingLayout}">
               ${editingLayout ? '編集を終える' : '配置を編集'}
             </button>`
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
      .filter((x) => x.u.days !== null && x.u.days <= state.notify.daysBefore)
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
    const visible = state.items.filter((i) => kindFilter === 'ALL' || kindFor(i) === kindFilter);
    const sorted = sortByExpiry(visible, kindFor, today);
    return filters() + sheet(sorted, today);
  }

  function filters() {
    const counts = { ALL: state.items.length };
    Object.keys(STORAGE_LABELS).forEach((key) => {
      counts[key] = state.items.filter((i) => kindFor(i) === key).length;
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
      return `<div class="sheet"><div class="empty">${
        state.items.length === 0
          ? '<strong>食材がまだ登録されていません</strong>右下の「食材を追加」から登録してください。'
          : '<strong>ここには何もありません</strong>ほかのタブを見てください。'
      }</div></div>`;
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
    const soon = graded.filter((x) => x.u.days >= 0 && x.u.days <= state.notify.daysBefore);
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
        ${group(`${state.notify.daysBefore}日以内に期限を迎えます`, 'warn', soon, '')}
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

  /* --- レポート ----------------------------------------------------------- */

  function reportPane(today) {
    const days = streakDays(state.logs, state.startedAt, today);
    const best = Math.max(state.bestStreak, days);
    const stats = consumptionStats(state.logs, addDays(today, -29), today);

    return `
      <div class="report">
        <section class="hero">
          <span class="hero-label">食品ロスなし</span>
          <span class="hero-number">${days}<i>日</i></span>
          <span class="hero-sub">最高記録 ${best}日</span>
        </section>

        <h3 class="report-head">直近30日</h3>
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

    return `
      <div class="settings-pane">
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

        ${state.sampleLoaded
          ? '<button class="btn btn-ghost" type="button" id="clear-sample">サンプルデータを削除して空から始める</button>'
          : ''}
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
          <button class="btn btn-primary" type="button" id="share-shopping" ${state.shopping.length === 0 ? 'disabled' : ''}>
            買い物リストを送る
          </button>
          <button class="btn btn-ghost" type="button" id="clear-bought" ${state.shopping.some((e) => e.done) ? '' : 'disabled'}>
            買ったものを消す
          </button>
        </div>

        <div class="buy-share">
          <h3>家族に送る</h3>
          <p>LINE やメールなど、ふだん使っているもので送れます。送り先はこの端末が選ぶので、
             アプリが外部へデータを預けることはありません。</p>
          <div class="buy-actions">
            <button class="btn btn-ghost" type="button" id="text-shopping" ${state.shopping.length === 0 ? 'disabled' : ''}>
              買い物リストを文面にする
            </button>
            <button class="btn btn-ghost" type="button" id="share-fridge">冷蔵庫の様子を送る</button>
            <button class="btn btn-ghost" type="button" id="text-fridge">冷蔵庫の様子を文面にする</button>
          </div>
          <p class="hint">共有シートが開けない端末でも、文面にすればコピーして貼り付けられます。</p>
        </div>
      </section>`;
  }

  /* --- 共有 --------------------------------------------------------------- */

  /**
   * 家族への共有は、自前のサーバーを持たずに OS の共有シートへ投げて済ませる。
   * LINE でもメールでも、相手がふだん使っているもので届く。
   *
   * 共有シートもクリップボードも、埋め込み先の制約で使えないことがある。
   * どちらも駄目なときのために、本文をそのまま見せる逃げ道を最後に置いてある。
   */
  async function shareText(title, text) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました。貼り付けて送ってください');
      return;
    } catch (error) {
      showShareFallback(text);
    }
  }

  function fridgeShareText(today) {
    const urgent = state.items
      .map((item) => ({ item, u: urgencyOf(item, kindFor(item), today) }))
      .filter((x) => x.u.days !== null && x.u.days <= state.notify.daysBefore)
      .sort((a, b) => a.u.days - b.u.days);

    const lines = [`冷蔵庫の様子（${formatDate(today)}）`, ''];
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

  function showShareFallback(text) {
    showShareText('送る文面', text);
    shareDialog.querySelector('#share-lead').textContent =
      'この端末では共有シートを開けませんでした。文面をコピーして貼り付けてください。';
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
      shareShopping.addEventListener('click', () => shareText('買い物リスト', shoppingShareText()));
    }

    const textShopping = root.querySelector('#text-shopping');
    if (textShopping) {
      textShopping.addEventListener('click', () => showShareText('買い物リストの文面', shoppingShareText()));
    }

    const textFridge = root.querySelector('#text-fridge');
    if (textFridge) {
      textFridge.addEventListener('click', () => showShareText('冷蔵庫の様子の文面', fridgeShareText(today)));
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
      shareFridge.addEventListener('click', () => shareText('冷蔵庫の様子', fridgeShareText(today)));
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
        onAddUnit: addUnit,
        onDeleteCompartment: deleteCompartment,
        onDeleteUnit: deleteUnit,
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

  function addCompartment(unitId) {
    const unit = state.layout.find((u) => u.id === unitId);
    const created = {
      id: newId('c'),
      name: '新しい段',
      kind: 'FRIDGE',
      form: 'SHELF',
      width: 100,
      height: 68,
      color: null,
    };
    unit.compartments.push(created);
    selection = { type: 'comp', id: created.id };
    commit();
  }

  function addUnit() {
    const created = {
      id: newId('unit'),
      name: '新しい収納',
      type: 'SHELF',
      color: null,
      compartments: [
        { id: newId('c'), name: '棚', kind: 'ROOM_TEMP', form: 'SHELF', width: 100, height: 68, color: null },
      ],
    };
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

  function askConfirm(title, body, onYes) {
    confirmDialog.querySelector('#confirm-title').textContent = title;
    const bodyEl = confirmDialog.querySelector('#confirm-body');
    bodyEl.textContent = body;
    bodyEl.hidden = !body;

    const ok = confirmDialog.querySelector('#confirm-ok');
    /* 差し替えて前回の確認の宛先が残らないようにする */
    const fresh = ok.cloneNode(true);
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
  function quickAdd(name) {
    state.items.push({
      id: newId('item'),
      name,
      category: guessCategoryByName(name),
      compartmentId: null,
      expiryType: 'BEST_BEFORE',
      expiryDate: null,
      quantity: 1,
      registeredAt: todayIso(),
      janCode: null,
      memo: null,
    });
    rememberTemplate(name);
    saveState(state);
    render();
    toast(`${name} を「買ってきたもの」に入れました`);
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

  function logConsumption(item, type, quantity) {
    state.logs.push({
      id: newId('log'),
      name: item.name,
      category: item.category,
      type,
      quantity,
      date: todayIso(),
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
    }, undoable ? 6000 : 4000);
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
        <button class="btn btn-ghost" type="button" data-act="close">閉じる</button>
      </div>`;

    el.querySelectorAll('[data-act]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = el.dataset.itemId;
        el.close();
        if (button.dataset.act === 'eat') eatOne(id);
        else if (button.dataset.act === 'finish') eatAll(id);
        else if (button.dataset.act === 'discard') discardItem(id);
        else if (button.dataset.act === 'edit') openEditor(id);
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
          <button class="btn btn-primary" type="button" id="share-copy">コピーする</button>
          <button class="btn btn-ghost" type="button" data-close>閉じる</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => el.close()));
    el.querySelector('#share-copy').addEventListener('click', copyShareText);
    return el;
  }

  /**
   * 文面をそのまま見せる。
   * 共有シートもクリップボードも使えない端末があるので、
   * 最後は「選んで手で貼り付ける」ところまで必ず辿り着けるようにしておく。
   */
  function showShareText(title, text) {
    const area = shareDialog.querySelector('#share-text');
    shareDialog.querySelector('#share-title').textContent = title;
    shareDialog.querySelector('#share-lead').textContent =
      'この文面をコピーして、LINE やメールに貼り付けてください。';
    area.value = text;
    shareDialog.showModal();
    area.select();
  }

  async function copyShareText() {
    const area = shareDialog.querySelector('#share-text');
    area.select();
    try {
      await navigator.clipboard.writeText(area.value);
      shareDialog.querySelector('#share-lead').textContent = 'コピーしました。貼り付けて送ってください。';
      return;
    } catch (error) {
      /* クリップボードが使えない端末では、選択済みの文面を手で写してもらう */
      shareDialog.querySelector('#share-lead').textContent =
        'コピーできませんでした。文面を選んだ状態にしてあるので、長押しでコピーしてください。';
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
            <input id="f-quantity" name="quantity" type="number" min="1" step="1" value="1" inputmode="numeric">
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
    };

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

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
})();
