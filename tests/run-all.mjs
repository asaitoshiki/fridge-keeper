/*
 * 試験をまとめて回す。どれか一つでも NG・エラー・不具合が出たら、終了コード 1 で終わる。
 *   node tests/run-all.mjs
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, [path.join(dir, file)], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  const bad = run.status !== 0
    || /^NG\s/m.test(out)
    || /^BUG:/m.test(out)
    || (/^errors:/m.test(out) && !/^errors: none$/m.test(out));
  console.log(`${bad ? 'NG ' : 'OK '} ${file}`);
  if (bad) { failed += 1; console.log(out.split('\n').map((l) => `    ${l}`).join('\n')); }
}
console.log(failed === 0 ? `すべて通りました（${files.length}件）` : `${failed}件が通りませんでした`);
process.exit(failed === 0 ? 0 : 1);
