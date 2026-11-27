import { devices } from 'playwright';
import { APP_URL, launch } from './helpers.mjs';
const browser = await launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
await ctx.route('https://**/*', (route) => route.abort());
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
const ok = (label, cond) => console.log((cond ? 'OK  ' : 'NG  ') + label);
await page.goto(APP_URL); await page.waitForTimeout(600);
ok('初回に見本の断り', await page.locator('.sample-note').count() === 1);
await page.locator('#clear-sample').click(); await page.waitForTimeout(200);
for (const n of ['牛乳', '卵', '豚バラ肉', 'キャベツ', 'しょうゆ']) { await page.locator('#quick-input').fill(n); await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
ok('買ってきたものに5件', await page.locator('.tray .chip[data-item]').count() === 5);
await page.locator('[data-place-all]').click(); await page.waitForTimeout(300);
ok('全部入れた', await page.evaluate(() => loadState().items.every((i) => i.compartmentId)));
ok('調味料は隠れる', await page.locator('[data-seasoning-toggle]').count() === 1);
await page.locator('.stage .chip[data-item]').first().click(); await page.waitForTimeout(700);
const name = await page.locator('#action-title').innerText();
await page.locator('[data-act="finish"]').click(); await page.waitForTimeout(400);
ok('食べきった: ' + name, !(await page.evaluate((n) => loadState().items.some((i) => i.name === n), name)));
await page.locator('#undo-button').click(); await page.waitForTimeout(300);
ok('取り消し', await page.evaluate((n) => loadState().items.some((i) => i.name === n), name));
await page.locator('#open-full').click(); await page.waitForTimeout(600);
await page.locator('#f-name, [name="name"]').first().fill('ヨーグルト');
await page.locator('#editor-save').click(); await page.waitForTimeout(400);
ok('詳しくから登録', await page.evaluate(() => loadState().items.some((i) => i.name === 'ヨーグルト')));
await page.locator('[data-mode="expiry"]').click(); await page.waitForTimeout(300);
ok('期限順の行', await page.locator('.row').count() >= 5);
for (const v of ['shopping', 'notices', 'report', 'settings', 'fridge']) {
  await page.locator(`.navbar [data-view="${v}"]`).click(); await page.waitForTimeout(250);
  ok('タブ ' + v, await page.locator('.screen').count() === 1 && await page.locator('.crash').count() === 0);
}
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(200);
ok('戻ってきたとき', await page.locator('.navbar').count() === 1);
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
