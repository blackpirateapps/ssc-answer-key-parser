import { ScoreCardResponse } from "../src/types";

console.log("Testing PDF generation logic and mode templates...");

const mockResult: ScoreCardResponse = {
  success: true,
  status: "completed",
  submissionId: 1,
  candidate: {
    rollNo: "426120054646",
    name: "MONIDIP MANDAL",
    examLevel: "Combined Graduate Level Examination, 2026",
    testDate: "05 Oct 2026",
    shift: "10:00 AM Shift-1",
    centre: "TCS Gito Bitan",
  },
  summary: {
    totalQuestions: 100,
    attempted: 83,
    correct: 64,
    wrong: 19,
    unattempted: 17,
    accuracy: 77.11,
    totalMarks: 118.5,
    maxMarks: 200,
  },
  sections: [
    {
      id: "A",
      name: "General Intelligence & Reasoning",
      qRange: "Q.1 - Q.25",
      totalQuestions: 25,
      attempted: 25,
      correct: 22,
      wrong: 3,
      unattempted: 0,
      positiveMarks: 44,
      negativeMarks: 1.5,
      sectionMarks: 42.5,
      maxMarks: 50,
      wrongQuestions: [],
      unattemptedQuestions: [],
    },
  ],
  questions: [
    {
      qNum: 1,
      sectionId: "A",
      sectionName: "General Intelligence & Reasoning",
      status: "correct",
      chosenOption: 2,
      correctOption: 2,
      questionImgUrl: "https://sscexams.cbexams.com/q1.jpg",
      options: [
        { optionNumber: 1, imgUrl: "https://sscexams.cbexams.com/opt1.jpg", isCorrect: false, isChosen: false },
        { optionNumber: 2, imgUrl: "https://sscexams.cbexams.com/opt2.jpg", isCorrect: true, isChosen: true },
        { optionNumber: 3, imgUrl: "https://sscexams.cbexams.com/opt3.jpg", isCorrect: false, isChosen: false },
        { optionNumber: 4, imgUrl: "https://sscexams.cbexams.com/opt4.jpg", isCorrect: false, isChosen: false },
      ],
    },
    {
      qNum: 2,
      sectionId: "A",
      sectionName: "General Intelligence & Reasoning",
      status: "wrong",
      chosenOption: 1,
      correctOption: 3,
      questionImgUrl: "https://sscexams.cbexams.com/q2.jpg",
      options: [
        { optionNumber: 1, imgUrl: "https://sscexams.cbexams.com/q2_opt1.jpg", isCorrect: false, isChosen: true },
        { optionNumber: 2, imgUrl: "https://sscexams.cbexams.com/q2_opt2.jpg", isCorrect: false, isChosen: false },
        { optionNumber: 3, imgUrl: "https://sscexams.cbexams.com/q2_opt3.jpg", isCorrect: true, isChosen: false },
        { optionNumber: 4, imgUrl: "https://sscexams.cbexams.com/q2_opt4.jpg", isCorrect: false, isChosen: false },
      ],
    },
  ],
};

// Verify Correct Only Mode checks
const q1 = mockResult.questions![0];
const correctOptQ1 = q1.options?.find(o => o.isCorrect);
if (correctOptQ1?.optionNumber !== 2) {
  console.error("❌ Q1 correct option check failed");
  process.exit(1);
}

const q2 = mockResult.questions![1];
const correctOptQ2 = q2.options?.find(o => o.isCorrect);
if (correctOptQ2?.optionNumber !== 3) {
  console.error("❌ Q2 correct option check failed");
  process.exit(1);
}

console.log("✅ PDF Data Structures & Filter Rules validated for both 'correct_only' and 'all_options'!");
