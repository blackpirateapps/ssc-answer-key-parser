import { calculateClientScores } from "../src/lib/scoring";
import { RawSectionReport } from "../src/types";

console.log("Testing calculateClientScores...");

const sampleSections: RawSectionReport[] = [
  {
    sectionId: "A",
    sectionName: "General Intelligence & Reasoning",
    totalQuestions: 25,
    correct: 22,
    wrong: 3,
    unattempted: 0,
  },
  {
    sectionId: "B",
    sectionName: "General Awareness",
    totalQuestions: 25,
    correct: 14,
    wrong: 7,
    unattempted: 4,
  },
  {
    sectionId: "C",
    sectionName: "Quantitative Aptitude",
    totalQuestions: 25,
    correct: 9,
    wrong: 3,
    unattempted: 13,
  },
  {
    sectionId: "D",
    sectionName: "English Comprehension",
    totalQuestions: 25,
    correct: 19,
    wrong: 6,
    unattempted: 0,
  },
];

const result = calculateClientScores(sampleSections);

console.log("Calculated Summary:", result.summary);
console.log("Section Scores:");
result.sections.forEach((sec) => {
  console.log(`- Part ${sec.id} (${sec.name}): ${sec.sectionMarks.toFixed(2)} / ${sec.maxMarks}`);
});

const expectedTotal = 118.5;
const expectedCorrect = 64;
const expectedWrong = 19;
const expectedLeft = 17;

if (
  result.summary.totalMarks === expectedTotal &&
  result.summary.correct === expectedCorrect &&
  result.summary.wrong === expectedWrong &&
  result.summary.unattempted === expectedLeft
) {
  console.log("✅ All client-side calculation checks PASSED!");
} else {
  console.error("❌ Calculation mismatch!");
  process.exit(1);
}
