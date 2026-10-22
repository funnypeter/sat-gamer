# SAT Gamer

Digital SAT prep where students earn gaming time by practicing. Live at **https://satgamer.pmansour.com**.

- **Reading & Writing** and **Math** practice from College Board's official question bank, with adaptive difficulty (Elo per category), spaced repetition of missed questions, and an AI tutor (Gemini) on every answer.
- **Vocabulary** drilling over a curated SAT word list.
- **Parents** see each student's progress and approve requests to redeem earned gaming time; optional push alerts.

## Stack

Next.js 15 (App Router) on **Cloudflare Workers** via [OpenNext](https://opennext.js.org/cloudflare), with **D1** (SQLite) for data and **R2** for profile photos. See [`CLAUDE.md`](CLAUDE.md) for the architecture, the question pipeline and the conventions.

## Develop

```bash
npm install
npx wrangler d1 migrations apply DB --local   # local database
echo "GEMINI_API_KEY=..." > .dev.vars         # for the AI tutor / generation
npm run dev                                    # Next dev server with local D1/R2 bindings
npm run preview                                # or: the real Worker, locally
```

## Deploy

Nothing deploys automatically from GitHub.

```bash
CI=1 npx wrangler d1 migrations apply DB --remote   # if migrations/ changed
npm run deploy
```
