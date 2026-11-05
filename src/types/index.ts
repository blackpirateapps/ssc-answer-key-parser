export interface CandidateInfo {
  rollNo: string;
  name: string;
  examLevel: string;
  testDate: string;
  shift: string;
  centre: string;
}

export type QuestionStatus = "correct" | "wrong" | "unattempted";
export type SubmissionStatus = "pending" | "processing" | "completed" | "failed";

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

export interface RawSectionReport {
  sectionId: string;
  sectionName: string;
  totalQuestions: number;
  correct: number;
  wrong: number;
  unattempted: number;
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
  status?: SubmissionStatus;
  submissionId?: number;
  encKey?: string;
  queuePosition?: number;
  message?: string;
  cached?: boolean;
  alreadySavedByRollNo?: boolean;
  duplicateNotice?: string;
  fetchedAt?: string;
  candidate?: CandidateInfo;
  summary?: OverallSummary;
  sections?: SectionSummary[];
  rawSections?: RawSectionReport[];
  questions?: QuestionDetail[];
  error?: string;
}

export interface ExamShiftSummary {
  id: number;
  testDate: string;
  shiftTime: string;
  studentCount: number;
  avgScore: number;
  maxScore: number;
}

export interface ExaminationSummary {
  id: number;
  name: string;
  studentCount: number;
  avgScore: number;
  maxScore: number;
  shiftsCount?: number;
  shifts?: ExamShiftSummary[];
}
