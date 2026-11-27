import { devices } from 'playwright';
import { APP_URL, launch } from './helpers.mjs';
const browser = await launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
const sent = [];
let mode = 'ok';
await ctx.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  const body = JSON.parse(req.postData());
  sent.push({ headers: req.headers(), body });
  const cors = { 'access-control-allow-origin': '*' };
  if (mode === '401') return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  const prompt = body.messages[0].content;
  const answer = prompt.includes('レシート')
    ? { items: [{ name: '豚バラ肉', quantity: 1 }, { name: '牛乳', quantity: 2 }, { name: 'からあげ', quantity: 1 }] }
    : { category: 'MEAT_FISH' };
  route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({
    id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: JSON.stringify(answer) }],
    usage: { input_tokens: 400, output_tokens: 120 },
  }) });
});
await ctx.route('https://raw.githubusercontent.com/**', (r) => r.abort());
await ctx.addInitScript(() => {
  window.FridgeAndroid = {
    setDark() {}, setNotices() {}, notifyAllowed: () => true,
    scanReceipt() {
      const lines = ['ｽｰﾊﾟｰ', 'ｺｸｻﾝﾌﾞﾀﾊﾞﾗｳｽｷﾞﾘ ¥398', 'ﾒｲｼﾞｵｲｼｲｷﾞｭｳﾆｭｳ 248', 'ﾒｲｼﾞｵｲｼｲｷﾞｭｳﾆｭｳ 248', 'ﾜｶﾄﾞﾘｶﾗｱｹﾞ 298', '合計 ¥1,192'].map((text, i) => ({ text, x: 0, y: i * 30, h: 20 }));
      setTimeout(() => window.fridgeReceiptResult(JSON.stringify(lines), 'OK'), 100);
    },
  };
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(APP_URL); await page.waitForTimeout(500);
await page.evaluate(() => { const s = loadState(); s.items = []; s.sampleLoaded = false; saveState(s); localStorage.removeItem('fridgekeeper.ai.v1'); localStorage.removeItem('fridgekeeper.ai.usage.v1'); });
await page.reload(); await page.waitForTimeout(400);

/* 無効のとき: 通信しない */
await page.locator('#quick-input').fill('国産若鶏のから揚げ'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
console.log('無効のとき送った数:', sent.length);

/* 設定で有効にする */
await page.locator('.navbar [data-view="settings"]').click(); await page.waitForTimeout(300);
await page.locator('#ai-enabled').check();
await page.locator('#ai-key').fill('sk-ant-test-123');
console.log('モデルの選択肢:', await page.locator('#ai-model option').allInnerTexts());
await page.locator('#save-settings').click(); await page.waitForTimeout(300);
await page.locator('#ai-test').click(); await page.waitForTimeout(600);
console.log('試す:', await page.locator('#ai-test-result').innerText());
const first = sent[0];
console.log('送ったヘッダー:', first.headers['x-api-key'], first.headers['anthropic-version'], first.headers['anthropic-dangerous-direct-browser-access']);
console.log('送った本文:', JSON.stringify({ model: first.body.model, max_tokens: first.body.max_tokens, effort: first.body.output_config.effort, format: first.body.output_config.format.type }));

/* 見本帳に無い名前 → 分類が付く */
await page.locator('.navbar [data-view="fridge"]').click(); await page.waitForTimeout(200);
await page.locator('#quick-input').fill('謎の総菜セット'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
console.log('分類:', await page.evaluate(() => loadState().items.find((i) => i.name === '謎の総菜セット').category));
await page.locator('#quick-input').fill('牛乳'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
console.log('見本帳にある名前では送らない（送った数）:', sent.length);

/* レシート */
await page.locator('[data-receipt]').click(); await page.waitForTimeout(900);
console.log('レシート候補:', await page.locator('.receipt-row').evaluateAll((els) => els.map((e) => (e.querySelector('input[type=checkbox]').checked ? '☑' : '☐') + e.querySelector('.receipt-name').value + '×' + e.querySelector('.receipt-qty').value).join(' / ')));
await page.evaluate(() => window.fridgeBack()); await page.waitForTimeout(300);

/* 使った分と上限 */
await page.locator('.navbar [data-view="settings"]').click(); await page.waitForTimeout(300);
console.log('利用の表示:', (await page.locator('#ai-limit').locator('xpath=../following-sibling::p[1]').innerText()).split('。')[0]);
await page.evaluate(() => { localStorage.setItem('fridgekeeper.ai.usage.v1', JSON.stringify({ month: todayIso().slice(0, 7), calls: 999, yen: 1000 })); });
const before = sent.length;
await page.locator('#ai-test').click(); await page.waitForTimeout(500);
console.log('上限に達したとき:', await page.locator('#ai-test-result').innerText(), '| 送った数の増え:', sent.length - before);

/* 鍵が違う */
await page.evaluate(() => localStorage.removeItem('fridgekeeper.ai.usage.v1'));
mode = '401';
await page.locator('#ai-test').click(); await page.waitForTimeout(500);
console.log('鍵が違う:', await page.locator('#ai-test-result').innerText());

/* 控えに鍵が入らない */
console.log('控えに鍵が無い:', !(await page.evaluate(() => exportState(loadState()))).includes('sk-ant-test-123'));
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
