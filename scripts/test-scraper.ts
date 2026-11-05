import { parseSscAnswerKey } from "../src/lib/ssc-parser";

const LIVE_URL =
  "https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd";

async function run() {
  console.log("Fetching live response sheet from cbexams.com...");
  const t0 = Date.now();
  const res = await parseSscAnswerKey(LIVE_URL);
  const elapsed = Date.now() - t0;

  console.log(`Scraped in ${elapsed}ms:`);
  console.log(`Candidate: ${res.candidate?.name} (${res.candidate?.rollNo})`);
  console.log(`Exam: ${res.candidate?.examLevel}`);
  console.log(`Shift: ${res.candidate?.shift}, Date: ${res.candidate?.testDate}`);
  console.log(`Total Score: ${res.summary?.totalMarks} / ${res.summary?.maxMarks}`);
  console.log(`Correct: ${res.summary?.correct}, Wrong: ${res.summary?.wrong}, Left: ${res.summary?.unattempted}`);

  if (res.summary?.totalMarks === 118.5) {
    console.log("✅ Live scraper test PASSED with exact expected score 118.50!");
  } else {
    console.error("❌ Live score does not match 118.50!");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Scraper error:", err);
  process.exit(1);
});
