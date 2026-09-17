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

  /* --- 構造の組み立て --------------------------------------------------- */

  /**
   * 段の並びを、扉ひとつ分と引き出しひとつ分の「区画」にまとめる。
   * 実際の冷蔵庫は「棚が何段か入った扉」の下に「引き出しが積まれる」構造なので、
   * 連続する棚・ドアポケットを1枚の扉として束ね、引き出しはそれぞれ独立させる。
   * 半幅の引き出しが連続したときは、製氷室と小さな冷凍室のように横へ並べる。
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
      if (compartment.span === 1 && last && last.type === 'drawer' && last.half && last.items.length === 1) {
        last.items.push(compartment);
        return;
      }
      out.push({ type: 'drawer', half: compartment.span === 1, items: [compartment] });
    });

    return out;
  }

  /* --- 描画 ------------------------------------------------------------ */

  /**
   * @param opts.editing   配置の編集モードか
   * @param opts.kindFor   食材 → 収納の種類
   * @param opts.today     'YYYY-MM-DD'
   */
  function markup(state, opts) {
    const unplaced = state.items.filter((i) => !findCompartment(state.layout, i.compartmentId));
    return `
      ${opts.editing ? editorNotice() : ''}
      <div class="stage">
        ${state.layout.map((unit) => unitMarkup(unit, state, opts)).join('')}
        ${opts.editing ? '<button class="unit-add" type="button" data-add-unit>＋ 収納を追加</button>' : ''}
      </div>
      ${opts.editing ? '' : trayMarkup(unplaced, state, opts)}`;
  }

  function editorNotice() {
    return `<p class="notice">段の名前・形・幅・高さを変えられます。形を「引き出し」にすると独立した引き出しになり、幅を「半分」にすると隣の段と横に並びます。段を消すと、中の食材は「買ってきたもの」に戻ります。</p>`;
  }

  function unitMarkup(unit, state, opts) {
    const inner = opts.editing
      ? unit.compartments.map((c, i) => compMarkup(c, unit, i, state, opts)).join('')
      : sections(unit.compartments).map((section) => sectionMarkup(section, state, opts)).join('');

    return `
      <section class="unit" data-unit="${unit.id}" data-type="${unit.type}">
        <header class="unit-head">
          ${opts.editing
            ? `<input class="unit-name-input" type="text" value="${esc(unit.name)}" data-unit-name="${unit.id}" aria-label="収納の名前">
               <select class="unit-type-select" data-unit-type="${unit.id}" aria-label="収納の見た目">
                 <option value="FRIDGE" ${unit.type === 'FRIDGE' ? 'selected' : ''}>冷蔵庫</option>
                 <option value="SHELF" ${unit.type === 'SHELF' ? 'selected' : ''}>棚</option>
               </select>
               <button class="mini danger" type="button" data-del-unit="${unit.id}" aria-label="${esc(unit.name)}を削除">削除</button>`
            : `<span class="unit-name">${esc(unit.name)}</span>`}
        </header>
        <div class="unit-body">
          ${inner}
          ${opts.editing ? `<button class="comp-add" type="button" data-add-comp="${unit.id}">＋ 段を追加</button>` : ''}
        </div>
      </section>`;
  }

  /** 扉は棚を抱えた一枚板、引き出しは前板と取っ手を持つ箱として描く */
  function sectionMarkup(section, state, opts) {
    if (section.type === 'door') {
      return `
        <div class="door">
          <div class="door-inner">
            ${section.items.map((c) => compMarkup(c, null, 0, state, opts)).join('')}
          </div>
          <span class="door-handle" aria-hidden="true"></span>
        </div>`;
    }
    return `
      <div class="drawer${section.half ? ' is-split' : ''}">
        ${section.items.map((c) => `
          <div class="drawer-box">
            ${compMarkup(c, null, 0, state, opts)}
            <span class="drawer-pull" aria-hidden="true"></span>
          </div>`).join('')}
      </div>`;
  }

  function compMarkup(compartment, unit, index, state, opts) {
    const items = state.items.filter((i) => i.compartmentId === compartment.id);
    const body = opts.editing
      ? compControls(compartment, unit, index)
      : `<div class="comp-items">${items.map((i) => chip(i, state, opts)).join('')}</div>`;

    return `
      <section class="comp" data-kind="${compartment.kind}" data-form="${compartment.form}"
               style="--size:${compartment.size}" ${opts.editing ? '' : `data-drop="${compartment.id}"`}>
        ${opts.editing ? '' : `
        <header class="comp-head">
          <span class="comp-name">${esc(compartment.name)}</span>
          <span class="comp-kind">${STORAGE_LABELS[compartment.kind]}</span>
          ${items.length > 0 ? `<span class="comp-count">${items.length}</span>` : ''}
        </header>`}
        ${body}
      </section>`;
  }

  function compControls(compartment, unit, index) {
    const last = index === unit.compartments.length - 1;
    return `
      <div class="comp-edit">
        <input class="comp-name-input" type="text" value="${esc(compartment.name)}"
               data-comp-name="${compartment.id}" aria-label="段の名前">
        <div class="comp-edit-grid">
          <select data-comp-kind="${compartment.id}" aria-label="段の種類">
            ${Object.entries(STORAGE_LABELS)
              .map(([k, v]) => `<option value="${k}" ${k === compartment.kind ? 'selected' : ''}>${v}</option>`)
              .join('')}
          </select>
          <select data-comp-form="${compartment.id}" aria-label="段の形">
            ${Object.entries(FORM_LABELS)
              .map(([k, v]) => `<option value="${k}" ${k === compartment.form ? 'selected' : ''}>${v}</option>`)
              .join('')}
          </select>
        </div>
        <div class="comp-edit-row">
          <button class="mini" type="button" data-span="${compartment.id}" aria-pressed="${compartment.span === 1}">
            ${compartment.span === 1 ? '半分' : '全幅'}
          </button>
          <button class="mini" type="button" data-size="${compartment.id}:-1" aria-label="高さを下げる">−</button>
          <span class="mini-label">高さ ${compartment.size}</span>
          <button class="mini" type="button" data-size="${compartment.id}:1" aria-label="高さを上げる">＋</button>
          <button class="mini" type="button" data-move="${compartment.id}:-1" ${index === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
          <button class="mini" type="button" data-move="${compartment.id}:1" ${last ? 'disabled' : ''} aria-label="下へ">↓</button>
          <button class="mini danger" type="button" data-del-comp="${compartment.id}" aria-label="この段を削除">✕</button>
        </div>
      </div>`;
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

  /* --- 操作 ------------------------------------------------------------ */

  /**
   * @param opts.onMove(itemId, compartmentId|null)
   * @param opts.onOpenItem(itemId)
   * @param opts.onLayout(mutator)  state.layout を書き換える関数を渡して保存させる
   */
  function bind(root, state, opts) {
    if (opts.editing) return bindEditor(root, opts);
    root.querySelectorAll('.chip[data-item]').forEach((chipEl) => attachDrag(chipEl, opts));
  }

  function bindEditor(root, opts) {
    const onChange = (selector, handler) => {
      root.querySelectorAll(selector).forEach((el) => el.addEventListener('change', () => handler(el)));
    };
    const onClick = (selector, handler) => {
      root.querySelectorAll(selector).forEach((el) => el.addEventListener('click', () => handler(el)));
    };

    /* 名前は入力のたびに再描画するとフォーカスを失うので、確定時だけ保存して描き直さない */
    onChange('[data-comp-name]', (el) => {
      const name = el.value.trim() || '名称未設定';
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compName).name = name; }, true);
    });
    onChange('[data-unit-name]', (el) => {
      const name = el.value.trim() || '名称未設定';
      opts.onLayout((layout) => { layout.find((u) => u.id === el.dataset.unitName).name = name; }, true);
    });

    onChange('[data-comp-kind]', (el) => {
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compKind).kind = el.value; });
    });
    onChange('[data-comp-form]', (el) => {
      opts.onLayout((layout) => { findCompartment(layout, el.dataset.compForm).form = el.value; });
    });
    onChange('[data-unit-type]', (el) => {
      opts.onLayout((layout) => { layout.find((u) => u.id === el.dataset.unitType).type = el.value; });
    });

    onClick('[data-span]', (el) => {
      opts.onLayout((layout) => {
        const c = findCompartment(layout, el.dataset.span);
        c.span = c.span === 1 ? 2 : 1;
      });
    });

    onClick('[data-size]', (el) => {
      const [id, delta] = el.dataset.size.split(':');
      opts.onLayout((layout) => {
        const c = findCompartment(layout, id);
        c.size = Math.min(4, Math.max(1, c.size + Number(delta)));
      });
    });

    onClick('[data-move]', (el) => {
      const [id, delta] = el.dataset.move.split(':');
      opts.onLayout((layout) => {
        const unit = findUnitOf(layout, id);
        const from = unit.compartments.findIndex((c) => c.id === id);
        const [moved] = unit.compartments.splice(from, 1);
        unit.compartments.splice(from + Number(delta), 0, moved);
      });
    });

    onClick('[data-del-comp]', (el) => opts.onDeleteCompartment(el.dataset.delComp));
    onClick('[data-del-unit]', (el) => opts.onDeleteUnit(el.dataset.delUnit));

    onClick('[data-add-comp]', (el) => {
      opts.onLayout((layout) => {
        const unit = layout.find((u) => u.id === el.dataset.addComp);
        unit.compartments.push({ id: newId('c'), name: '新しい段', kind: 'FRIDGE', form: 'SHELF', span: 2, size: 2 });
      });
    });

    onClick('[data-add-unit]', () => {
      opts.onLayout((layout) => {
        layout.push({
          id: newId('unit'),
          name: '新しい収納',
          type: 'SHELF',
          compartments: [{ id: newId('c'), name: '棚', kind: 'ROOM_TEMP', form: 'SHELF', span: 2, size: 2 }],
        });
      });
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
