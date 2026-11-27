# CLAUDE.md

Claude Code 向けの入口。**開発の決まりとプロジェクトの知識はすべて `AGENTS.md` にある**ので、まずそれを読むこと。
ほかの AI（ChatGPT・Codex など）とも同じ決まりで開発するため、ここには Claude Code だけに関わることしか書かない。

@AGENTS.md

## Claude Code だけの補足

- 作業を始めたら、`AGENTS.md` の「作業の進め方」の順に、最新のブランチと `README.md`・`PROGRESS.md`・`TODO.md`・`DECISIONS.md` を確かめる。
- 決まりやプロジェクトの知識を足すときは、このファイルではなく `AGENTS.md` に書く（ほかの AI からも読めるように）。
- AI 入力補助（`src/ai.js`）は Claude API を使う。モデル名や API の書き方を変えるときは、最新の公式ドキュメントで確かめてから直す。
