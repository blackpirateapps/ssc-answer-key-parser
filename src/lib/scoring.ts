import { OverallSummary, RawSectionReport, SectionSummary } from "@/types";

/**
 * Calculates raw marks and summary purely from section-wise counts.
 * Scoring Rule: +2.00 for Correct, -0.50 for Wrong, 0.00 for Unattempted.
 * Max marks: 200 (4 sections * 25 questions * 2 marks).
 */
export function calculateClientScores(
  rawSections: RawSectionReport[],
  questionRangeMap?: Record<string, string>
): {
  sections: SectionSummary[];
  summary: OverallSummary;
} {
  const defaultRanges: Record<string, string> = {
    A: "Q.1 - Q.25",
    B: "Q.26 - Q.50",
    C: "Q.51 - Q.75",
    D: "Q.76 - Q.100",
  };

  let totalQuestions = 0;
  let totalAttempted = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnattempted = 0;
  let totalMarks = 0;

  const evaluatedSections: SectionSummary[] = rawSections.map((sec) => {
    const correct = Number(sec.correct || 0);
    const wrong = Number(sec.wrong || 0);
    const unattempted = Number(sec.unattempted || 0);
    const totalSecQuestions = Number(sec.totalQuestions || 25);
    const attempted = correct + wrong;

    const positiveMarks = correct * 2.0;
    const negativeMarks = wrong * 0.5;
    const sectionMarks = positiveMarks - negativeMarks;
    const maxMarks = totalSecQuestions * 2.0;

    totalQuestions += totalSecQuestions;
    totalAttempted += attempted;
    totalCorrect += correct;
    totalWrong += wrong;
    totalUnattempted += unattempted;
    totalMarks += sectionMarks;

    return {
      id: sec.sectionId,
      name: sec.sectionName,
      qRange:
        questionRangeMap?.[sec.sectionId] ||
        defaultRanges[sec.sectionId] ||
        "Q.1 - Q.25",
      totalQuestions: totalSecQuestions,
      attempted,
      correct,
      wrong,
      unattempted,
      positiveMarks,
      negativeMarks,
      sectionMarks,
      maxMarks,
      wrongQuestions: [],
      unattemptedQuestions: [],
    };
  });

  const accuracy =
    totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

  return {
    sections: evaluatedSections,
    summary: {
      totalQuestions: totalQuestions || 100,
      attempted: totalAttempted,
      correct: totalCorrect,
      wrong: totalWrong,
      unattempted: totalUnattempted,
      accuracy: Math.round(accuracy * 100) / 100,
      totalMarks: Math.round(totalMarks * 100) / 100,
      maxMarks: (totalQuestions || 100) * 2,
    },
  };
}
