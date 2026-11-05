<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Agent Instructions for `ssc-answer-key-parser`

> [!IMPORTANT]
> **GOLDEN RULE FOR ALL AGENTS: ALWAYS UPDATE `HANDOFF.MD` AND `AGENTS.MD`**
> Every AI agent working on this repository **MUST** update `HANDOFF.md` and (if rules changed) `AGENTS.md` before completing any user request or creating a git commit.
> Document:
> 1. Exact changes made in the session.
> 2. Current working status and test results.
> 3. Any new gotchas, environment variables, or learnings.
> 4. Next immediate recommended steps.
> 5. **Always commit and push** your work to `origin/main` before finishing your response.

---

## 1. Project Purpose
This repository provides a lightweight, ultra-fast, Hacker News-themed web application to parse SSC CGL response sheet URLs (hosted on `sscexams.cbexams.com`) and display accurate scores and section-wise breakdowns. It is designed to run on Vercel Serverless Functions and absorb extreme traffic spikes (10k+ concurrent requests).

---

## 2. Codebase Architecture & File Roles

```
src/
├── app/
│   ├── api/
│   │   └── check/
│   │       └── route.ts       # Serverless API endpoint (GET & POST) with caching
│   ├── globals.css            # Tailwind v4 configuration + HN beige/orange theme vars
│   ├── layout.tsx             # Root layout with metadata and font setup
│   └── page.tsx               # Client UI component (Hacker News aesthetic)
├── lib/
│   ├── cache.ts               # In-memory LRU + Single-Flight deduplication + Upstash Redis
│   └── ssc-parser.ts          # Core Cheerio scraping & ASP.NET WebForms postback engine
└── types/
    └── index.ts               # Strongly typed data models (Candidate, Question, Summary)
vercel.json                    # Deploys functions to Mumbai ("bom1") to bypass India geo-blocks
HANDOFF.md                     # Comprehensive project status, test logs, and next milestones
AGENTS.md                      # Instructions, architectural patterns, and scraping rules for agents
```

---

## 3. Strict Scraping & ASP.NET Rules

When modifying or expanding `src/lib/ssc-parser.ts`, follow these verified rules:

1. **Deploy to Mumbai, India (`bom1`):**
   - `cbexams.com` is protected by Cloudflare with **strict Geo-blocking for non-Indian IPs**.
   - Serverless functions must run in Mumbai (`vercel.json` -> `"regions": ["bom1"]`).
   - If AWS datacenters get blocked during high-traffic exam days, use the built-in `PROXY_URL` environment variable (via `undici.ProxyAgent`).
2. **Do NOT submit `ddltest` in POST bodies:**
   - The dropdown `<select id="ddltest">` is disabled in HTML. If included in POST data, ASP.NET throws `System.ArgumentException: Invalid postback or callback argument`.
3. **Fetch Parts B, C, D in Parallel:**
   - All three parts use the ViewState, ViewStateGenerator, and EventValidation extracted from Part A. They run concurrently via `Promise.all`.
4. **Session Cookies:**
   - Always extract and pass the `ASP.NET_SessionId` cookie from Part A into subsequent requests.
5. **Target Specific `<font>` Tags for Question Tables:**
   - Never use `closest('table')` on generic wrapper `td` tags. Always filter `<font>` tags matching `Q.No: <num>`, and call `.closest('table')` on that element.
6. **Dynamic Row Layouts:**
   - Part A, B, and C have a "Hindi version" button row at index 0. Part D (English) does not. Never hardcode row indices `[3, 4, 5, 6]`. Locate the question row by looking for text containing `Q.No:`, and find the 4 option rows by locating `<img>` tags.
7. **Color Semantics:**
   - `bgcolor="green"` → Correctly chosen by candidate (+2.00).
   - `bgcolor="red"` → Chosen option is wrong (-0.50).
   - `bgcolor="yellow"` → Official correct answer.
   - `bgcolor="gray"` or `Not Answered` text → Left unattempted (0.00).

---

## 4. Concurrency & Performance Rules

* **Single-Flight Deduplication:** Every fetch must go through `singleFlight(cacheKey, fn)`. This protects the source server (`cbexams.com`) from being knocked offline when thousands of users enter identical URLs.
* **Cache Key Normalization:** Always key by `EncKey` param from the URL using `getCacheKey()`.
* **Zero Heavy Dependencies:** Never add headless browser dependencies (Puppeteer, Playwright, Chromium). Cheerio + fetch handles 100% of the scraping requirement in milliseconds.

---

## 5. Next Steps / Database Integration Blueprint

When adding the database and ranking system requested by the user:
* **Database:** Use Serverless PostgreSQL (Neon or Supabase). Do NOT use SQLite (single-writer locks will choke at scale, and serverless local files are ephemeral).
* **Rank Queries:** Use native Postgres window functions:
  * Overall: `RANK() OVER (ORDER BY total_marks DESC)`
  * Category: `RANK() OVER (PARTITION BY category ORDER BY total_marks DESC)`
  * Shift: `RANK() OVER (PARTITION BY test_date, shift ORDER BY total_marks DESC)`
* **Indexes:** Ensure indexes on `(total_marks DESC)` and `(category, total_marks DESC)`.

---

## 6. Verification Checklist Before Committing

Always run the following commands before completing any task:
1. `npx tsc --noEmit` — verify 0 TypeScript errors.
2. `npm run build` — verify production Next.js build succeeds with static + dynamic routes.
3. Test with the live verified URL:
   `https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd`
   (Expected: Score 118.50, Correct 64, Wrong 19, Left 17).
4. **Update `HANDOFF.md` with session summary and current state.**
5. Update `AGENTS.md` if any rules or architectural patterns evolved.
6. Commit and push to `origin/main`.
