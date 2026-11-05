# Project Handoff Documentation

**Project:** `ssc-answer-key-parser`  
**Repository:** [blackpirateapps/ssc-answer-key-parser](https://github.com/blackpirateapps/ssc-answer-key-parser)  
**Target Environment:** Vercel Serverless Functions + Edge CDN  
**Last Updated:** November 5, 2026

---

## 1. Executive Summary

This project is a high-performance, minimalist (Hacker News-themed) web application that parses candidate response sheets from Staff Selection Commission (SSC) exams (specifically SSC CGL on `sscexams.cbexams.com`), calculates raw scores (+2 for correct, -0.5 for wrong), and provides a detailed section-by-section and question-by-question breakdown.

It is engineered to handle massive concurrent traffic spikes (10k+ users) during answer key releases without crashing Vercel functions or getting blocked by the source portal (`cbexams.com`).

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

## 4. Key Architectural Gotchas for Future Agents

### A. ASP.NET WebForms Form State Lifecycle
* **Do NOT submit `ddltest` in POST requests:** The `ddltest` `<select>` is rendered with `disabled="disabled"` on the client. If submitted in the POST body to cbexams, ASP.NET's `ClientScriptManager.ValidateEvent` throws an unhandled `ArgumentException: Invalid postback or callback argument`.
* **Parallel Requests Use Initial ViewState:** Parts B, C, and D can all be fetched concurrently in parallel using the ViewState and EventValidation extracted from Part A's initial GET response. Do not fetch them sequentially.
* **Cookie Preservation:** Always pass the `ASP.NET_SessionId` cookie from Part A into subsequent POST requests.

### B. Cheerio HTML Parsing
* **Nested Table Hierarchy:** cbexams wraps all question tables inside an outer master table with 200+ rows. **Never** use `closest('table')` on a generic container `td`, or it will select the entire page. Always select the innermost `<font>` element whose text matches `Q.No: <num>`, and then call `.closest('table')`.
* **Row Offset in Part D:** Parts A, B, and C have a "Hindi version" button row at index 0. Part D (English Comprehension) does **not** have this row. Therefore, row indices are dynamic; the question row must be found by checking which row contains `Q.No:`, and option rows are identified by containing `<img>` tags.

### C. Concurrency at 10k Scale
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
3. **Category / Caste Input Modal:**
   * Prompt user to select their social category (UR, OBC, EWS, SC, ST, PwD) before or after viewing their scorecard so ranks can be calculated.
