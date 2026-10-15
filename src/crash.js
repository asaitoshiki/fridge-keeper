/* ===========================================================================
   不具合の知らせ — 予期しないエラーを画面に出す。

   スマホでは開発者ツールが見られないので、エラーが起きても何も表示されず、
   ただ固まったように見える。何が起きたかを画面に出し、内容をコピーして
   そのまま開発者へ送れるようにする。

   他のどのファイルより先に読み込む。他のファイルの読み込み中のエラーも拾うため。
   エラーは握りつぶさない。ここは見えるようにするだけで、処理は止まったままになる。
   =========================================================================== */

(function () {
  'use strict';

  const MAX_KEEP = 5;
  const seen = [];
  let box = null;

  function describe(message, source, line, column, error) {
    const where = source ? `${String(source).split('/').pop()}:${line}:${column}` : '';
    const stack = error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : '';
    return [
      String(message),
      where,
      stack,
      `画面: ${location.hash || '(なし)'}　端末: ${navigator.userAgent}`,
      `時刻: ${new Date().toLocaleString('ja-JP')}`,
    ].filter(Boolean).join('\n');
  }

  function show(text) {
    /* 同じエラーが続けて出ても、一つにまとめる */
    if (seen.includes(text)) return;
    seen.push(text);
    if (seen.length > MAX_KEEP) seen.shift();

    if (!box) {
      box = document.createElement('div');
      box.className = 'crash';
      box.setAttribute('role', 'alert');
      document.body.appendChild(box);
    }
    box.innerHTML = `
      <div class="crash-head">
        <b>エラーが起きました</b>
        <span>この内容をコピーして送ってください。直す手がかりになります。</span>
      </div>
      <textarea class="crash-text" readonly></textarea>
      <div class="crash-actions">
        <button type="button" data-crash-copy>内容をコピー</button>
        <button type="button" data-crash-reload>読み込み直す</button>
        <button type="button" data-crash-close>閉じる</button>
      </div>`;
    const area = box.querySelector('.crash-text');
    area.value = seen.join('\n\n---\n\n');

    box.querySelector('[data-crash-copy]').addEventListener('click', async () => {
      area.select();
      try {
        await navigator.clipboard.writeText(area.value);
        box.querySelector('[data-crash-copy]').textContent = 'コピーしました';
      } catch (error) {
        /* コピーできない端末では、選んだ状態にしておくので長押しで写してもらう */
        box.querySelector('[data-crash-copy]').textContent = '選択したので長押しでコピー';
      }
    });
    box.querySelector('[data-crash-reload]').addEventListener('click', () => location.reload());
    box.querySelector('[data-crash-close]').addEventListener('click', () => {
      box.remove();
      box = null;
    });
  }

  window.addEventListener('error', (event) => {
    /* 画像やフォントが読めなかっただけのものは、アプリの不具合ではないので出さない */
    if (!event.message) return;
    show(describe(event.message, event.filename, event.lineno, event.colno, event.error));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    show(describe(reason && reason.message ? reason.message : String(reason), '', 0, 0, reason));
  });
})();
