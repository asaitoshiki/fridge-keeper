/* ===========================================================================
   冷蔵庫の図 — 扉と引き出しの段組みを描き、食材をつまんで移せるようにする。
   スマホでの操作を前提に、HTML5 のドラッグ API ではなく Pointer Events を使う。
   （前者はタッチ端末で発火しないため）
   =========================================================================== */

const FridgeView = (function () {
  'use strict';

  const DRAG_THRESHOLD = 8;      /* これ以下の移動はタップとして扱う */
  const EDGE_ZONE = 96;          /* 画面端のこの範囲に来たら自動スクロールする */
  const EDGE_SPEED = 14;

  /* --- 色の派生 --------------------------------------------------------- */

  function hexToRgb(hex) {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const to = (x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  /** 正なら白へ、負なら黒へ寄せる。一つの色から面ごとの明暗を作るために使う */
  function shade(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const target = amount > 0 ? 255 : 0;
    const k = Math.abs(amount);
    return rgbToHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
  }

  /**
   * 背景に載せる文字色。
   * 濃い色を選ばれても文字が読めなくなっては困るので、明るさから決める。
   */
  function inkFor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lin = (c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return luminance > 0.42 ? '#12202a' : '#eef4f8';
  }

  function unitStyle(unit) {
    const parts = [];
    if (unit.color) {
      parts.push(
        `--metal-1:${shade(unit.color, 0.34)}`,
        `--metal-2:${unit.color}`,
        `--metal-3:${shade(unit.color, -0.22)}`,
        `--panel-1:${shade(unit.color, 0.4)}`,
        `--panel-2:${shade(unit.color, 0.12)}`,
      );
    }
    /* 取っ手は一本の金属に見せたいので、選ばれた色から明暗の三段を作る */
    if (unit.handleColor) {
      parts.push(
        `--chrome-hi:${shade(unit.handleColor, 0.42)}`,
        `--chrome-mid:${unit.handleColor}`,
        `--chrome-lo:${shade(unit.handleColor, -0.4)}`,
      );
    }
    return parts.join(';');
  }

  /**
   * 文字色の上書きは筐体の内側だけに閉じる。
   * 収納名の見出しは筐体の外（ページの地）に載るので、
   * ここまで明るい文字色を広げると濃い色を選んだ途端に見出しが読めなくなる。
   */
  function caseStyle(unit) {
    if (!unit.color) return '';
    const ink = inkFor(unit.color);
    return `--ink-2:${ink};--ink-3:${ink}`;
  }

  function compStyle(compartment) {
    const parts = [`--w:${compartment.width}`, `--h:${compartment.height}px`];
    if (compartment.color) {
      parts.push(`--cavity-1:${shade(compartment.color, -0.16)}`);
      parts.push(`--cavity-2:${shade(compartment.color, 0.1)}`);
      parts.push(`--ink-2:${inkFor(compartment.color)}`);
      parts.push(`--ink-3:${inkFor(compartment.color)}`);
    }
    return parts.join(';');
  }

  /* --- 構造の組み立て --------------------------------------------------- */

  /** 幅の合計が100%を超えたところで折り返す。段を横に並べられるようにするため */
  function packRows(compartments) {
    const rows = [];
    let row = [];
    let used = 0;

    compartments.forEach((compartment) => {
      if (row.length > 0 && used + compartment.width > 100) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push(compartment);
      used += compartment.width;
    });
    if (row.length > 0) rows.push(row);
    return rows;
  }

  /**
   * 段の並びを、扉ひとつ分と引き出しひとつ分の区画にまとめる。
   * 実際の冷蔵庫は「棚が何段か入った扉」の下に「引き出しが積まれる」構造なので、
   * 連続する棚・ドアポケットを1枚の扉として束ね、引き出しはそれぞれ独立させる。
   */
  function sections(compartments) {
    const out = [];
    let door = null;

    compartments.forEach((compartment) => {
      if (compartment.form !== 'DRAWER') {
        if (!door) {
          door = { type: 'door', items: [] };
          out.push(door);
        }
        door.items.push(compartment);
        return;
      }
      door = null;
      const last = out[out.length - 1];
      if (last && last.type === 'drawer') {
        last.items.push(compartment);
        return;
      }
      out.push({ type: 'drawer', items: [compartment] });
    });

    return out;
  }

  /* --- 描画 ------------------------------------------------------------ */

  /**
   * @param opts.editing    配置の編集モードか
   * @param opts.selection  編集中に選んでいる対象 {type:'comp'|'unit', id}
   * @param opts.kindFor    食材 → 収納の種類
   * @param opts.today      'YYYY-MM-DD'
   */
  function markup(state, opts) {
    const unplaced = state.items.filter((i) => !findCompartment(state.layout, i.compartmentId));
    return `
      ${opts.editing ? '<p class="notice">段をタップして選ぶと、下に調整が出ます。動かすと図がその場で変わります。</p>' : ''}
      ${opts.editing ? '' : trayMarkup(unplaced, state, opts)}
      <div class="stage"${opts.editing ? ' data-editing="true"' : ''}>
        ${state.layout.map((unit) => unitMarkup(unit, state, opts)).join('')}
        ${opts.editing ? '<button class="unit-add" type="button" data-add-unit>＋ 収納を追加</button>' : ''}
      </div>
      ${opts.editing ? settingsPanel(state, opts) : ''}`;
  }

  function unitMarkup(unit, state, opts) {
    const selected = opts.editing && opts.selection.type === 'unit' && opts.selection.id === unit.id;
    /* つまみが枠に切られないよう、選択中の段を抱える筐体には印を付けておく */
    const holdsSelection = opts.editing && opts.selection.type === 'comp'
      && unit.compartments.some((c) => c.id === opts.selection.id);

    return `
      <section class="unit${selected ? ' is-selected' : ''}${holdsSelection ? ' has-selection' : ''}" data-unit="${unit.id}"
               data-type="${unit.type}" data-handle="${unit.handle}" style="${unitStyle(unit)}">
        <header class="unit-head">
          ${opts.editing
            ? `<button class="unit-pick" type="button" data-select-unit="${unit.id}">
                 ${esc(unit.name)}<span>${selected ? '調整中' : 'タップで調整'}</span>
               </button>`
            : `<span class="unit-name">${esc(unit.name)}</span>`}
        </header>
        <div class="case" style="${caseStyle(unit)}" data-case="${unit.id}">
          ${unit.type === 'FRIDGE' ? '<span class="case-top" aria-hidden="true"></span>' : ''}
          <div class="unit-body">
            ${sections(unit.compartments).map((section) => sectionMarkup(section, state, opts)).join('')}
            ${opts.editing ? `<button class="comp-add" type="button" data-add-comp="${unit.id}">＋ 段を追加</button>` : ''}
          </div>
          ${opts.editing ? handleZones(unit) : ''}
        </div>
        ${unit.type === 'FRIDGE' ? '<span class="case-feet" aria-hidden="true"><i></i><i></i></span>' : ''}
      </section>`;
  }

  /**
   * 取っ手をつまんで動かすときの行き先。
   * 動かしている間だけ出す。常に出しておくと図が印だらけになって中身が読めない。
   * 「なし」を真ん中に置くのは、外す操作もつまんで運ぶ同じ動きで終わらせるため。
   */
  function handleZones(unit) {
    const zone = (key) => `<span class="hzone hzone-${key.toLowerCase()}" data-zone="${key}">${HANDLE_LABELS[key]}</span>`;
    return `
      <div class="handle-zones" aria-hidden="true">
        ${['TOP', 'RIGHT', 'BOTTOM', 'LEFT', 'NONE'].map(zone).join('')}
      </div>
      ${unit.handle === 'NONE'
        ? '<span class="handle-ghost" data-handle-grip aria-hidden="true">取っ手</span>'
        : ''}`;
  }

  /** 扉は棚を抱えた一枚板、引き出しは前板と取っ手を持つ箱として描く */
  function sectionMarkup(section, state, opts) {
    if (section.type === 'door') {
      return `
        <div class="door">
          <div class="door-inner">
            ${packRows(section.items).map((row) => rowMarkup(row, state, opts, false)).join('')}
          </div>
          <span class="door-handle" aria-hidden="true"></span>
        </div>`;
    }
    return packRows(section.items).map((row) => rowMarkup(row, state, opts, true)).join('');
  }

  function rowMarkup(row, state, opts, asDrawer) {
    const cells = row.map((compartment) => {
      const cell = compMarkup(compartment, state, opts);
      return asDrawer
        ? `<div class="drawer-box" style="--w:${compartment.width}">
             ${cell}<span class="drawer-pull" aria-hidden="true"></span>
           </div>`
        : cell;
    }).join('');
    return `<div class="${asDrawer ? 'drawer' : 'shelf-row'}">${cells}</div>`;
  }

  function compMarkup(compartment, state, opts) {
    const items = state.items.filter((i) => i.compartmentId === compartment.id);
    const selected = opts.editing && opts.selection.type === 'comp' && opts.selection.id === compartment.id;

    return `
      <section class="comp${selected ? ' is-selected' : ''}" data-kind="${compartment.kind}"
               data-form="${compartment.form}" style="${compStyle(compartment)}"
               ${opts.editing ? `data-select="${compartment.id}"` : `data-drop="${compartment.id}"`}>
        <header class="comp-head">
          <span class="comp-name">${esc(compartment.name)}</span>
          <span class="comp-kind">${STORAGE_LABELS[compartment.kind]}</span>
          ${items.length > 0 ? `<span class="comp-count">${items.length}</span>` : ''}
        </header>
        ${opts.editing
          ? ''
          : `<div class="comp-items">${items.map((i) => chip(i, state, opts)).join('')}</div>`}
        ${selected ? gripMarkup(compartment) : ''}
      </section>`;
  }

  /**
   * 選んだ段だけに、右端と下端のつまみを出す。
   * 全部の段に出すと図が握りだらけになり、押し間違える。
   */
  function gripMarkup(compartment) {
    return `
      <span class="size-tag" aria-hidden="true">${compartment.width}% × ${compartment.height}</span>
      <span class="grip grip-move" data-move-grip="${compartment.id}" role="button"
            aria-label="${esc(compartment.name)}の位置を動かす"><i></i><i></i><i></i></span>
      <span class="grip grip-w" data-grip="w:${compartment.id}" role="separator"
            aria-label="横幅を変える" aria-orientation="vertical"></span>
      <span class="grip grip-h" data-grip="h:${compartment.id}" role="separator"
            aria-label="高さを変える" aria-orientation="horizontal"></span>`;
  }

  function trayMarkup(items, state, opts) {
    return `
      <section class="tray" data-drop="">
        <header class="tray-head">
          <span>買ってきたもの</span>
          <span class="tray-hint">${items.length > 0 ? 'つまんで冷蔵庫へ入れる' : 'ここは空です'}</span>
        </header>
        <div class="comp-items">${items.map((i) => chip(i, state, opts)).join('')}</div>
      </section>`;
  }

  function chip(item, state, opts) {
    const u = urgencyOf(item, opts.kindFor(item), opts.today);
    const useBy = item.expiryType === 'USE_BY';
    return `
      <button class="chip" type="button" data-item="${item.id}" data-level="${u.level}"
              data-estimated="${u.estimated}" ${useBy ? 'data-useby="true"' : ''}
              aria-label="${esc(item.name)} ${remainingLabel(u.days)}${u.estimated ? '（目安）' : ''}">
        ${item.icon ? `<span class="chip-icon" aria-hidden="true">${item.icon}</span>` : ''}
        <span class="chip-name">${esc(item.name)}${item.quantity > 1 ? `<i>×${item.quantity}</i>` : ''}</span>
        ${u.estimated && u.date ? '<span class="chip-est">目安</span>' : ''}
        <span class="chip-days">${shortRemainingLabel(u.days)}</span>
      </button>`;
  }

  /* --- 調整パネル ------------------------------------------------------- */

  function settingsPanel(state, opts) {
    if (opts.selection.type === 'unit') {
      const unit = state.layout.find((u) => u.id === opts.selection.id);
      if (unit) return unitSettings(unit);
    }
    const compartment = findCompartment(state.layout, opts.selection.id);
    if (compartment) return compSettings(state, compartment);

    return '<section class="settings settings-empty">段か収納をタップすると、ここで調整できます。</section>';
  }

  function unitSettings(unit) {
    return `
      <section class="settings">
        <header class="settings-head">
          <span>${esc(unit.name)}</span>
          <button class="mini danger" type="button" data-del-unit="${unit.id}">削除</button>
        </header>

        <label class="field-row">
          <span>名前</span>
          <input type="text" value="${esc(unit.name)}" data-unit-name="${unit.id}">
        </label>

        <label class="field-row">
          <span>見た目</span>
          <select data-unit-type="${unit.id}">
            <option value="FRIDGE" ${unit.type === 'FRIDGE' ? 'selected' : ''}>冷蔵庫</option>
            <option value="SHELF" ${unit.type === 'SHELF' ? 'selected' : ''}>棚</option>
          </select>
        </label>

        <div class="field-row">
          <span>取っ手</span>
          <div class="seg">
            ${Object.entries(HANDLE_LABELS).map(([key, label]) => `
              <button class="seg-btn" type="button" data-unit-handle="${unit.id}" data-handle-value="${key}"
                      aria-pressed="${unit.handle === key}">${label}</button>`).join('')}
          </div>
        </div>
        <p class="size-hint">図の<b>取っ手をつまんで</b>、置きたい辺へ運んでも変えられます。
           真ん中で離すと外れます。</p>

        ${colorField(unit.color, `data-unit-color="${unit.id}"`, unit.type === 'FRIDGE' ? '冷蔵庫の色' : '棚の色')}
        ${unit.handle === 'NONE'
          ? ''
          : colorField(unit.handleColor, `data-unit-handle-color="${unit.id}"`, '取っ手の色', HANDLE_COLORS)}
      </section>`;
  }

  function compSettings(state, compartment) {
    const unit = findUnitOf(state.layout, compartment.id);
    const index = unit.compartments.findIndex((c) => c.id === compartment.id);
    const last = index === unit.compartments.length - 1;

    return `
      <section class="settings">
        <header class="settings-head">
          <span>${esc(unit.name)} ${esc(compartment.name)}</span>
          <button class="mini danger" type="button" data-del-comp="${compartment.id}">削除</button>
        </header>

        <label class="field-row">
          <span>名前</span>
          <input type="text" value="${esc(compartment.name)}" data-comp-name="${compartment.id}">
        </label>

        <div class="field-grid">
          <label class="field-row">
            <span>種類</span>
            <select data-comp-kind="${compartment.id}">
              ${Object.entries(STORAGE_LABELS)
                .map(([k, v]) => `<option value="${k}" ${k === compartment.kind ? 'selected' : ''}>${v}</option>`)
                .join('')}
            </select>
          </label>
          <label class="field-row">
            <span>形</span>
            <select data-comp-form="${compartment.id}">
              ${Object.entries(FORM_LABELS)
                .map(([k, v]) => `<option value="${k}" ${k === compartment.form ? 'selected' : ''}>${v}</option>`)
                .join('')}
            </select>
          </label>
        </div>

        <div class="field-row">
          <span>大きさ</span>
          <p class="size-hint">図の中の<b>右端</b>と<b>下端</b>のつまみを引いて変えられます。
             いまは <b>${compartment.width}%</b> × <b>${compartment.height}</b>。</p>
        </div>

        ${colorField(compartment.color, `data-comp-color="${compartment.id}"`, '庫内の色')}

        <div class="field-row">
          <span>並び</span>
          <div class="order-buttons">
            <button class="mini" type="button" data-move="${compartment.id}:-1" ${index === 0 ? 'disabled' : ''}>↑ 上へ</button>
            <button class="mini" type="button" data-move="${compartment.id}:1" ${last ? 'disabled' : ''}>↓ 下へ</button>
          </div>
        </div>
      </section>`;
  }

  /**
   * 色の選択。期限の警告に使う赤・橙・黄は選択肢に置かない。
   * 庫内をその色にできると、期限切れの食材が背景に紛れてしまうため。
   */
  function colorField(current, attrs, label, palette) {
    const swatches = (palette || CASE_COLORS).map((option) => {
      const on = (option.value || null) === (current || null);
      const style = option.value ? `background:${option.value}` : '';
      return `<button class="swatch${on ? ' is-on' : ''}${option.value ? '' : ' swatch-none'}" type="button"
                      style="${style}" title="${option.label}"
                      ${attrs} data-color="${option.value || ''}">${option.value ? '' : '既定'}</button>`;
    }).join('');

    return `
      <div class="field-row color-row">
        <span>${label}</span>
        <div class="swatches">${swatches}</div>
      </div>`;
  }



  /* --- 段をつまんで入れ替える ---------------------------------------------- */

  /** 行の幅のこれを下回る段は、横に並んでいるとみなす */
  const NARROW_RATIO = 0.75;

  /**
   * 指の位置が、その段より後ろか。
   *
   * 縦に積まれた段は上下の真ん中で、横に二つ並んだ段は左右の真ん中で決める。
   * 幅いっぱいの段まで左右で決めると、上に重ねたいのか下に重ねたいのかを
   * 指の高さで言えなくなる。
   */
  function isAfter(rect, x, y, rowWidth) {
    if (y > rect.bottom) return true;
    if (y < rect.top) return false;
    if (rect.width < rowWidth * NARROW_RATIO) return x > rect.left + rect.width / 2;
    return y > rect.top + rect.height / 2;
  }

  /**
   * 段をつまんで並べ替える。
   *
   * ↑↓ のボタンは一段ずつしか動かせず、離れた場所へ移すのに何度も押すことになる。
   * 運びたい場所へ運ぶほうが早いので、同じ収納の中で指の位置から行き先を決める。
   */
  function bindMoveGrips(root, state, opts) {
    root.querySelectorAll('[data-move-grip]').forEach((grip) => {
      const id = grip.dataset.moveGrip;
      let moving = null;
      let siblings = [];
      let target = null;
      let rowWidth = 1;

      const clearMarks = () => {
        siblings.forEach(({ el }) => el.classList.remove('is-drop-before', 'is-drop-after'));
      };

      grip.addEventListener('pointerdown', (event) => {
        const unit = findUnitOf(state.layout, id);
        if (!unit || unit.compartments.length < 2) return;

        event.preventDefault();
        event.stopPropagation();
        moving = unit;
        /* 掴んだ時点の位置を覚える。動かしている間に図は描き直さない */
        siblings = unit.compartments.map((c) => {
          const el = root.querySelector(`.comp[data-select="${c.id}"]`);
          return el ? { id: c.id, el, rect: el.getBoundingClientRect() } : null;
        }).filter(Boolean);
        target = null;
        /* 横に並んでいるかどうかの基準になる、収納の中身の幅 */
        const body = root.querySelector(`.unit[data-unit="${unit.id}"] .unit-body`);
        rowWidth = body ? body.getBoundingClientRect().width : 1;
        grip.setPointerCapture(event.pointerId);
        grip.classList.add('is-held');
        const self = siblings.find((sib) => sib.id === id);
        if (self) self.el.classList.add('is-moving');
      });

      grip.addEventListener('pointermove', (event) => {
        if (!moving) return;
        event.preventDefault();

        /* 自分より前にある段の数が、そのまま入る位置になる */
        let index = 0;
        siblings.forEach((sib) => {
          if (sib.id === id) return;
          if (isAfter(sib.rect, event.clientX, event.clientY, rowWidth)) index += 1;
        });
        target = index;

        clearMarks();
        const others = siblings.filter((sib) => sib.id !== id);
        if (others.length === 0) return;
        /* 行き先は、そこへ入ることが分かる線で示す。最後尾だけ後ろ側に出す */
        if (index < others.length) others[index].el.classList.add('is-drop-before');
        else others[others.length - 1].el.classList.add('is-drop-after');
      });

      const release = () => {
        if (!moving) return;
        const unit = moving;
        const index = target;
        moving = null;
        target = null;
        grip.classList.remove('is-held');
        clearMarks();
        siblings.forEach(({ el }) => el.classList.remove('is-moving'));

        const from = unit.compartments.findIndex((c) => c.id === id);
        if (index === null || index === from) {
          /* 動かさずに離したときは並びを触らない。選び直しただけの操作にする */
          opts.onRedraw();
          return;
        }
        opts.onLayout((layout) => {
          const target = layout.find((u) => u.id === unit.id);
          const at = target.compartments.findIndex((c) => c.id === id);
          const [moved] = target.compartments.splice(at, 1);
          target.compartments.splice(index, 0, moved);
        });
      };

      grip.addEventListener('pointerup', release);
      grip.addEventListener('pointercancel', release);
    });
  }

  /* --- 取っ手をつまんで動かす ---------------------------------------------- */

  /** 真ん中のこの割合までは「なし」。端のどれでもない場所で離したときの行き先 */
  const HANDLE_CENTER = 0.42;

  /** 筐体の中のどこで離したかを、置き場所に読み替える */
  function zoneAt(rect, x, y) {
    const dx = (x - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (y - (rect.top + rect.height / 2)) / (rect.height / 2);
    if (Math.abs(dx) < HANDLE_CENTER && Math.abs(dy) < HANDLE_CENTER) return 'NONE';
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
    return dy > 0 ? 'BOTTOM' : 'TOP';
  }

  /**
   * 取っ手をつまんで、四辺と「なし」へ運べるようにする。
   *
   * 編集中はどの収納の取っ手も掴める。収納を選んでからでないと掴めないと、
   * 取っ手に触っても何も起きず、動かせること自体に気づけない。
   * 扉の棒も引き出しの棒も同じように掴めるようにしてある。
   */
  function bindHandleGrips(root, state, opts) {
    state.layout.forEach((unit) => {
      const unitEl = root.querySelector(`.unit[data-unit="${unit.id}"]`);
      if (!unitEl) return;

      const caseEl = unitEl.querySelector('[data-case]');
      const zones = unitEl.querySelector('.handle-zones');
      if (!caseEl || !zones) return;

      /* 取っ手が無いときは代わりの掴みどころ。あるときは棒そのものを全部握らせる */
      const grips = unit.handle === 'NONE'
        ? [...unitEl.querySelectorAll('[data-handle-grip]')]
        : [...unitEl.querySelectorAll('.door-handle, .drawer-pull')];

      grips.forEach((grip) => attachHandleGrip(grip, unit.id, caseEl, zones, opts));
    });
  }

  function attachHandleGrip(grip, unitId, caseEl, zones, opts) {
    grip.classList.add('is-grabbable');

    let dragging = false;
    let picked = null;

    const paint = (zone) => {
      zones.querySelectorAll('.hzone').forEach((el) => {
        el.classList.toggle('is-on', el.dataset.zone === zone);
      });
    };

    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      picked = null;
      grip.setPointerCapture(event.pointerId);
      caseEl.classList.add('is-placing-handle');
      paint(null);
    });

    grip.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      event.preventDefault();
      picked = zoneAt(caseEl.getBoundingClientRect(), event.clientX, event.clientY);
      paint(picked);
    });

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      caseEl.classList.remove('is-placing-handle');
      /* 動かさずに離したときは何も変えない。触っただけで消えるのは乱暴 */
      if (!picked) return;
      const zone = picked;
      picked = null;
      opts.onLayout((layout) => {
        layout.find((u) => u.id === unitId).handle = zone;
      });
    };

    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', () => {
      dragging = false;
      picked = null;
      caseEl.classList.remove('is-placing-handle');
    });
  }

  /* --- 操作 ------------------------------------------------------------ */

  function bind(root, state, opts) {
    if (opts.editing) return bindEditor(root, state, opts);
    root.querySelectorAll('.chip[data-item]').forEach((chipEl) => attachDrag(chipEl, opts));
  }

  function bindEditor(root, state, opts) {
    const on = (selector, event, handler) => {
      root.querySelectorAll(selector).forEach((el) => el.addEventListener(event, () => handler(el)));
    };

    on('[data-select]', 'click', (el) => opts.onSelect('comp', el.dataset.select));
    on('[data-select-unit]', 'click', (el) => opts.onSelect('unit', el.dataset.selectUnit));

    /* 名前は打つたびに描き直すと入力欄からフォーカスが外れるので、保存だけして描き直さない */
    on('[data-comp-name]', 'change', (el) => {
      const name = el.value.trim() || '名称未設定';
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compName).name = name; }, true);
    });
    on('[data-unit-name]', 'change', (el) => {
      const name = el.value.trim() || '名称未設定';
      opts.onLayout((layout) => { layout.find((u) => u.id === el.dataset.unitName).name = name; }, true);
    });

    on('[data-comp-kind]', 'change', (el) => {
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compKind).kind = el.value; });
    });
    on('[data-comp-form]', 'change', (el) => {
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compForm).form = el.value; });
    });
    on('[data-unit-type]', 'change', (el) => {
      opts.onLayout((layout) => { layout.find((u) => u.id === el.dataset.unitType).type = el.value; });
    });

    bindGrips(root, state, opts);

    root.querySelectorAll('[data-comp-color]').forEach((el) => {
      el.addEventListener('click', () => {
        opts.onLayout((layout) => {
          findCompartment(layout, el.dataset.compColor).color = el.dataset.color || null;
        });
      });
    });
    root.querySelectorAll('[data-unit-color]').forEach((el) => {
      el.addEventListener('click', () => {
        opts.onLayout((layout) => {
          layout.find((u) => u.id === el.dataset.unitColor).color = el.dataset.color || null;
        });
      });
    });
    root.querySelectorAll('[data-unit-handle-color]').forEach((el) => {
      el.addEventListener('click', () => {
        opts.onLayout((layout) => {
          layout.find((u) => u.id === el.dataset.unitHandleColor).handleColor = el.dataset.color || null;
        });
      });
    });
    on('[data-unit-handle]', 'click', (el) => {
      opts.onLayout((layout) => {
        layout.find((u) => u.id === el.dataset.unitHandle).handle = el.dataset.handleValue;
      });
    });

    bindHandleGrips(root, state, opts);
    bindMoveGrips(root, state, opts);

    on('[data-move]', 'click', (el) => {
      const [id, delta] = el.dataset.move.split(':');
      opts.onLayout((layout) => {
        const unit = findUnitOf(layout, id);
        const from = unit.compartments.findIndex((c) => c.id === id);
        const [moved] = unit.compartments.splice(from, 1);
        unit.compartments.splice(from + Number(delta), 0, moved);
      });
    });

    on('[data-del-comp]', 'click', (el) => opts.onDeleteCompartment(el.dataset.delComp));
    on('[data-del-unit]', 'click', (el) => opts.onDeleteUnit(el.dataset.delUnit));
    on('[data-add-comp]', 'click', (el) => opts.onAddCompartment(el.dataset.addComp));
    on('[data-add-unit]', 'click', () => opts.onAddUnit());
  }

  /**
   * つまみを引いている間は描き直さず、図の該当箇所の寸法だけ直接書き換える。
   * 毎回描き直すとつまみから指が外れてしまい、狙った大きさで止められない。
   * 指を離した時点で描き直し、折り返しなど全体の組み直しを反映する。
   */
  function bindGrips(root, state, opts) {
    const stage = root.querySelector('.stage');

    root.querySelectorAll('[data-grip]').forEach((grip) => {
      const [axis, id] = grip.dataset.grip.split(':');
      let origin = 0;
      let startValue = 0;
      let rowWidth = 1;
      let scale = 1;
      let comp = null;
      let box = null;
      let tag = null;

      grip.addEventListener('pointerdown', (event) => {
        comp = root.querySelector(`.comp[data-select="${id}"]`);
        if (!comp) return;

        const compartment = findCompartment(state.layout, id);
        box = comp.closest('.drawer-box');
        tag = comp.querySelector('.size-tag');

        /* 幅は割合なので、その段が載っている行の実寸を基準にする */
        const row = comp.closest('.shelf-row, .drawer');
        rowWidth = (row || comp).getBoundingClientRect().width || 1;
        /* 高さは描画時に縮めてあるので、指の移動量をもとの尺度へ戻す */
        scale = Number(getComputedStyle(stage).getPropertyValue('--scale')) || 1;

        origin = axis === 'w' ? event.clientX : event.clientY;
        startValue = axis === 'w' ? compartment.width : compartment.height;
        grip.setPointerCapture(event.pointerId);
        grip.classList.add('is-held');
        event.preventDefault();
      });

      grip.addEventListener('pointermove', (event) => {
        if (!comp) return;
        event.preventDefault();

        if (axis === 'w') {
          const next = clampWidth(startValue + ((event.clientX - origin) / rowWidth) * 100);
          comp.style.setProperty('--w', next);
          if (box) box.style.setProperty('--w', next);
          opts.onLayout((layout) => { findCompartment(layout, id).width = next; }, true);
        } else {
          const next = clampHeight(startValue + (event.clientY - origin) / scale);
          comp.style.setProperty('--h', `${next}px`);
          opts.onLayout((layout) => { findCompartment(layout, id).height = next; }, true);
        }

        if (tag) {
          const current = findCompartment(state.layout, id);
          tag.textContent = `${current.width}% × ${current.height}`;
        }
      });

      const release = () => {
        if (!comp) return;
        comp = null;
        grip.classList.remove('is-held');
        opts.onRedraw();
      };
      grip.addEventListener('pointerup', release);
      grip.addEventListener('pointercancel', release);
    });
  }

  /* --- ドラッグ --------------------------------------------------------- */

  let drag = null;

  function attachDrag(chipEl, opts) {
    chipEl.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drag = {
        el: chipEl,
        itemId: chipEl.dataset.item,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        ghost: null,
        target: undefined,
        opts,
      };
      chipEl.setPointerCapture(event.pointerId);
    });

    chipEl.addEventListener('pointermove', onPointerMove);
    chipEl.addEventListener('pointerup', onPointerUp);
    chipEl.addEventListener('pointercancel', cancelDrag);
  }

  function onPointerMove(event) {
    if (!drag) return;
    drag.x = event.clientX;
    drag.y = event.clientY;

    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return;
      startDrag();
    }

    event.preventDefault();
    drag.ghost.style.transform = `translate(${drag.x}px, ${drag.y}px)`;
    highlightTargetUnder(drag.x, drag.y);
  }

  function startDrag() {
    drag.active = true;

    const rect = drag.el.getBoundingClientRect();
    const ghost = drag.el.cloneNode(true);
    ghost.className = `${drag.el.className} chip-ghost`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.marginLeft = `${rect.left - drag.startX}px`;
    ghost.style.marginTop = `${rect.top - drag.startY}px`;
    document.body.appendChild(ghost);

    drag.ghost = ghost;
    drag.el.classList.add('chip-lifted');
    document.body.classList.add('is-dragging');
    requestAnimationFrame(edgeScroll);
  }

  /**
   * 端まで運んだときに画面を送る。スマホでは冷蔵庫全体が一画面に収まらないため。
   * 送る相手はウィンドウではなく本文の領域。上下のバーは動かないので、
   * その内側だけを基準に端を判定する。
   */
  function edgeScroll() {
    if (!drag || !drag.active) return;
    const screen = document.querySelector('.screen');
    if (!screen) return;

    const rect = screen.getBoundingClientRect();
    const top = drag.y - (rect.top + EDGE_ZONE);
    const bottom = drag.y - (rect.bottom - EDGE_ZONE);
    if (top < 0) screen.scrollBy(0, Math.max(-EDGE_SPEED, top / 6));
    else if (bottom > 0) screen.scrollBy(0, Math.min(EDGE_SPEED, bottom / 6));
    requestAnimationFrame(edgeScroll);
  }

  function highlightTargetUnder(x, y) {
    const under = document.elementFromPoint(x, y);
    const zone = under ? under.closest('[data-drop]') : null;

    document.querySelectorAll('[data-drop].is-over').forEach((el) => el.classList.remove('is-over'));
    if (zone) zone.classList.add('is-over');
    drag.target = zone ? zone.dataset.drop || null : undefined;
  }

  function onPointerUp() {
    if (!drag) return;
    const { active, itemId, target, opts } = drag;
    cleanup();

    if (!active) {
      opts.onOpenItem(itemId);
      return;
    }
    if (target !== undefined) opts.onMove(itemId, target);
    else opts.onRedraw();
  }

  function cancelDrag() {
    if (!drag) return;
    const redraw = drag.active ? drag.opts.onRedraw : null;
    cleanup();
    if (redraw) redraw();
  }

  function cleanup() {
    if (drag && drag.ghost) drag.ghost.remove();
    if (drag && drag.el) drag.el.classList.remove('chip-lifted');
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('[data-drop].is-over').forEach((el) => el.classList.remove('is-over'));
    drag = null;
  }

  /* --- ユーティリティ --------------------------------------------------- */

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  return { markup, bind };
})();
