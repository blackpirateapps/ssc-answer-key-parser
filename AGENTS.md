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
This repository provides a lightweight, ultra-fast, student-friendly web application to parse SSC CGL response sheet URLs (hosted on `sscexams.cbexams.com`), calculate raw scores (+2 for correct, -0.5 for wrong), and persist submissions into Neon Serverless PostgreSQL. It is engineered to absorb extreme traffic spikes (10k–100k concurrent requests) via an immediate-save URL intake queue and controlled sequential scraping. It features a polished, accessible design (Neutral Slate / Minimalist Monochrome with Blue accents) built with modern sans-serif typography, Lucide vector icons, interactive visual progress bars, and zero monospace terminal aesthetics.

---

## 2. Codebase Architecture & File Roles

```
src/
├── app/
│   ├── api/
│   │   ├── check/
│   │   │   └── route.ts       # Serverless URL intake & polling endpoint with Neon + Cache
│   │   └── worker/
│   │       └── route.ts       # Cron/queue drain endpoint (drains pending jobs one by one)
│   ├── globals.css            # Tailwind v4 configuration + Neutral Slate & Blue theme vars
│   ├── layout.tsx             # Root layout with metadata and font setup
│   └── page.tsx               # Client UI component (Slate & Blue aesthetic, polling, browser score calc)
├── lib/
│   ├── cache.ts               # In-memory LRU + Single-Flight deduplication + Upstash Redis
│   ├── db/
│   │   ├── index.ts           # Neon serverless Postgres client, SKIP LOCKED queue & schema init
│   │   └── schema.sql         # Normalized schema: examinations, exam_shifts, submissions, report_cards
│   ├── pdf-generator.ts       # A4 print-optimized PDF generation (correct-only & all-options)
│   ├── scoring.ts             # Pure client/shared marks calculation engine (+2 / -0.5)
│   ├── ssc-parser.ts          # Core Cheerio scraping & ASP.NET WebForms postback engine
│   └── worker.ts              # Queue processing worker with concurrency throttle
└── types/
    └── index.ts               # Strongly typed data models (Candidate, Question, Submission, Summary)
scripts/
├── init-db.mjs                # Standalone database migration runner (`npm run db:init`)
├── test-scoring.ts            # Scoring unit test
└── test-scraper.ts            # Live cbexams integration verification test
vercel.json                    # Deploys functions to Mumbai ("bom1") to bypass India geo-blocks
HANDOFF.md                     # Comprehensive project status, test logs, and next milestones
AGENTS.md                      # Instructions, architectural patterns, and scraping rules for agents
```

---

## 3. Strict Database & Queue Rules

1. **Answer Key URLs Saved First:**
   - In `src/app/api/check/route.ts`, the incoming URL is immediately saved to the `submissions` table with `status = 'pending'` (<20ms write).
   - This ensures zero dropped requests even when 10k–100k users submit at the exact same moment.
2. **PostgreSQL Row-Level Locking (`FOR UPDATE SKIP LOCKED`):**
   - Background processing uses `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`.
   - Never use standard `SELECT` or client-side locks for queue management; `SKIP LOCKED` prevents duplicate scrapes across serverless functions.
3. **Scraper Concurrency Cap:**
   - Strict limit of **2 concurrent outbound requests** to `sscexams.cbexams.com` (`SCRAPER_CONCURRENCY_CAP = 2` in `src/lib/worker.ts`).
   - Protects the external portal from being blocked or knocked offline.
4. **Data Normalization:**
   - Examination titles are deduplicated in `examinations` (referenced by `exam_id`).
   - Shifts and dates are deduplicated in `exam_shifts` (referenced by `shift_id`).
   - `report_cards` stores pure counts (`correct_count`, `wrong_count`, `unattempted_count`).
5. **Marks Calculation in Browser:**
   - The database stores raw counts. Marks calculation (+2.00 correct, -0.50 wrong, net scores, accuracy) executes inside the browser via `src/lib/scoring.ts`.
6. **Two-Tier Duplication Detection:**
   - **Tier 1 (URL Check):** First checks if URL/EncKey is already completed in cache/DB. If new, enqueues the URL.
   - **Tier 2 (Roll Number Check):** Once scraped, checks candidate `roll_no` against existing completed submissions for that exam. If already present, marks `alreadySavedByRollNo = true` and informs the candidate: *"This roll number is already saved, showing saved results."*

---

## 4. Strict Scraping & ASP.NET Rules

1. **Deploy to Mumbai, India (`bom1`):**
   - `cbexams.com` is protected by Cloudflare with **strict Geo-blocking for non-Indian IPs**.
   - Serverless functions must run in Mumbai (`vercel.json` -> `"regions": ["bom1"]`).
   - If AWS datacenters get blocked during high-traffic exam days, use `PROXY_URL` (via `undici.ProxyAgent`).
2. **Do NOT submit `ddltest` in POST bodies:**
   - The dropdown `<select id="ddltest">` is disabled in HTML. Submitting it causes ASP.NET to throw `Invalid postback or callback argument`.
3. **Fetch Parts B, C, D in Parallel:**
   - All three parts use the ViewState, ViewStateGenerator, and EventValidation extracted from Part A via `Promise.all`.
4. **Session Cookies:**
   - Always extract and pass the `ASP.NET_SessionId` cookie from Part A into subsequent requests.
5. **Target Specific `<font>` Tags for Question Tables:**
   - Always select innermost `<font>` matching `Q.No: <num>`, and call `.closest('table')`.
6. **Dynamic Row Layouts:**
   - Parts A–C have a "Hindi version" button row at index 0; Part D does not. Never hardcode row indices `[3, 4, 5, 6]`. Locate rows dynamically by checking for `Q.No:` and `<img>`.
7. **Multi-Part URL Variants (`ViewCandResponse[1-4].aspx`):**
   - Candidates copying URLs from Parts B, C, or D paste `ViewCandResponse2.aspx`, `ViewCandResponse3.aspx`, or `ViewCandResponse4.aspx`.
   - Always normalize to canonical `ViewCandResponse.aspx` via `normalizeAnswerKeyUrl`.
   - Dynamically detect the initial section index (`detectSectionIndex`) and fetch the remaining 3 parts in parallel (including `P1` for Part A if the initial page was Part C).

---

## 5. Verification Checklist Before Committing

Always run the following commands before completing any task:
1. `npx tsc --noEmit` — verify 0 TypeScript errors.
2. `npm run build` — verify production Next.js build succeeds with static + dynamic routes.
3. Run verification scripts:
   - `npx tsx scripts/test-scoring.ts`
   - `npx tsx scripts/test-scraper.ts` (Expected score: **118.50**, Correct: **64**, Wrong: **19**, Left: **17**).
4. **Update `HANDOFF.md` with session summary and current state.**
5. Update `AGENTS.md` if any rules or architectural patterns evolved.
6. Commit and push to `origin/main`.
