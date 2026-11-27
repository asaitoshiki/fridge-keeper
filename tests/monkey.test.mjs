import { devices } from 'playwright';
import { APP_URL, launch } from './helpers.mjs';
const seed0 = Number(process.argv[2] || 1), runs = Number(process.argv[3] || 2), steps = Number(process.argv[4] || 300);
const browser = await launch();
const found = new Map();
for (let r = 0; r < runs; r++) {
  let seed = seed0 + r;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
  await ctx.route('https://**/*', (route) => route.abort());
  const page = await ctx.newPage();
  const last = [];
  page.on('pageerror', (e) => { const k = e.message; if (!found.has(k)) found.set(k, 'seed ' + (seed0 + r) + ': ' + last.slice(-6).join(' > ')); });
  page.on('dialog', (d) => d.accept('2').catch(() => {}));
  await page.goto(APP_URL); await page.waitForTimeout(500);
  /* 時刻の過ぎた知らせが届いた状態から始める */
  await page.evaluate(() => { const s = loadState(); s.notify.timings = [{ daysBefore: 30, time: '00:00' }]; s.items.forEach((i) => { i.registeredAt = addDays(todayIso(), -40); }); saveState(s); });
  await page.reload(); await page.waitForTimeout(400);
  const names = ['牛乳', '卵', 'キャベツ', 'しょうゆ', 'なぞの物体', '鮭'];
  for (let i = 0; i < steps; i++) {
    const els = await page.$$('dialog[open] button, dialog[open] select, dialog[open] input, dialog[open] summary');
    const pool = els.length ? els : await page.$$('#app button, #app select, #app input, #app [data-item], #app label, #app summary');
    const vis = [];
    for (const e of pool) if (await e.isVisible().catch(() => false)) vis.push(e);
    if (!vis.length || (els.length && rnd() < 0.08)) { await page.evaluate(() => window.fridgeBack && window.fridgeBack()); continue; }
    const el = vis[Math.floor(rnd() * vis.length)];
    const desc = await el.evaluate((e) => e.tagName + '#' + e.id + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '') + '"' + (e.innerText || e.value || '').slice(0, 12) + '"').catch(() => '?');
    if (desc.includes('すべてのデータを消す') && rnd() < 0.9) continue;
    last.push(desc);
    try {
      const tag = await el.evaluate((e) => e.tagName + ':' + (e.type || ''));
      if (tag.startsWith('SELECT')) { const n = await el.evaluate((e) => e.options.length); await el.selectOption({ index: Math.floor(rnd() * n) }, { timeout: 500 }); }
      else if (tag === 'INPUT:text' || tag === 'INPUT:search') { await el.fill(names[Math.floor(rnd() * names.length)], { timeout: 500 }); if (rnd() < 0.6) await el.press('Enter'); }
      else if (tag === 'INPUT:number') await el.fill(String(Math.floor(rnd() * 40) - 20), { timeout: 500 });
      else if (tag === 'INPUT:date') await el.fill('2026-12-0' + (1 + Math.floor(rnd() * 9)), { timeout: 500 });
      else if (tag === 'INPUT:time') await el.fill('07:30', { timeout: 500 });
      else if (tag !== 'INPUT:file') await el.click({ timeout: 500 });
    } catch (e) { /* 押せなかっただけ */ }
    await page.waitForTimeout(20);
    if (await page.locator('.crash').count() && !found.has('crash' + r)) found.set('crash' + r, (await page.locator('.crash').innerText()).slice(0, 300) + ' <= ' + last.slice(-6).join(' > '));
  }
  await page.reload(); await page.waitForTimeout(400);
  if (!(await page.locator('.navbar').count())) found.set('dead' + r, '読み直し後に開けない');
  await ctx.close();
}
for (const [k, v] of found) console.log('BUG:', k, '\n   ', v);
console.log('done, distinct errors:', found.size);
await browser.close();
