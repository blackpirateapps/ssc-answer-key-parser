# Project Handoff Documentation

**Project:** `ssc-answer-key-parser`  
**Repository:** [blackpirateapps/ssc-answer-key-parser](https://github.com/blackpirateapps/ssc-answer-key-parser)  
**Target Environment:** Vercel Serverless Functions (Region: `bom1` Mumbai, India) + Neon Serverless PostgreSQL + Edge CDN  
**Last Updated:** November 5, 2026

---

## 1. Executive Summary

This project is a high-performance, student-friendly web application that parses candidate response sheets from Staff Selection Commission (SSC) exams (specifically SSC CGL on `sscexams.cbexams.com`), persists raw submissions into Neon PostgreSQL, and calculates scores (+2 for correct, -0.5 for wrong) directly in the browser.

It is engineered to absorb **10,000 to 100,000 concurrent user traffic spikes** during answer key releases without crashing Vercel functions, running out of database connections, or getting blocked by `cbexams.com`. It features a polished, accessible design (Neutral Slate / Minimalist Monochrome with Blue accents) built with modern sans-serif typography, Lucide vector icons, interactive visual progress bars, and zero monospace terminal aesthetics.

---

## 2. Current Implementation Status

| Feature | Status | Details |
| :--- | :---: | :--- |
| **Response Sheet Scraper** | ✅ Complete | Parallel fetching across Parts A, B, C, D using ASP.NET session tokens. |
| **Immediate URL Queue** | ✅ Complete | URLs are saved first to PostgreSQL `submissions` table (<20ms) before processing. |
| **Neon PostgreSQL DB** | ✅ Complete | `@neondatabase/serverless` HTTP pooling driver; auto-migrates via `schema.sql`. |
| **Normalized Data Model** | ✅ Complete | `examinations` and `exam_shifts` deduplicated & referenced by foreign key. |
| **Subjectwise Report Cards** | ✅ Complete | `report_cards` stores pure counts: `correct_count`, `wrong_count`, `unattempted_count`. |
| **Browser Score Engine** | ✅ Complete | `src/lib/scoring.ts` evaluates marks (+2 / -0.5), net marks, and accuracy in the browser. |
| **Concurrency Limiter** | ✅ Complete | PostgreSQL `FOR UPDATE SKIP LOCKED` throttles scraping to 2 concurrent workers. |
| **Self-Driving Queue Polling** | ✅ Complete | Frontend automatically polls queue position and displays retro HN queue status banner. |
| **Worker Drain Endpoint** | ✅ Complete | `/api/worker` endpoint ready for Vercel Cron or background queue draining. |
| **Roll Number Deduplication** | ✅ Complete | Detects duplicate roll numbers across different URLs and displays "This roll number is already saved, showing saved results." |
| **PDF Export (2 Modes)** | ✅ Complete | Download as PDF: (1) Correct Answers Only (Revision Sheet) and (2) Full Paper (All 4 Options & Answers). |
| **High-Concurrency Caching** | ✅ Complete | In-memory LRU + Single-Flight deduplication + Pluggable Upstash Redis. |
| **Modern Student UI** | ✅ Complete | Neutral Slate & Blue theme, Lucide icons, sans-serif typography, stacked visual bars, and 3-step guide. |
| **Production Build** | ✅ Verified | Passes `npm run build` and `npx tsc --noEmit` cleanly. Tested on live sample. |

---

## 3. Verified Sample Data & Test Results

* **Verified Sample Data & Test Results:**
  * **Sample 1 (MONIDIP MANDAL - Oct 5 Shift 1):**
    * URL: `https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd`
    * Roll: `426120054646`, Shift: `10:00 AM Shift-1`, Date: `05 Oct 2026`
    * Attempted: 83 / 100, Correct: 64, Wrong: 19, Left: 17
    * Total Score: **118.50 / 200.00** (Reasoning: 42.50, GA: 24.50, Quant: 16.50, English: 35.00)
  * **Sample 2 (SUDIP MANDAL - Oct 10 Shift 2, ViewCandResponse3 URL):**
    * URL: `https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct10/ViewCandResponse3.aspx?EncKey=XVnT858XvNTVw`
    * Roll: `426120243491`, Shift: `01:30 PM Shift-2`, Date: `10 Oct 2026`
    * Attempted: 83 / 100, Correct: 71, Wrong: 12, Left: 17
    * Total Score: **136.00 / 200.00** (Reasoning: **41.00**, GA: 32.50, Quant: 25.00, English: 37.50)

---

## 4. Key Architectural Patterns & Concurrency Design

### A. High-Concurrency URL Ingestion (10k–100k Spikes)
1. **Immediate Database Write First:** When candidates paste their URL, `POST /api/check` executes `INSERT INTO submissions (enc_key, answer_key_url, status) VALUES (...) ON CONFLICT (enc_key) DO UPDATE ...`. This takes ~15ms, immediately capturing every submission in Postgres.
2. **Serverless Worker Lock (`FOR UPDATE SKIP LOCKED`):** The system claims the next pending job using PostgreSQL row-level locks. If all worker slots are active (concurrency cap = 2), the API returns HTTP 202 `{ status: "pending", queuePosition }`.
3. **Self-Driving Queue Polling:** Browsers poll `GET /api/check?encKey=...` every 1.8s. If a worker slot has opened, the polling tick claims and processes the submission, eliminating the requirement for complex external queue daemons.

### B. Normalized Schema Architecture
1. **`examinations`:** Unique examination names (`Combined Graduate Level Examination, 2026`). Deduplicated via `ON CONFLICT (name) DO UPDATE`.
2. **`exam_shifts`:** Deduplicated test dates and shift times linked to `exam_id` with `UNIQUE(exam_id, test_date, shift_time)`.
3. **`submissions`:** Intake queue and candidate master record (`roll_no`, `candidate_name`, `centre`, `exam_id`, `shift_id`, `status`, `raw_questions`).
4. **`report_cards`:** Normalized subjectwise counts (`correct_count`, `wrong_count`, `unattempted_count`).

### C. Client-Side Marks Calculation
- Raw section counts (`correct`, `wrong`, `unattempted`) are delivered to the frontend.
- `src/lib/scoring.ts` runs inside the browser to calculate:
  - Positive marks (`correct * 2.0`)
  - Negative marks (`wrong * 0.5`)
  - Net section marks (`positive - negative`)
  - Overall accuracy and total score.

### D. Two-Tier Duplication Detection
1. **Tier 1 (URL / EncKey Level):**
   - The user inputs their cbexams URL.
   - The server first checks if this `enc_key` is already saved and completed in cache/Postgres. If yes, it returns the saved scorecard immediately (0ms scrape).
   - If not yet in the database, the URL is saved first into `submissions` with `status = 'pending'`.
2. **Tier 2 (Candidate Roll Number Level):**
   - Once the background worker fetches the page from cbexams and extracts the candidate's `roll_no` and `exam_id`:
   - It checks: `SELECT id FROM submissions WHERE roll_no = $1 AND exam_id = $2 AND status = 'completed' AND id != $3`.
   - If a completed submission for that roll number already exists, it flags `alreadySavedByRollNo: true`.
   - The frontend renders an informative alert:
     `"This roll number is already saved, showing saved results."`
   - Prevents duplicate evaluations even if a candidate generates or pastes an alternate link.

### E. PDF Download Engine (`src/lib/pdf-generator.ts`)
1. **Bypassing Canvas CORS Restrictions:**
   - Image assets on `sscexams.cbexams.com` do not include `Access-Control-Allow-Origin: *`.
   - Client-side canvas libraries (e.g. `html2canvas`, `jspdf`) fail with canvas tainting security errors when trying to export cross-origin images.
   - We utilize an A4 print-optimized document window with an image preloading barrier (`Promise.all(images.map(img => img.onload))`) that invokes `window.print()` / "Save as PDF" natively across all mobile and desktop browsers with 100% vector clarity and zero CORS issues.
2. **Dual PDF Modes:**
   - **Mode 1 (Just Correct Answers):** Shows candidate metadata, summary scoreboard, and questions with **only** the official correct answer option highlighted in green. Distractor options are stripped to create an uncluttered, compact revision sheet.
   - **Mode 2 (All Options & Answers):** Complete question paper showing the full 4-option grid with correct answers badged in green and candidate choices highlighted.

---

### F. Multi-Part URL Variant Normalization & Dynamic Section Fetching
1. **The Issue:**
   - When candidates browse Part B, C, or D in cbexams, the portal changes the address bar URL to `ViewCandResponse2.aspx`, `ViewCandResponse3.aspx`, or `ViewCandResponse4.aspx`.
   - An initial GET request to `ViewCandResponse3.aspx` returns Part C (Q.51–Q.75) instead of Part A. The scraper previously assumed the initial GET was always Part A, causing Part A (Reasoning) to evaluate to 0 attempted / 25 left.
2. **The Fix:**
   - Canonicalizes any `ViewCandResponse\d*\.aspx` to `ViewCandResponse.aspx` via `normalizeAnswerKeyUrl`.
   - In `src/lib/ssc-parser.ts`, dynamically detects the initial page's section index (`detectSectionIndex`) by inspecting the question numbers, and fetches the remaining 3 sections in parallel (including `P1` for Part A if the initial page was Part C).
   - In `src/app/api/check/route.ts`, auto-detects corrupted database records (`isCorruptedRecord`) and force-requeues them with the canonical URL so PostgreSQL (`submissions` and `report_cards`) and caches are updated with the corrected reasoning scores.

---

### G. Browser Extension Hydration Guard (`suppressHydrationWarning`)
- Certain browser extensions (e.g. Internet Download Manager, color pickers, accessibility tools) inject random classes or attributes (e.g. `idc0_343`) onto the root `<html>` or `<body>` tag before React hydration occurs.
- Both `<html lang="en" suppressHydrationWarning>` and `<body ... suppressHydrationWarning>` include `suppressHydrationWarning` in `src/app/layout.tsx` to prevent console hydration mismatch warnings.

---

## 5. Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` or `POSTGRES_URL` | Optional (Prod recommended) | Neon Serverless PostgreSQL connection URL (auto-provided by Vercel Neon Integration). |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis REST URL for multi-tier edge caching. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST token. |
| `PROXY_URL` | Optional | Indian residential proxy URL for fallback if host IPs are blocked. |

---

## 6. Next Planned Milestones

1. **Rank & Normalization Engine:**
   - Compute **Overall Rank** (`RANK() OVER (ORDER BY total_marks DESC)`).
   - Compute **Category Rank** (`RANK() OVER (PARTITION BY category ORDER BY total_marks DESC)`).
   - Compute **Shift Rank & Average** (`RANK() OVER (PARTITION BY test_date, shift ORDER BY total_marks DESC)`).
2. **Category / Reservation Input Form:**
   - Allow candidates to select their category (UR, OBC, EWS, SC, ST, PwD) to calculate their rank relative to peers.
3. **Vercel Cron Configuration:**
   - Add `vercel.json` crons entry to invoke `/api/worker` every 1 minute to clear background backlogs if user tabs close.

---

## 7. Mandatory Agent Instruction
All future AI agents working on this repo **MUST** read and update this document (`HANDOFF.md`) before completing any session, verify with `npx tsc --noEmit` and `npm run build`, and push all changes to `origin/main`.
