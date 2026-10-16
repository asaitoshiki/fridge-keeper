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
    const parts = [`--door-w:${unit.doorWidth}`];
    if (unit.color) {
      parts.push(
        `--metal-1:${shade(unit.color, 0.34)}`,
        `--metal-2:${unit.color}`,
        `--metal-3:${shade(unit.color, -0.22)}`,
        `--panel-1:${shade(unit.color, 0.4)}`,
        `--panel-2:${shade(unit.color, 0.12)}`,
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
  /**
   * 段を、扉ひとつ分と引き出しひとつ分の区画にまとめる。
   *
   * 扉の区画は、扉の内側に付くドアポケットと、庫内の棚とに分けて持つ。
   * 実物のドアポケットは扉に付いていて棚とは別の面にあるので、
   * 同じ列に積むと置き場所を思い出すときの手がかりにならない。
   */
  function sections(compartments) {
    const out = [];
    let door = null;

    compartments.forEach((compartment) => {
      if (compartment.form !== 'DRAWER') {
        /* 「ここから新しい扉」の段で区切る。2ドア・3ドアはここで分かれる */
        if (compartment.newDoor) door = null;
        if (!door) {
          door = { type: 'door', pockets: [], shelves: [], items: [] };
          out.push(door);
        }
        door.items.push(compartment);
        if (compartment.form === 'POCKET') door.pockets.push(compartment);
        else door.shelves.push(compartment);
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
      ${opts.editing ? '<p class="notice">段をタップすると、下に調整が出ます。段を<b>長押し</b>すると、そのまま運んで並べ替えられます。</p>' : ''}
      ${opts.editing ? '' : trayMarkup(unplaced, state, opts)}
      <div class="stage"${opts.editing ? ' data-editing="true"' : ''}>
        ${stageBlocks(state, opts)}
        ${opts.editing ? '<button class="unit-add" type="button" data-add-unit>＋ 収納を追加</button>' : ''}
      </div>
      ${opts.editing ? settingsPanel(state, opts) : ''}`;
  }


  /** 扉の付いた区画を一つでも持つか。引き出しだけの収納や、扉を全部外した収納は、開いて描くものが無い */
  function hasDoorSection(unit) {
    return sections(unit.compartments).some((section) => section.type === 'door' && sectionHasDoor(section));
  }

  /** 区画に扉が付いているか。外した印は区画の先頭の段が持つ */
  function sectionHasDoor(section) {
    return !section.items[0].noDoor;
  }

  /**
   * 収納を舞台に並べる。
   *
   * 横に開く扉を持つ収納は、本体を片側の列に、開いた扉を隣の列に描く。
   * 扉の下は空くので、扉の無い収納（常温の棚など）をそこへ入れる。
   * 縦に長い冷蔵庫の脇が余らず、一画面に収まる。
   * 観音開きは扉が両側に開くので、横いっぱいを使う。
   */
  function stageBlocks(state, opts) {
    const blocks = [];
    const tenants = [];
    let host = null;

    state.layout.forEach((unit) => {
      if (opensSideways(unit) && hasDoorSection(unit)) {
        const block = { kind: 'open', unit, tenants: [] };
        blocks.push(block);
        if (!host) host = block;
      } else if (unit.doorStyle === 'FRENCH' && hasDoorSection(unit)) {
        blocks.push({ kind: 'wide', unit });
      } else {
        tenants.push(unit);
      }
    });

    if (host) host.tenants = tenants;
    else if (tenants.length > 0) blocks.push({ kind: 'grid', units: tenants });

    return blocks.map((block) => {
      if (block.kind === 'grid') {
        return `<div class="grid-block">${block.units.map((u) => unitMarkup(u, state, opts)).join('')}</div>`;
      }
      if (block.kind === 'wide') {
        return `<div class="wide-block">${unitMarkup(block.unit, state, opts)}</div>`;
      }
      const swings = [];
      const main = unitMarkup(block.unit, state, opts, swings);
      return `
        <div class="open-block" data-side="${block.unit.doorStyle === 'LEFT' ? 'left' : 'right'}"
             data-door-width-for="${block.unit.id}" style="--door-w:${block.unit.doorWidth}">
          <div class="open-main">${main}</div>
          <div class="open-side">
            <div class="swings">${swings.join('')}</div>
            <div class="open-tenants">${block.tenants.map((u) => unitMarkup(u, state, opts)).join('')}</div>
          </div>
        </div>`;
    }).join('');
  }

  /* --- 開いた扉を庫内に揃える ---------------------------------------------- */

  let swingObserver = null;

  /**
   * 隣の列に描いた扉を、その扉が付く庫内と同じ高さ・同じ位置に揃える。
   * 庫内の高さは段の大きさで変わり、つまみで引いている最中にも変わるので、
   * 描き終えてから測り、大きさが変わるたびに測り直す。
   */
  function layoutSwings(root) {
    if (swingObserver) {
      swingObserver.disconnect();
      swingObserver = null;
    }
    const blocks = [...root.querySelectorAll('.open-block')];
    if (blocks.length === 0) return;

    const run = () => blocks.forEach(placeSwings);
    run();

    if (typeof ResizeObserver === 'function') {
      swingObserver = new ResizeObserver(run);
      blocks.forEach((block) => {
        block.querySelectorAll('.door[data-section]').forEach((el) => swingObserver.observe(el));
      });
    }
  }

  function placeSwings(block) {
    const holder = block.querySelector('.swings');
    if (!holder) return;
    const base = holder.getBoundingClientRect().top;
    let bottom = 0;

    holder.querySelectorAll('.door-swing[data-swing]').forEach((swing) => {
      const section = block.querySelector(`.door[data-section="${swing.dataset.swing}"]`);
      if (!section) return;

      /**
       * 扉と庫内は同じ高さに揃える。どちらか高いほうに合わせる。
       * ポケットが多いと扉のほうが高くなるので、そのときは庫内を伸ばす。
       * 同じ処理の中で縮めて伸ばすだけなので、見張りが何度も呼ばれることはない。
       */
      swing.style.height = 'auto';
      section.style.minHeight = '';
      const natural = swing.offsetHeight;
      const rect = section.getBoundingClientRect();
      const height = Math.max(natural, rect.height);
      if (height > rect.height) section.style.minHeight = `${height}px`;

      const top = section.getBoundingClientRect().top - base;
      swing.style.top = `${top}px`;
      swing.style.height = `${height}px`;
      bottom = Math.max(bottom, top + height);
    });

    /* 扉の下から、扉の無い収納を並べ始める */
    holder.style.height = `${Math.ceil(bottom)}px`;
  }

  function unitMarkup(unit, state, opts, swings) {
    const selected = opts.editing && opts.selection.type === 'unit' && opts.selection.id === unit.id;
    /* つまみが枠に切られないよう、選択中の段を抱える筐体には印を付けておく */
    const holdsSelection = opts.editing && opts.selection.type === 'comp'
      && unit.compartments.some((c) => c.id === opts.selection.id);

    const ctx = { swings: swings || [], sectionIndex: 0 };

    return `
      <section class="unit${selected ? ' is-selected' : ''}${holdsSelection ? ' has-selection' : ''}" data-unit="${unit.id}"
               data-type="${unit.type}" data-door="${unit.doorStyle}"
               style="${unitStyle(unit)}">
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
            ${sections(unit.compartments).map((section) => sectionMarkup(section, state, opts, unit, ctx)).join('')}
            ${opts.editing ? `<button class="comp-add" type="button" data-add-comp="${unit.id}">＋ 段を追加</button>` : ''}
          </div>
        </div>
        ${unit.type === 'FRIDGE' ? '<span class="case-feet" aria-hidden="true"><i></i><i></i></span>' : ''}
      </section>`;
  }

  /** 扉は棚を抱えた一枚板、引き出しは前板と取っ手を持つ箱として描く */
  function sectionMarkup(section, state, opts, unit, ctx) {
    if (section.type === 'door') return doorMarkup(section, state, opts, unit, ctx);
    return packRows(section.items).map((row) => rowMarkup(row, state, opts, true)).join('');
  }

  /**
   * 扉の区画を描く。図では扉を開けた状態で描く。
   *
   * 横に開く扉は、庫内（棚）だけをここに描き、開いた扉の板は ctx.swings に積んで
   * 収納の隣の列に描く。実物のドアポケットは扉の内側に付いているので、
   * 庫内に並べると開けたときの見た目と結びつかない。
   * 観音開きは扉が左右に2枚あるので、庫内を挟んで両側に描く。
   * 扉の無い収納は、ポケットも棚と同じ並びで庫内に描く。
   */
  function doorMarkup(section, state, opts, unit, ctx) {
    const style = unit.doorStyle;
    const rowsOf = (list) => packRows(list).map((row) => rowMarkup(row, state, opts, false)).join('');

    if (style === 'NONE' || !sectionHasDoor(section)) {
      return `
        <div class="door" data-open="none">
          <div class="door-inner">${rowsOf(section.items)}</div>
        </div>`;
    }

    const key = `${unit.id}:${ctx.sectionIndex}`;
    ctx.sectionIndex += 1;

    /**
     * 扉の高さは、扉の始まりの段（区画の先頭）が持つ。
     * 扉と庫内は同じ高さに揃えるので、扉を伸ばせば庫内も伸びる。実物と同じ。
     */
    const first = section.items[0];
    const door = { unitId: unit.id, firstId: first.id, key };
    /* 並べ替えで区画の先頭が入れ替わっても高さを失わないよう、区画の中の最大を使う */
    const doorHeight = sectionDoorHeight(section);
    const heightVar = doorHeight ? ` style="--door-h:${doorHeight}px"` : '';

    const body = `
      <div class="door" data-open="${style.toLowerCase()}" data-section="${key}" data-door-first="${first.id}"${heightVar}>
        <div class="door-inner">
          ${section.shelves.length > 0 ? rowsOf(section.shelves) : '<p class="door-empty">庫内</p>'}
        </div>
      </div>`;

    if (style === 'FRENCH') {
      /* ポケットは交互に振り分けて、左右どちらの扉にも同じくらい並ぶようにする */
      const left = section.pockets.filter((_, index) => index % 2 === 0);
      const right = section.pockets.filter((_, index) => index % 2 === 1);
      return `
        <div class="french-row">
          ${swingMarkup(left, state, opts, 'left', '', door)}
          ${body}
          ${swingMarkup(right, state, opts, 'right', '', door)}
        </div>`;
    }

    ctx.swings.push(swingMarkup(section.pockets, state, opts, style === 'LEFT' ? 'left' : 'right', key, door));
    return body;
  }

  function sectionDoorHeight(section) {
    const value = Math.max(0, ...section.items.map((c) => c.doorHeight || 0));
    return value > 0 ? value : null;
  }

  /** firstId の段を含む扉の区画 */
  function doorSectionOf(unit, firstId) {
    return sections(unit.compartments)
      .find((section) => section.type === 'door' && section.items.some((c) => c.id === firstId)) || null;
  }

  /** 扉を選んだときの印。収納の id と、扉の始まりの段の id の組 */
  function doorSelectionId(door) {
    return `${door.unitId}|${door.firstId}`;
  }

  /**
   * 開いた扉の板。蝶番を軸に手前へ回して、内側（ポケットの付く面）を見せる。
   * key があるものは収納の隣の列に置かれ、あとで庫内の高さに揃えられる。
   */
  function swingMarkup(pockets, state, opts, side, key, door) {
    const sel = doorSelectionId(door);
    const selected = opts.editing && opts.selection.type === 'door' && opts.selection.id === sel;
    /**
     * 選んだ扉には、段と同じ右端と下端のつまみと、外す印を出す。
     * 扉は回して描いているので、つまみも扉と一緒に傾く。
     */
    const tools = selected ? `
      <span class="grip grip-door-w" data-door-grip="w" role="separator"
            aria-label="扉の幅を変える" aria-orientation="vertical"></span>
      <span class="grip grip-door-h" data-door-grip="h" role="separator"
            aria-label="扉の高さを変える" aria-orientation="horizontal"></span>
      <button class="door-del" type="button" data-door-del="${sel}" aria-label="扉を外す">×</button>` : '';

    return `
      <div class="door-swing${selected ? ' is-selected' : ''}" data-side="${side}"${key ? ` data-swing="${key}"` : ''}
           data-door-unit="${door.unitId}" data-door-first="${door.firstId}">
        <div class="swing-panel"${opts.editing ? ` data-select-door="${sel}"` : ''}>
          <span class="swing-tag" aria-hidden="true">ドア${opts.editing && !selected ? '<em>タップで調整</em>' : ''}</span>
          <div class="swing-inner">
            ${pockets.map((compartment) => compMarkup(compartment, state, opts)).join('')}
          </div>
          ${tools}
        </div>
      </div>`;
  }

  function rowMarkup(row, state, opts, asDrawer) {
    const cells = row.map((compartment) => {
      const cell = compMarkup(compartment, state, opts);
      return asDrawer
        ? `<div class="drawer-box" style="--w:${compartment.width}">
             ${cell}
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
    if (opts.selection.type === 'door') {
      const [unitId, firstId] = opts.selection.id.split('|');
      const unit = state.layout.find((u) => u.id === unitId);
      const section = unit ? doorSectionOf(unit, firstId) : null;
      if (unit && section) return doorSettings(unit, section, firstId);
    }
    if (opts.selection.type === 'unit') {
      const unit = state.layout.find((u) => u.id === opts.selection.id);
      if (unit) return unitSettings(unit);
    }
    const compartment = findCompartment(state.layout, opts.selection.id);
    if (compartment) return compSettings(state, compartment);

    return '<section class="settings settings-empty">段か収納をタップすると、ここで調整できます。</section>';
  }


  /**
   * 選んだ扉の調整。
   * 大きさは図のつまみで変えるのが早いが、数値と元に戻す道もここに置く。
   */
  function doorSettings(unit, section, firstId) {
    const height = sectionDoorHeight(section);
    const sel = `${unit.id}|${firstId}`;
    return `
      <section class="settings">
        <header class="settings-head">
          <span>${esc(unit.name)}のドア</span>
          <button class="mini danger" type="button" data-door-del="${sel}">外す</button>
        </header>

        <div class="field-row">
          <span>開き方</span>
          <div class="seg seg-wrap">
            ${Object.entries(DOOR_STYLE_LABELS).filter(([key]) => key !== 'NONE').map(([key, label]) => `
              <button class="seg-btn" type="button" data-unit-door="${unit.id}" data-door-value="${key}"
                      aria-pressed="${unit.doorStyle === key}">${label}</button>`).join('')}
          </div>
        </div>

        <div class="field-row">
          <span>大きさ</span>
          <p class="size-hint">図のドアの<b>外側の端</b>と<b>下端</b>のつまみを引いて変えられます。
             いまは 幅 <b>${unit.doorWidth}%</b> × 高さ <b>${height ? height : '庫内に合わせる'}</b>。
             ドアと庫内は同じ高さにそろうので、ドアを伸ばすと庫内も伸びます。</p>
        </div>
        ${height || unit.doorWidth !== DOOR_WIDTH_DEFAULT ? `
          <div class="order-buttons">
            <button class="mini" type="button" data-door-reset="${sel}">大きさを元に戻す</button>
          </div>` : ''}

        <div class="field-row">
          <span>ポケット</span>
          <p class="size-hint">${section.pockets.length}段。ポケットは段と同じように、タップで名前や高さを変えられます。</p>
        </div>
        <div class="order-buttons">
          <button class="mini" type="button" data-door-add-pocket="${sel}">＋ ポケットを足す</button>
        </div>
      </section>`;
  }

  function unitSettings(unit) {
    /* ドアポケットを持たない冷蔵庫もある。扉の板を出すかどうかはここで決める */
    const hasPockets = unit.compartments.some((c) => c.form === 'POCKET');

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
          <span>扉</span>
          <div class="seg seg-wrap">
            ${Object.entries(DOOR_STYLE_LABELS).map(([key, label]) => `
              <button class="seg-btn" type="button" data-unit-door="${unit.id}" data-door-value="${key}"
                      aria-pressed="${unit.doorStyle === key}">${label}</button>`).join('')}
          </div>
        </div>
        <p class="size-hint">扉は開けた状態で描きます。「開かない」は棚やラックのように扉の無い収納です。</p>

        ${unit.doorStyle === 'NONE' ? '' : `
        <div class="field-row">
          <span>ドアポケット</span>
          <div class="seg">
            ${[['on', 'あり'], ['off', 'なし']].map(([key, label]) => `
              <button class="seg-btn" type="button" data-unit-pockets="${unit.id}" data-pockets-value="${key}"
                      aria-pressed="${hasPockets === (key === 'on')}">${label}</button>`).join('')}
          </div>
        </div>`}

        ${colorField(unit.color, `data-unit-color="${unit.id}"`, unit.type === 'FRIDGE' ? '冷蔵庫の色' : '棚の色')}
      </section>`;
  }

  function compSettings(state, compartment) {
    const unit = findUnitOf(state.layout, compartment.id);
    const index = unit.compartments.findIndex((c) => c.id === compartment.id);
    const last = index === unit.compartments.length - 1;
    const here = compartment.form === 'DRAWER' ? null : doorSectionOf(unit, compartment.id);
    const doorlessHere = unit.doorStyle !== 'NONE' && here && !sectionHasDoor(here);

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

        ${compartment.form === 'DRAWER' ? '' : `
          <label class="check-row">
            <input type="checkbox" data-comp-newdoor="${compartment.id}" ${compartment.newDoor ? 'checked' : ''}>
            <span>ここから別の扉にする</span>
          </label>
          <p class="size-hint">2ドア・3ドアのように扉が分かれている冷蔵庫は、
             扉の一番上の段でこれを入れます。</p>`}
        ${doorlessHere ? `
          <div class="order-buttons">
            <button class="mini" type="button" data-door-restore="${unit.id}|${compartment.id}">＋ ここに扉を付け直す</button>
          </div>` : ''}

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
        <p class="size-hint">段を<b>長押し</b>してそのまま運んでも並べ替えられます。</p>

        <div class="field-row">
          <span>段を足す</span>
          <div class="order-buttons">
            <button class="mini" type="button" data-add-near="${compartment.id}:before">＋ この上に</button>
            <button class="mini" type="button" data-add-near="${compartment.id}:after">＋ この下に</button>
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

  /** 長押しとみなすまでの時間。これより短く離せばタップ（段を選ぶ） */
  const HOLD_MS = 220;

  /**
   * 段の並べ替え一回分。
   *
   * 掴んだ段を薄くし、指の位置から入る場所を決めて線で示す。
   * 画面の端へ運ぶと送る。動かしている間は図を描き直さず、離したときに一度だけ並べ替える。
   * ≡ の摘みからも、段そのものの長押しからも同じものを使う。
   */
  function reorderSession(root, state, id) {
    const unit = findUnitOf(state.layout, id);
    if (!unit || unit.compartments.length < 2) return null;

    const elOf = (cid) => root.querySelector(`.comp[data-select="${cid}"]`);
    const siblings = unit.compartments
      .map((c) => ({ id: c.id, el: elOf(c.id) }))
      .filter((sib) => sib.el);
    const self = siblings.find((sib) => sib.id === id);
    const body = root.querySelector(`.unit[data-unit="${unit.id}"] .unit-body`);
    const screen = document.querySelector('.screen');

    let target = null;
    let pointer = null;
    let alive = true;
    if (self) self.el.classList.add('is-moving');

    const clearMarks = () => {
      siblings.forEach(({ el }) => el.classList.remove('is-drop-before', 'is-drop-after'));
    };

    const place = () => {
      if (!pointer) return;
      const rowWidth = body ? body.getBoundingClientRect().width : 1;
      /* 画面を送ると位置が変わるので、その都度測り直す。段は高々十数個 */
      let index = 0;
      siblings.forEach((sib) => {
        if (sib.id === id) return;
        if (isAfter(sib.el.getBoundingClientRect(), pointer.x, pointer.y, rowWidth)) index += 1;
      });
      target = index;

      clearMarks();
      const others = siblings.filter((sib) => sib.id !== id);
      if (others.length === 0) return;
      /* 行き先は、そこへ入ることが分かる線で示す。最後尾だけ後ろ側に出す */
      if (index < others.length) others[index].el.classList.add('is-drop-before');
      else others[others.length - 1].el.classList.add('is-drop-after');
    };

    /* 冷蔵庫は一画面に収まらないことがあるので、端まで運んだら画面を送る */
    const scrollLoop = () => {
      if (!alive) return;
      if (screen && pointer) {
        const rect = screen.getBoundingClientRect();
        const top = pointer.y - (rect.top + EDGE_ZONE);
        const bottom = pointer.y - (rect.bottom - EDGE_ZONE);
        if (top < 0) { screen.scrollBy(0, Math.max(-EDGE_SPEED, top / 6)); place(); }
        else if (bottom > 0) { screen.scrollBy(0, Math.min(EDGE_SPEED, bottom / 6)); place(); }
      }
      requestAnimationFrame(scrollLoop);
    };
    requestAnimationFrame(scrollLoop);

    const end = () => {
      alive = false;
      clearMarks();
      siblings.forEach(({ el }) => el.classList.remove('is-moving', 'is-lifted'));
    };

    return {
      move(x, y) {
        pointer = { x, y };
        place();
      },
      /** 並びが変わったら true。動かさずに離したときは並びを触らない */
      finish(opts) {
        end();
        const from = unit.compartments.findIndex((c) => c.id === id);
        if (target === null || target === from) {
          opts.onRedraw();
          return false;
        }
        const index = target;
        opts.onLayout((layout) => {
          const owner = layout.find((u) => u.id === unit.id);
          const at = owner.compartments.findIndex((c) => c.id === id);
          const [moved] = owner.compartments.splice(at, 1);
          owner.compartments.splice(index, 0, moved);
        });
        return true;
      },
      cancel: end,
    };
  }

  /** ≡ の摘み。押した瞬間から運べる */
  function bindMoveGrips(root, state, opts) {
    root.querySelectorAll('[data-move-grip]').forEach((grip) => {
      const id = grip.dataset.moveGrip;
      let session = null;

      grip.addEventListener('pointerdown', (event) => {
        session = reorderSession(root, state, id);
        if (!session) return;
        event.preventDefault();
        event.stopPropagation();
        grip.setPointerCapture(event.pointerId);
        grip.classList.add('is-held');
      });

      grip.addEventListener('pointermove', (event) => {
        if (!session) return;
        event.preventDefault();
        session.move(event.clientX, event.clientY);
      });

      const release = () => {
        if (!session) return;
        grip.classList.remove('is-held');
        session.finish(opts);
        session = null;
      };
      grip.addEventListener('pointerup', release);
      grip.addEventListener('pointercancel', () => {
        if (!session) return;
        grip.classList.remove('is-held');
        session.cancel();
        session = null;
        opts.onRedraw();
      });
    });
  }

  /**
   * 段そのものを長押しして運ぶ。
   *
   * 段は図のほとんどを占めるので、触れた瞬間に掴むと画面をスクロールできなくなる。
   * 指を止めて少し待ったときだけ掴み、すぐ滑らせたときはスクロールに任せる。
   * 短く離せば今までどおりのタップ（段を選ぶ）。マウスは長押しせずに運べる。
   */
  function bindCompDrag(root, state, opts) {
    root.querySelectorAll('.comp[data-select]').forEach((el) => {
      const id = el.dataset.select;
      let press = null;
      let session = null;

      const reset = () => {
        if (press && press.timer) clearTimeout(press.timer);
        press = null;
      };

      const arm = () => {
        if (!press) return;
        session = reorderSession(root, state, id);
        if (!session) { reset(); return; }
        el.classList.add('is-lifted');
        if (navigator.vibrate) navigator.vibrate(12);
        session.move(press.x, press.y);
      };

      el.addEventListener('pointerdown', (event) => {
        /* つまみ（大きさ・並べ替え）の上では、そちらの操作を優先する */
        if (event.target.closest('.grip')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        press = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mouse: event.pointerType === 'mouse', timer: null };
        if (!press.mouse) press.timer = setTimeout(() => { press.timer = null; arm(); }, HOLD_MS);
      });

      el.addEventListener('pointermove', (event) => {
        if (!press) return;
        press.x = event.clientX;
        press.y = event.clientY;
        const moved = Math.hypot(press.x - press.startX, press.y - press.startY);

        if (!session) {
          if (press.mouse && moved >= DRAG_THRESHOLD) {
            el.setPointerCapture(press.pointerId);
            arm();
          } else if (!press.mouse && moved >= DRAG_THRESHOLD) {
            /* 長押しになる前に指が動いた。スクロールしたいのだと受け取る */
            reset();
          }
          return;
        }
        event.preventDefault();
        session.move(press.x, press.y);
      });

      /* 掴んだあとは、指を動かしても画面が流れないようにする */
      el.addEventListener('touchmove', (event) => {
        if (session) event.preventDefault();
      }, { passive: false });

      /* 長押しでスマホの文字選択や右クリックの窓が出ないようにする */
      el.addEventListener('contextmenu', (event) => {
        if (press || session) event.preventDefault();
      });

      const release = () => {
        const active = session;
        reset();
        session = null;
        el.classList.remove('is-lifted');
        if (!active) return;
        active.finish(opts);
        /* 運んだあとのクリックで、下の段まで選ばれないようにする */
        swallowNextClick();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', () => {
        const active = session;
        reset();
        session = null;
        el.classList.remove('is-lifted');
        if (active) { active.cancel(); opts.onRedraw(); }
      });
    });
  }


  /* --- 扉の大きさをつまんで変える ------------------------------------------- */

  /**
   * 選んだ扉の外側の端で幅を、下端で高さを変える。
   *
   * 幅は収納ごとの値で、同じ冷蔵庫の扉はそろって変わる（実物も同じ幅）。
   * 高さは扉と庫内をそろえたまま伸び縮みする。庫内の高さを測り直す見張りが
   * 扉の位置を追いかけるので、引いている間も扉は庫内からずれない。
   * 動かしている間は図を描き直さず、離したときに一度だけ保存する。
   */
  function bindDoorGrips(root, state, opts) {
    root.querySelectorAll('[data-door-grip]').forEach((grip) => {
      const swing = grip.closest('.door-swing');
      if (!swing) return;
      const unitId = swing.dataset.doorUnit;
      const firstId = swing.dataset.doorFirst;
      const axis = grip.dataset.doorGrip;
      const sign = swing.dataset.side === 'left' ? -1 : 1;
      let drag = null;

      const widthTargets = () => [
        root.querySelector(`[data-door-width-for="${unitId}"]`),
        root.querySelector(`.unit[data-unit="${unitId}"]`),
      ].filter(Boolean);
      const sectionEl = () => root.querySelector(`.door[data-door-first="${firstId}"]`);

      grip.addEventListener('pointerdown', (event) => {
        const unit = state.layout.find((u) => u.id === unitId);
        if (!unit) return;
        event.preventDefault();
        event.stopPropagation();
        const stage = root.querySelector('.stage');
        const scale = Number(getComputedStyle(stage).getPropertyValue('--scale')) || 1;
        const section = sectionEl();
        drag = {
          x: event.clientX,
          y: event.clientY,
          width: unit.doorWidth,
          /* 1% あたりの画面上の幅。扉の今の幅から割り出すので、隣の列でも観音開きでも同じ式で済む */
          perPercent: swing.getBoundingClientRect().width / unit.doorWidth,
          height: section ? section.getBoundingClientRect().height / scale : 0,
          scale,
          value: null,
        };
        grip.setPointerCapture(event.pointerId);
        grip.classList.add('is-held');
      });

      grip.addEventListener('pointermove', (event) => {
        if (!drag) return;
        event.preventDefault();
        if (axis === 'w') {
          const next = clampDoorWidth(drag.width + (sign * (event.clientX - drag.x)) / drag.perPercent);
          drag.value = next;
          widthTargets().forEach((el) => el.style.setProperty('--door-w', next));
        } else {
          const next = Math.min(DOOR_HEIGHT_MAX, Math.max(HEIGHT_MIN, Math.round(drag.height + (event.clientY - drag.y) / drag.scale)));
          drag.value = next;
          const section = sectionEl();
          if (section) section.style.setProperty('--door-h', `${next}px`);
        }
      });

      const release = () => {
        if (!drag) return;
        const value = drag.value;
        drag = null;
        grip.classList.remove('is-held');
        if (value === null) { opts.onRedraw(); return; }
        opts.onLayout((layout) => {
          const unit = layout.find((u) => u.id === unitId);
          if (axis === 'w') {
            unit.doorWidth = value;
            return;
          }
          /* 高さは区画の先頭の段に一つだけ持たせ、ほかの段の古い値は消す */
          const section = doorSectionOf(unit, firstId);
          if (!section) return;
          section.items.forEach((c) => { c.doorHeight = null; });
          section.items[0].doorHeight = value;
        });
      };
      grip.addEventListener('pointerup', release);
      grip.addEventListener('pointercancel', release);
    });
  }

  /** 運び終えた直後の一回だけ、クリックを捨てる */
  function swallowNextClick() {
    const swallow = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    /* クリックが来ないまま終わることもあるので、短い時間で必ず外す */
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350);
  }

  /* --- 操作 ------------------------------------------------------------ */

  function bind(root, state, opts) {
    layoutSwings(root);
    if (opts.editing) return bindEditor(root, state, opts);
    root.querySelectorAll('.chip[data-item]').forEach((chipEl) => attachDrag(chipEl, opts));
  }

  function bindEditor(root, state, opts) {
    const on = (selector, event, handler) => {
      root.querySelectorAll(selector).forEach((el) => el.addEventListener(event, () => handler(el)));
    };

    on('[data-select]', 'click', (el) => opts.onSelect('comp', el.dataset.select));
    on('[data-select-unit]', 'click', (el) => opts.onSelect('unit', el.dataset.selectUnit));

    /* 扉の板をタップすると扉を選ぶ。中のポケットやつまみのタップはそちらに任せる */
    root.querySelectorAll('[data-select-door]').forEach((el) => {
      el.addEventListener('click', (event) => {
        if (event.target.closest('.comp, .grip, .door-del')) return;
        opts.onSelect('door', el.dataset.selectDoor);
      });
    });
    root.querySelectorAll('[data-door-del]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const [unitId, firstId] = el.dataset.doorDel.split('|');
        opts.onDeleteDoor(unitId, firstId);
      });
    });
    on('[data-door-reset]', 'click', (el) => {
      const [unitId, firstId] = el.dataset.doorReset.split('|');
      opts.onLayout((layout) => {
        const unit = layout.find((u) => u.id === unitId);
        unit.doorWidth = DOOR_WIDTH_DEFAULT;
        const section = doorSectionOf(unit, firstId);
        if (section) section.items.forEach((c) => { c.doorHeight = null; });
      });
    });
    on('[data-door-add-pocket]', 'click', (el) => {
      const [unitId, firstId] = el.dataset.doorAddPocket.split('|');
      opts.onAddPocket(unitId, firstId);
    });
    bindDoorGrips(root, state, opts);

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

    bindMoveGrips(root, state, opts);
    bindCompDrag(root, state, opts);

    on('[data-move]', 'click', (el) => {
      const [id, delta] = el.dataset.move.split(':');
      opts.onLayout((layout) => {
        const unit = findUnitOf(layout, id);
        const from = unit.compartments.findIndex((c) => c.id === id);
        const [moved] = unit.compartments.splice(from, 1);
        unit.compartments.splice(from + Number(delta), 0, moved);
      });
    });

    on('[data-unit-door]', 'click', (el) => {
      opts.onLayout((layout) => {
        const unit = layout.find((u) => u.id === el.dataset.unitDoor);
        const wasNone = unit.doorStyle === 'NONE';
        unit.doorStyle = el.dataset.doorValue;
        /* 「開かない」から扉を付けるときは、外してあった区画にも全部付け直す */
        if (wasNone) unit.compartments.forEach((c) => { c.noDoor = false; });
      });
    });
    on('[data-door-restore]', 'click', (el) => {
      opts.onLayout((layout) => {
        const [unitId, compId] = el.dataset.doorRestore.split('|');
        const section = doorSectionOf(layout.find((u) => u.id === unitId), compId);
        if (section) section.items.forEach((c) => { c.noDoor = false; });
      });
    });

    root.querySelectorAll('[data-comp-newdoor]').forEach((el) => {
      el.addEventListener('change', () => {
        opts.onLayout((layout) => {
          findCompartment(layout, el.dataset.compNewdoor).newDoor = el.checked;
        });
      });
    });

    on('[data-unit-pockets]', 'click', (el) => {
      opts.onTogglePockets(el.dataset.unitPockets, el.dataset.pocketsValue === 'on');
    });

    on('[data-del-comp]', 'click', (el) => opts.onDeleteCompartment(el.dataset.delComp));
    on('[data-del-unit]', 'click', (el) => opts.onDeleteUnit(el.dataset.delUnit));
    on('[data-add-comp]', 'click', (el) => opts.onAddCompartment(el.dataset.addComp));
    on('[data-add-near]', 'click', (el) => {
      const [id, where] = el.dataset.addNear.split(':');
      opts.onAddCompartmentNear(id, where);
    });
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

  return { markup, bind, sections, doorSectionOf, sectionHasDoor };
})();
