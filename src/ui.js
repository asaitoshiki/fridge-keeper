/* ===========================================================================
   画面 — 状態を描き、入力を受け取る。ロジックは domain.js に置く。
   =========================================================================== */

(function () {
  'use strict';

  /* 何日前から「使い切りたい」として扱うか。仕様書6.6の既定値 */
  const ALERT_THRESHOLD_DAYS = 3;

  let state = loadState();
  let locationFilter = 'ALL';
  let editingId = null;

  const root = document.getElementById('app');
  const dialog = buildDialog();
  document.body.appendChild(dialog);

  render();

  /* --- 描画 ------------------------------------------------------------ */

  function render() {
    const today = todayIso();
    const visible = state.items.filter(
      (item) => locationFilter === 'ALL' || item.storageLocation === locationFilter
    );
    const sorted = sortByExpiry(visible, today);

    root.innerHTML = [
      masthead(),
      summary(today),
      filters(),
      sheet(sorted, today),
      disclaimer(),
    ].join('');

    root.insertAdjacentHTML('beforeend', fab());
    bind();
  }

  function masthead() {
    const total = state.items.length;
    return `
      <header class="masthead">
        <h1 class="wordmark">冷蔵庫<span>キーパー</span></h1>
        <div class="tally">${total} ITEMS${state.sampleLoaded ? ' · SAMPLE' : ''}</div>
      </header>`;
  }

  /**
   * 開いた瞬間に全体の状況が分かるようにする。
   * Web版では定時通知を出せないため、ここが唯一の「気づかせる」経路になる（仕様書8.3）。
   */
  function summary(today) {
    if (state.items.length === 0) return '';

    const urgent = state.items
      .map((item) => ({ item, u: urgencyOf(item, today) }))
      .filter((x) => x.u.days !== null && x.u.days <= ALERT_THRESHOLD_DAYS)
      .sort((a, b) => a.u.days - b.u.days);

    if (urgent.length === 0) {
      return `
        <section class="summary" data-level="NONE">
          <div class="summary-eyebrow">今日 ${formatDate(today)}</div>
          <div class="summary-head">${ALERT_THRESHOLD_DAYS}日以内に期限を迎える食材はありません</div>
          <div class="summary-names">在庫 ${state.items.length} 件を管理中です。</div>
        </section>`;
    }

    const worst = urgent[0].u.level;
    const names = urgent.slice(0, 3).map((x) => esc(x.item.name)).join('、');
    const rest = urgent.length > 3 ? ` 他${urgent.length - 3}件` : '';
    const expired = urgent.filter((x) => x.u.days < 0).length;

    return `
      <section class="summary" data-level="${worst}">
        <div class="summary-eyebrow">今日 ${formatDate(today)}</div>
        <div class="summary-head">使い切りたい食材が <b>${urgent.length}</b> つあります</div>
        <div class="summary-names">${names}${rest}${expired > 0 ? `／うち期限超過 ${expired}件` : ''}</div>
      </section>`;
  }

  function filters() {
    const counts = { ALL: state.items.length };
    Object.keys(STORAGE_LABELS).forEach((key) => {
      counts[key] = state.items.filter((i) => i.storageLocation === key).length;
    });

    const chip = (key, label) => `
      <button class="chip" type="button" data-filter="${key}" aria-pressed="${locationFilter === key}">
        ${label}<em>${counts[key]}</em>
      </button>`;

    return `
      <nav class="filters" aria-label="保管場所で絞り込む">
        ${chip('ALL', 'すべて')}
        ${Object.entries(STORAGE_LABELS).map(([k, v]) => chip(k, v)).join('')}
      </nav>`;
  }

  function sheet(items, today) {
    if (items.length === 0) {
      return `<div class="sheet"><div class="empty">${
        state.items.length === 0
          ? '<strong>食材がまだ登録されていません</strong>右下の「食材を追加」から登録してください。'
          : '<strong>この保管場所には何もありません</strong>ほかのタブを見てください。'
      }</div></div>`;
    }
    return `<div class="sheet">${items.map((item) => row(item, today)).join('')}</div>`;
  }

  function row(item, today) {
    const u = urgencyOf(item, today);
    const useBy = item.expiryType === 'USE_BY';

    const badges = [
      u.estimated ? '<span class="badge badge-estimate">目安</span>' : '',
      useBy ? '<span class="badge badge-useby">消費期限</span>' : '',
    ].join('');

    return `
      <button class="row" type="button" data-id="${item.id}" data-level="${u.level}" data-estimated="${u.estimated}">
        <span class="row-bar" aria-hidden="true"></span>
        <span class="row-main">
          <span class="row-name">${esc(item.name)}${item.quantity > 1 ? `<span class="qty">×${item.quantity}</span>` : ''}</span>
          <span class="row-meta">
            ${STORAGE_LABELS[item.storageLocation]}・${CATEGORY_LABELS[item.category]}
            ${badges}
          </span>
        </span>
        <span class="row-side">
          <span class="row-days">${remainingLabel(u.days)}</span>
          <span class="row-date">${u.date ? formatDate(u.date) : '—'}</span>
        </span>
      </button>`;
  }

  function disclaimer() {
    return `
      <section class="disclaimer">
        <h2>免責</h2>
        本アプリが表示する期限および目安日数は一般的な参考情報であり、食品の実際の安全性を保証するものではありません。
        実際の日持ちは、購入時の鮮度・開封の有無・保管温度等により大きく変動します。
        喫食の可否は、必ずご自身で食品の状態（見た目・におい等）を確認してご判断ください。
        本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を負いません。
        ${state.sampleLoaded ? '<br><button class="textlink" type="button" id="clear-sample">サンプルデータを削除して空から始める</button>' : ''}
      </section>`;
  }

  function fab() {
    return `
      <button class="fab" type="button" id="add-item">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>
        食材を追加
      </button>`;
  }

  /* --- 操作 ------------------------------------------------------------ */

  function bind() {
    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        locationFilter = el.dataset.filter;
        render();
      });
    });

    root.querySelectorAll('.row').forEach((el) => {
      el.addEventListener('click', () => openEditor(el.dataset.id));
    });

    root.querySelector('#add-item').addEventListener('click', () => openEditor(null));

    const clear = root.querySelector('#clear-sample');
    if (clear) {
      clear.addEventListener('click', () => {
        state.items = state.items.filter((i) => !i.sample);
        state.sampleLoaded = false;
        commit();
      });
    }
  }

  function commit() {
    saveState(state);
    render();
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
          <input id="f-name" name="name" type="text" required autocomplete="off" placeholder="にんじん">
        </div>

        <div class="field-pair">
          <div class="field">
            <label for="f-category">カテゴリ</label>
            <select id="f-category" name="category">
              ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-location">保管場所</label>
            <select id="f-location" name="storageLocation">
              ${Object.entries(STORAGE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
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
            <label for="f-quantity">個数</label>
            <input id="f-quantity" name="quantity" type="number" min="1" step="1" value="1" inputmode="numeric">
          </div>
        </div>

        <div class="field">
          <label for="f-date">期限日 <span class="optional">— 書いていなければ空のままで</span></label>
          <input id="f-date" name="expiryDate" type="date">
        </div>

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
    ['f-category', 'f-location', 'f-date'].forEach((id) => {
      el.querySelector(`#${id}`).addEventListener('change', updateHint);
    });
    return el;
  }

  function openEditor(id) {
    editingId = id;
    const item = id ? state.items.find((i) => i.id === id) : null;

    dialog.querySelector('#editor-title').textContent = item ? '食材を編集' : '食材を追加';
    dialog.querySelector('#editor-delete').hidden = !item;
    dialog.querySelector('#f-name').value = item ? item.name : '';
    dialog.querySelector('#f-category').value = item ? item.category : 'VEGETABLE';
    dialog.querySelector('#f-location').value = item ? item.storageLocation : 'FRIDGE';
    dialog.querySelector('#f-type').value = item ? item.expiryType : 'BEST_BEFORE';
    dialog.querySelector('#f-quantity').value = item ? item.quantity : 1;
    dialog.querySelector('#f-date').value = item && item.expiryDate ? item.expiryDate : '';
    dialog.querySelector('#f-memo').value = item && item.memo ? item.memo : '';

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
    const location = dialog.querySelector('#f-location').value;
    const days = presetDaysFor(category, location);
    const base = editingId
      ? state.items.find((i) => i.id === editingId).registeredAt
      : todayIso();

    if (days === null) {
      hint.innerHTML = `${CATEGORY_LABELS[category]}を${STORAGE_LABELS[location]}で保管する場合の目安がないため、<b>期限なし</b>として扱います。`;
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
      storageLocation: f.storageLocation.value,
      expiryType: f.expiryType.value,
      expiryDate: f.expiryDate.value || null,
      quantity: Math.max(1, Number(f.quantity.value) || 1),
      memo: f.memo.value.trim() || null,
    };

    const existing = editingId ? state.items.find((i) => i.id === editingId) : null;
    if (existing) {
      Object.assign(existing, values);
    } else {
      state.items.push({
        id: newId(),
        registeredAt: todayIso(),
        janCode: null,
        ...values,
      });
    }

    dialog.close();
    commit();
  }

  function onDelete() {
    state.items = state.items.filter((i) => i.id !== editingId);
    dialog.close();
    commit();
  }

  /* --- ユーティリティ --------------------------------------------------- */

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
})();
