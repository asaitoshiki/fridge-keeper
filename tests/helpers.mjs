/* 試験の共通部品。どの端末・どの AI の環境でも同じように動くよう、場所を決め打ちしない */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* リポジトリ直下の index.html を file:// で開く（ビルド不要の作りなので、そのまま開ける） */
export const APP_URL = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html')).href;

/* Chromium は Playwright が入れたものを使う。別の場所にあるときは CHROMIUM_PATH で指す */
export function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}
