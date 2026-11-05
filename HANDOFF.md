# Project Handoff Documentation

**Project:** `ssc-answer-key-parser`  
**Repository:** [blackpirateapps/ssc-answer-key-parser](https://github.com/blackpirateapps/ssc-answer-key-parser)  
**Target Environment:** Vercel Serverless Functions (Region: `bom1` Mumbai, India) + Edge CDN  
**Last Updated:** November 5, 2026

---

## 1. Executive Summary

This project is a high-performance, minimalist (Hacker News-themed) web application that parses candidate response sheets from Staff Selection Commission (SSC) exams (specifically SSC CGL on `sscexams.cbexams.com`), calculates raw scores (+2 for correct, -0.5 for wrong), and provides a detailed section-by-section and question-by-question breakdown.

It is engineered to handle massive concurrent traffic spikes (10k+ users) during answer key releases without crashing Vercel functions or getting blocked by the source portal (`cbexams.com`).

**User Experience Goal:** 100% mobile-first and friction-free. Students simply copy their answer key link, paste it into the input box on mobile, and tap "Calculate Score". No bookmarklets, file uploads, or manual steps required.

---

## 2. Current Implementation Status

| Feature | Status | Details |
| :--- | :---: | :--- |
| **Response Sheet Scraper** | ✅ Complete | Parallel fetching across Parts A, B, C, D using ASP.NET session tokens. |
| **Question Color Parser** | ✅ Complete | Dynamic row detection handling Part A-C (with Hindi switch) and Part D (without Hindi switch). |
| **Scoring Engine** | ✅ Complete | Standard SSC CGL Tier 1 rules (+2.00 correct, -0.50 wrong, 0 unattempted). Max: 200 marks. |
| **High-Concurrency Caching** | ✅ Complete | In-memory LRU cache + Single-Flight request deduplication + Pluggable Upstash Redis. |
| **Hacker News UI** | ✅ Complete | Responsive, beige `#f6f6ef` & orange `#ff6600` theme, zero heavy component libraries. |
| **Question Review Filter** | ✅ Complete | Filterable list: All (100), Wrong (19), Left (17), Correct (64). |
| **Shareable URL Query** | ✅ Complete | `/?url=...` allows instant sharing and bookmarking. |
| **Vercel Mumbai (`bom1`) Routing** | ✅ Complete | Configured in `vercel.json` to prevent Cloudflare 403 Geo-blocking on foreign IPs. |
| **Residential Proxy Support** | ✅ Complete | Built-in `undici.ProxyAgent` support via `PROXY_URL` environment variable. |
| **Production Build** | ✅ Verified | Passes `npm run build` and `npx tsc --noEmit` cleanly. Tested on live sample. |

---

## 3. Verified Sample Data & Test URL

* **Live Sample URL:**  
  `https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd`
* **Expected Test Results:**
  * **Candidate:** MONIDIP MANDAL (Roll: `426120054646`, Shift: `10:00 AM Shift-1`, Date: `05 Oct 2026`)
  * **Attempted:** 83 / 100
  * **Correct:** 64 (+128.00 marks)
  * **Wrong:** 19 (-9.50 marks)
  * **Unattempted:** 17 (0.00 marks)
  * **Total Raw Score:** **118.50 / 200.00**
  * **Section Breakdown:**
    * Part A (Reasoning): 22 Correct, 3 Wrong, 0 Left → **42.50 / 50**
    * Part B (General Awareness): 14 Correct, 7 Wrong, 4 Left → **24.50 / 50**
    * Part C (Quantitative Aptitude): 9 Correct, 3 Wrong, 13 Left → **16.50 / 50**
    * Part D (English Comprehension): 19 Correct, 6 Wrong, 0 Left → **35.00 / 50**

---

## 4. Key Architectural Gotchas & Cloudflare Learnings

### A. Cloudflare Geo-Blocking (`HTTP 403` on Vercel)
* **Root Cause:** `cbexams.com` is protected by Cloudflare and blocks non-Indian (foreign) IP addresses. By default, Vercel deploys functions to Washington D.C., USA (`iad1`), causing Cloudflare to block Vercel with HTTP 403.
* **Solution:** We added `vercel.json` with `"regions": ["bom1"]`. This deploys all Vercel functions to **AWS Mumbai (`ap-south-1`) in India**, ensuring requests originate from within India.
* **Proxy Fallback:** If cbexams ever blocks AWS datacenter IPs, `src/lib/ssc-parser.ts` supports an optional `PROXY_URL` (e.g., an Indian residential proxy) that automatically routes all `fetch` traffic using `undici.ProxyAgent`.

### B. ASP.NET WebForms Form State Lifecycle
* **Do NOT submit `ddltest` in POST bodies:** The `ddltest` `<select>` is rendered with `disabled="disabled"` on the client. If submitted in the POST body to cbexams, ASP.NET's `ClientScriptManager.ValidateEvent` throws an unhandled `ArgumentException: Invalid postback or callback argument`.
* **Parallel Requests Use Initial ViewState:** Parts B, C, and D can all be fetched concurrently in parallel using the ViewState and EventValidation extracted from Part A's initial GET response. Do not fetch them sequentially.
* **Cookie Preservation:** Always pass the `ASP.NET_SessionId` cookie from Part A into subsequent requests.

### C. Cheerio HTML Parsing
* **Nested Table Hierarchy:** cbexams wraps all question tables inside an outer master table with 200+ rows. **Never** use `closest('table')` on a generic container `td`, or it will select the entire page. Always select the innermost `<font>` element whose text matches `Q.No: <num>`, and then call `.closest('table')`.
* **Row Offset in Part D:** Parts A, B, and C have a "Hindi version" button row at index 0. Part D (English Comprehension) does **not** have this row. Therefore, row indices are dynamic; the question row must be found by checking which row contains `Q.No:`, and option rows are identified by containing `<img>` tags.

### D. Concurrency at 10k Scale
* In-flight requests are deduplicated via `singleFlight` in `src/lib/cache.ts`. If 500 requests arrive for the same `EncKey` within the same second, only 1 HTTP request goes to `cbexams.com`.
* Once evaluated, response sheets are immutable. Cached entries have a 24-hour TTL.

---

## 5. Next Planned Milestones (Roadmap)

1. **Database Integration (PostgreSQL):**
   * Use serverless Postgres (Neon or Supabase).
   * Schema: Store `roll_no`, `name`, `category` (caste info), `test_date`, `shift`, `total_marks`, and full breakdown as `JSONB`.
2. **Rank & Normalization Engine:**
   * Compute **Overall Rank** (`RANK() OVER (ORDER BY total_marks DESC)`).
   * Compute **Category Rank** (`RANK() OVER (PARTITION BY category ORDER BY total_marks DESC)`).
   * Compute **Shift Rank & Average** (`RANK() OVER (PARTITION BY test_date, shift ORDER BY total_marks DESC)`).
3. **Category / Caste Input Form:**
   * Allow users to select their category (UR, OBC, EWS, SC, ST, PwD) to calculate their real-time rank.

---

## 6. Mandatory Agent Instruction
All future AI agents working on this repo **MUST** read and update this document (`HANDOFF.md`) before completing any session, verify with `npx tsc --noEmit` and `npm run build`, and push all changes to `origin/main`.
