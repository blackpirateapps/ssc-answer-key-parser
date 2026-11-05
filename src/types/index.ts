export interface CandidateInfo {
  rollNo: string;
  name: string;
  examLevel: string;
  testDate: string;
  shift: string;
  centre: string;
}

export type QuestionStatus = "correct" | "wrong" | "unattempted";

export interface QuestionOption {
  optionNumber: number;
  imgUrl: string | null;
  text?: string | null;
  isCorrect: boolean;
  isChosen: boolean;
}

export interface QuestionDetail {
  qNum: number;
  sectionId: string;
  sectionName: string;
  status: QuestionStatus;
  chosenOption: number | null;
  correctOption: number | null;
  questionImgUrl?: string | null;
  questionText?: string | null;
  options?: QuestionOption[];
}

export interface SectionSummary {
  id: string;
  name: string;
  qRange: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  unattempted: number;
  positiveMarks: number;
  negativeMarks: number;
  sectionMarks: number;
  maxMarks: number;
  wrongQuestions: number[];
  unattemptedQuestions: number[];
}

export interface OverallSummary {
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  unattempted: number;
  accuracy: number;
  totalMarks: number;
  maxMarks: number;
}

export interface ScoreCardResponse {
  success: boolean;
  cached?: boolean;
  fetchedAt?: string;
  candidate?: CandidateInfo;
  summary?: OverallSummary;
  sections?: SectionSummary[];
  questions?: QuestionDetail[];
  error?: string;
}
