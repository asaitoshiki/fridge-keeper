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
    if (!unit.color) return '';
    return [
      `--metal-1:${shade(unit.color, 0.34)}`,
      `--metal-2:${unit.color}`,
      `--metal-3:${shade(unit.color, -0.22)}`,
      `--panel-1:${shade(unit.color, 0.4)}`,
      `--panel-2:${shade(unit.color, 0.12)}`,
    ].join(';');
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
      <div class="stage">
        ${state.layout.map((unit) => unitMarkup(unit, state, opts)).join('')}
        ${opts.editing ? '<button class="unit-add" type="button" data-add-unit>＋ 収納を追加</button>' : ''}
      </div>
      ${opts.editing ? settingsPanel(state, opts) : trayMarkup(unplaced, state, opts)}`;
  }

  function unitMarkup(unit, state, opts) {
    const selected = opts.editing && opts.selection.type === 'unit' && opts.selection.id === unit.id;
    return `
      <section class="unit${selected ? ' is-selected' : ''}" data-unit="${unit.id}"
               data-type="${unit.type}" style="${unitStyle(unit)}">
        <header class="unit-head">
          ${opts.editing
            ? `<button class="unit-pick" type="button" data-select-unit="${unit.id}">
                 ${esc(unit.name)}<span>${selected ? '調整中' : 'タップで調整'}</span>
               </button>`
            : `<span class="unit-name">${esc(unit.name)}</span>`}
        </header>
        <div class="case" style="${caseStyle(unit)}">
          ${unit.type === 'FRIDGE' ? '<span class="case-top" aria-hidden="true"></span>' : ''}
          <div class="unit-body">
            ${sections(unit.compartments).map((section) => sectionMarkup(section, state, opts)).join('')}
            ${opts.editing ? `<button class="comp-add" type="button" data-add-comp="${unit.id}">＋ 段を追加</button>` : ''}
          </div>
        </div>
        ${unit.type === 'FRIDGE' ? '<span class="case-feet" aria-hidden="true"><i></i><i></i></span>' : ''}
      </section>`;
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
      </section>`;
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

        ${colorField(unit.color, `data-unit-color="${unit.id}"`, '本体の色')}
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

        ${slider('横幅', `${compartment.width}%`, compartment.width, WIDTH_MIN, WIDTH_MAX, 5,
          `data-comp-width="${compartment.id}"`)}
        ${slider('高さ', `${compartment.height}`, compartment.height, HEIGHT_MIN, HEIGHT_MAX, 2,
          `data-comp-height="${compartment.id}"`)}

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

  function slider(label, valueLabel, value, min, max, step, attrs) {
    return `
      <div class="field-row slider-row">
        <span>${label}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attrs}>
        <output>${valueLabel}</output>
      </div>`;
  }

  /**
   * 色の選択。期限の警告に使う赤・橙・黄は選択肢に置かない。
   * 庫内をその色にできると、期限切れの食材が背景に紛れてしまうため。
   */
  function colorField(current, attrs, label) {
    const swatches = CASE_COLORS.map((option) => {
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

    bindSlider(root, '[data-comp-width]', 'compWidth', clampWidth, (c, v) => { c.width = v; },
      (el, v) => { el.style.setProperty('--w', v); }, (v) => `${v}%`, opts);
    bindSlider(root, '[data-comp-height]', 'compHeight', clampHeight, (c, v) => { c.height = v; },
      (el, v) => { el.style.setProperty('--h', `${v}px`); }, (v) => `${v}`, opts);

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
   * スライダーを動かしている間は描き直さず、図の該当箇所の寸法だけ直接書き換える。
   * 毎回描き直すとつまみから指が外れてしまい、細かい調整ができない。
   */
  function bindSlider(root, selector, datasetKey, clamp, apply, paint, format, opts) {
    root.querySelectorAll(selector).forEach((el) => {
      const id = el.dataset[datasetKey];
      const output = el.parentElement.querySelector('output');
      const target = root.querySelector(`.comp[data-select="${id}"]`);
      const box = target ? target.closest('.drawer-box') : null;

      el.addEventListener('input', () => {
        const value = clamp(Number(el.value));
        if (output) output.textContent = format(value);
        if (target) paint(target, value);
        if (box && datasetKey === 'compWidth') box.style.setProperty('--w', value);
        opts.onLayout((layout) => apply(findCompartment(layout, id), value), true);
      });

      /* 指を離した時点で描き直し、折り返しなど全体の組み直しを反映する */
      el.addEventListener('change', () => opts.onRedraw());
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

  /** 端まで運んだときに画面を送る。スマホでは冷蔵庫全体が一画面に収まらないため */
  function edgeScroll() {
    if (!drag || !drag.active) return;
    const top = drag.y - EDGE_ZONE;
    const bottom = drag.y - (window.innerHeight - EDGE_ZONE);
    if (top < 0) window.scrollBy(0, Math.max(-EDGE_SPEED, top / 6));
    else if (bottom > 0) window.scrollBy(0, Math.min(EDGE_SPEED, bottom / 6));
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
