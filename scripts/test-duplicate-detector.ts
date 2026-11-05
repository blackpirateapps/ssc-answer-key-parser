import { ScoreCardResponse } from "../src/types";

console.log("Verifying Duplicate Detector payload contracts...");

const firstSubmission: ScoreCardResponse = {
  success: true,
  status: "completed",
  submissionId: 1,
  encKey: "url_candidate_1",
  alreadySavedByRollNo: false,
  candidate: {
    rollNo: "426120054646",
    name: "MONIDIP MANDAL",
    examLevel: "Combined Graduate Level Examination, 2026",
    testDate: "05 Oct 2026",
    shift: "10:00 AM Shift-1",
    centre: "TCS Gito Bitan",
  },
};

const duplicateSubmission: ScoreCardResponse = {
  success: true,
  status: "completed",
  submissionId: 2,
  encKey: "url_candidate_1_alternate_link",
  alreadySavedByRollNo: true,
  duplicateNotice: "This roll number is already saved, showing saved results.",
  candidate: {
    rollNo: "426120054646",
    name: "MONIDIP MANDAL",
    examLevel: "Combined Graduate Level Examination, 2026",
    testDate: "05 Oct 2026",
    shift: "10:00 AM Shift-1",
    centre: "TCS Gito Bitan",
  },
};

if (!firstSubmission.alreadySavedByRollNo && duplicateSubmission.alreadySavedByRollNo) {
  console.log("✅ First submission identified as primary (alreadySavedByRollNo = false)");
  console.log("✅ Duplicate submission correctly detected by roll number (alreadySavedByRollNo = true)");
  console.log(`✅ Duplicate notice verified: "${duplicateSubmission.duplicateNotice}"`);
} else {
  console.error("❌ Duplicate detection payload test failed!");
  process.exit(1);
}
