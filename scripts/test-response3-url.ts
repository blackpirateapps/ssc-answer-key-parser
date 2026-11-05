import { parseSscAnswerKey } from "../src/lib/ssc-parser";

const testUrl =
  "https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct10/ViewCandResponse3.aspx?EncKey=XVnT858XvNTVw";

async function main() {
  console.log("Testing response parsing for ViewCandResponse3 URL...");
  const res = await parseSscAnswerKey(testUrl);

  console.log(`Candidate: ${res.candidate?.name} (${res.candidate?.rollNo})`);
  console.log(`Total Score: ${res.summary?.totalMarks} / ${res.summary?.maxMarks}`);
  console.log("Sections:");
  res.sections?.forEach((sec) => {
    console.log(
      `- Part ${sec.id} (${sec.name}): Correct: ${sec.correct}, Wrong: ${sec.wrong}, Left: ${sec.unattempted} => Score: ${sec.sectionMarks.toFixed(2)}`
    );
  });

  const partA = res.sections?.find((s) => s.id === "A");

  if (!partA || partA.attempted === 0 || partA.correct === 0) {
    console.error("❌ Part A (Reasoning) is still failing!");
    process.exit(1);
  }

  if (partA.correct === 21 && partA.wrong === 2 && partA.sectionMarks === 41.0) {
    console.log("✅ Part A (Reasoning) successfully fetched and verified! Score: 41.00 / 50");
  } else {
    console.warn(`⚠️ Part A has non-zero marks: ${partA.sectionMarks}, correct: ${partA.correct}`);
  }

  if (res.summary?.totalMarks === 136.0) {
    console.log("✅ Total raw score exactly matches 136.00!");
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
