import { devices } from 'playwright';
import { APP_URL, launch } from './helpers.mjs';
const browser = await launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 2 });
let newsBody = '[]';
let newsHits = 0;
await ctx.route('https://raw.githubusercontent.com/**', (route) => { newsHits++; route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: newsBody }); });
await ctx.route('https://api.open-meteo.com/**', (route) => route.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
const badge = async () => (await page.locator('.nav-badge').count()) ? await page.locator('.nav-badge').innerText() : '0';

await page.goto(APP_URL); await page.waitForTimeout(600);
await page.evaluate(() => { const s = loadState(); s.items = []; s.sampleLoaded = false; s.logs = []; s.inbox.newsCheckedAt = null; saveState(s); });
await page.reload(); await page.waitForTimeout(500);
console.log('空のとき 札:', await badge());
await page.locator('.navbar [data-view="notices"]').click(); await page.waitForTimeout(300);
console.log('空の受信箱:', (await page.locator('.inbox').innerText()).split('\n').join(' '));
await page.locator('.navbar [data-view="fridge"]').click(); await page.waitForTimeout(200);

/* 4日前に買った食材を、時刻が過ぎた状態にする（3日前8:00 / 前日20:00 のタイミング） */
await page.evaluate(() => {
  const s = loadState();
  const mk = (name, icon, days, extra) => ({ id: 'it-' + name, name, icon, category: 'DAIRY', compartmentId: s.layout[0].compartments[0].id,
    expiryType: 'BEST_BEFORE', expiryDate: addDays(todayIso(), days), quantity: 1, registeredAt: addDays(todayIso(), -6), janCode: null, memo: null,
    condition: 'NONE', openedAt: null, wrapped: null, frozenAt: null, notifyTimings: null, ...extra });
  s.items = [mk('牛乳', '🥛', 1), mk('卵', '🥚', 2, { quantity: 6, category: 'EGG' }), mk('豚バラ肉', '🥓', 0, { expiryType: 'USE_BY', category: 'MEAT_FISH' }), mk('しょうゆ', '🧂', 200)];
  s.notify.timings = [{ daysBefore: 3, time: '00:00' }, { daysBefore: 1, time: '00:00' }, { daysBefore: 0, time: '00:00' }];
  saveState(s);
});
newsBody = JSON.stringify([
  { id: '2026-11-24-a', date: '2026-11-24', title: '通知のボタンで答えられるようになりました', body: '「食べましたか？」の通知から、そのまま答えられます。\n通知を許可していなくても、お知らせの画面に届きます。', url: 'https://github.com/asaitoshiki/fridge-keeper' },
  { id: 'bad', title: '<img src=x onerror=alert(1)>危ない', body: '<script>alert(1)</script>', url: 'javascript:alert(1)' },
  { title: 'idなし' }, null, 'x',
]);
await page.evaluate(() => { const s = loadState(); s.inbox.newsCheckedAt = null; saveState(s); });
await page.reload(); await page.waitForTimeout(800);
console.log('お知らせの読み込み回数:', newsHits);
console.log('札（質問3＋新着2）:', await badge());
await page.locator('.navbar [data-view="notices"]').click(); await page.waitForTimeout(400);
const cards = await page.locator('.inbox-card').evaluateAll((els) => els.map((e) => e.querySelector('.inbox-title').innerText + ' [' + [...e.querySelectorAll('.inbox-btn')].map((b) => b.innerText).join('/') + ']'));
console.log('受信箱:\n  ' + cards.join('\n  '));
console.log('危ない中身が効いていない:', await page.evaluate(() => !document.querySelector('.inbox img, .inbox script') && ![...document.querySelectorAll('.inbox a')].some((a) => a.href.startsWith('javascript'))));
await page.locator('.navbar [data-view="fridge"]').click(); await page.waitForTimeout(200);
console.log('見たあとの札（新着は既読に）:', await badge());
await page.locator('.navbar [data-view="notices"]').click(); await page.waitForTimeout(300);
console.log('新着の印（2回目は消える）:', await page.locator('.inbox-new').count());

/* 答える */
await page.locator('[data-inbox-item="it-卵"][data-inbox-answer="EAT_ONE"]').click(); await page.waitForTimeout(300);
console.log('卵 1つ食べた →', await page.evaluate(() => loadState().items.find((i) => i.name === '卵').quantity), '|', (await page.locator('.undo-bar').innerText()).split('\n')[0]);
await page.locator('[data-inbox-item="it-牛乳"][data-inbox-answer="KEEP"]').click(); await page.waitForTimeout(300);
console.log('牛乳 まだある → 受信箱に残る:', await page.locator('[data-inbox-item="it-牛乳"]').count(), '在庫:', await page.evaluate(() => loadState().items.some((i) => i.name === '牛乳')));
await page.locator('[data-inbox-item="it-豚バラ肉"][data-inbox-answer="DISCARDED"]').click(); await page.waitForTimeout(300);
console.log('豚バラ肉 捨てた →', await page.evaluate(() => loadState().items.map((i) => i.name).join(',')), '記録:', await page.evaluate(() => loadState().logs.map((l) => l.name + ':' + l.type + 'x' + l.quantity).join(',')));
await page.locator('#undo-button').click(); await page.waitForTimeout(300);
console.log('取り消し →', await page.evaluate(() => loadState().items.map((i) => i.name).join(',')));
console.log('残りの札:', await badge());
/* 名前を押すとシートが開く */
await page.locator('.inbox-title[data-notice-item]').first().click(); await page.waitForTimeout(700);
console.log('名前でシート:', await page.locator('#action-title').innerText());
await page.evaluate(() => window.fridgeBack()); await page.waitForTimeout(300);

/* 設定で受け取らない → 読みに行かない */
await page.locator('.navbar [data-view="settings"]').click(); await page.waitForTimeout(300);
await page.locator('#news-enabled').uncheck(); await page.waitForTimeout(200);
const before = newsHits;
await page.evaluate(() => { const s = loadState(); s.inbox.newsCheckedAt = null; saveState(s); }); await page.reload(); await page.waitForTimeout(600);
console.log('受け取らないとき読みに行った回数:', newsHits - before);

/* 通知から開いた: お知らせの画面へ */
await page.evaluate(() => window.fridgeOpenView('notices')); await page.waitForTimeout(300);
console.log('通知から開いた画面:', await page.locator('.pane-head h2').innerText());
await page.locator('.navbar [data-view="fridge"]').click(); await page.waitForTimeout(200);
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
