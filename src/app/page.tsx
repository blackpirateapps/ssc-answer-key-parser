"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScoreCardResponse,
  QuestionStatus,
  RawSectionReport,
  ExaminationSummary,
} from "@/types";
import { calculateClientScores } from "@/lib/scoring";
import { downloadQuestionsPdf } from "@/lib/pdf-generator";
import {
  GraduationCap,
  Link2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Calendar,
  MapPin,
  Building2,
  Download,
  ChevronDown,
  ChevronUp,
  Share2,
  Check,
  FileText,
  Layers,
  Sparkles,
  HelpCircle,
  AlertCircle,
  ArrowRight,
  LayoutGrid,
  List,
  Info,
  Loader2,
  Target,
  FileCheck2,
  X,
  ExternalLink,
  Users,
  BarChart3,
  TrendingUp,
  Award,
} from "lucide-react";

function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

const DEMO_URL =
  "https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreCardResponse | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [copied, setCopied] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [queueState, setQueueState] = useState<{
    status: string;
    queuePosition?: number;
    message?: string;
    encKey?: string;
  } | null>(null);

  const [examinations, setExaminations] = useState<ExaminationSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examDetails, setExamDetails] = useState<Record<number, ExaminationSummary>>({});
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingExamId, setLoadingExamId] = useState<number | null>(null);

  const fetchExaminations = async () => {
    try {
      setLoadingExams(true);
      const res = await fetch("/api/examinations");
      const data = await res.json();
      if (data.success && Array.isArray(data.examinations)) {
        setExaminations(data.examinations);
      }
    } catch (err) {
      console.warn("Failed to fetch examinations:", err);
    } finally {
      setLoadingExams(false);
    }
  };

  const handleSelectExam = async (examId: number) => {
    if (selectedExamId === examId) {
      setSelectedExamId(null);
      return;
    }
    setSelectedExamId(examId);

    if (!examDetails[examId]) {
      try {
        setLoadingExamId(examId);
        const res = await fetch(`/api/examinations?id=${examId}`);
        const data = await res.json();
        if (data.success && data.examination) {
          setExamDetails((prev) => ({ ...prev, [examId]: data.examination }));
        }
      } catch (err) {
        console.warn("Failed to fetch examination details:", err);
      } finally {
        setLoadingExamId(null);
      }
    }
  };

  // Fetch examinations list on initial mount
  useEffect(() => {
    fetchExaminations();
  }, []);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Auto-check if ?url= is in query string
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get("url");
      if (queryUrl) {
        setUrl(queryUrl);
        handleCalculate(queryUrl);
      }
    }
  }, []);

  /**
   * Browser-side score calculation helper:
   * Recomputes marks (+2.00 correct, -0.50 wrong) purely inside the client.
   */
  const processAndSetResult = (data: ScoreCardResponse) => {
    const raw: RawSectionReport[] =
      data.rawSections ||
      data.sections?.map((s) => ({
        sectionId: s.id,
        sectionName: s.name,
        totalQuestions: s.totalQuestions || 25,
        correct: s.correct,
        wrong: s.wrong,
        unattempted: s.unattempted,
      })) ||
      [];

    if (raw.length > 0) {
      const { sections, summary } = calculateClientScores(raw);
      // Preserve original wrong/unattempted question lists if available
      if (data.sections) {
        sections.forEach((sec, idx) => {
          if (data.sections?.[idx]) {
            sec.wrongQuestions = data.sections[idx].wrongQuestions;
            sec.unattemptedQuestions = data.sections[idx].unattemptedQuestions;
          }
        });
      }
      setResult({
        ...data,
        sections,
        summary,
      });
    } else {
      setResult(data);
    }
    fetchExaminations();
  };

  const startPolling = (encKey: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/check?encKey=${encodeURIComponent(encKey)}`);
        const pollData: ScoreCardResponse = await res.json();

        if (pollData.status === "completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setQueueState(null);
          processAndSetResult(pollData);
          setLoading(false);
        } else if (pollData.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setQueueState(null);
          setError(pollData.error || "Failed to process answer key.");
          setLoading(false);
        } else if (pollData.status === "pending" || pollData.status === "processing") {
          setQueueState({
            status: pollData.status,
            queuePosition: pollData.queuePosition,
            message: pollData.message,
            encKey,
          });
        }
      } catch (err: any) {
        console.warn("Polling error:", err);
      }
    }, 1800);
  };

  const handleCalculate = async (inputUrl?: string) => {
    const targetUrl = (inputUrl || url).trim();
    if (!targetUrl) {
      setError("Please paste your cbexams answer key URL.");
      return;
    }

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setQueueState(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data: ScoreCardResponse = await res.json();

      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || "Failed to parse answer key.");
      }

      // If queued / pending, URL has been saved first, start polling
      if (data.status === "pending" || data.status === "processing" || res.status === 202) {
        setQueueState({
          status: data.status || "pending",
          queuePosition: data.queuePosition,
          message:
            data.message ||
            "URL saved securely. Processing answer keys one by one...",
          encKey: data.encKey,
        });

        if (data.encKey) {
          startPolling(data.encKey);
        }
        return;
      }

      // If immediately completed
      if (data.status === "completed" || data.success) {
        processAndSetResult(data);
        setLoading(false);
      } else {
        throw new Error(data.error || "Failed to parse answer key.");
      }

      // Update browser URL query string without reloading
      if (typeof window !== "undefined") {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("url", targetUrl);
        window.history.replaceState({}, "", newUrl.toString());
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching the answer key.");
      setLoading(false);
    }
  };

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const filteredQuestions = result?.questions?.filter((q) => {
    if (filter === "all") return true;
    return q.status === filter;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900">
      {/* Modern Clean Header Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">
                  SSC Scorecard
                </span>
                <span className="bg-blue-50 text-blue-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-blue-200/60">
                  CGL Tier-1
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Answer Key Analyzer &amp; Score Calculator
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setUrl(DEMO_URL);
                handleCalculate(DEMO_URL);
              }}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Sample Sheet</span>
            </button>
            <a
              href="https://github.com/blackpirateapps/ssc-answer-key-parser"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              title="View on GitHub"
            >
              <GithubIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto p-4 sm:p-6 flex-grow space-y-6">
        {/* Intake Hero Card */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-7">
          <div className="max-w-2xl">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Check Your SSC CGL Score Instantly
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Paste your official cbexams response sheet link to view your marks, section breakdown, accuracy, and download your paper.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCalculate();
            }}
            className="mt-5 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Link2 className="w-4 h-4" />
                </div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://sscexams.cbexams.com/CGLE.../ViewCandResponse.aspx?EncKey=..."
                  required
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
                {url && (
                  <button
                    type="button"
                    onClick={() => {
                      setUrl("");
                      setResult(null);
                      setError(null);
                      setQueueState(null);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Clear input"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Calculating...</span>
                  </>
                ) : (
                  <>
                    <span>Calculate Score</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Quick helper toggles */}
            <div className="flex flex-wrap items-center justify-between text-xs pt-1 gap-2">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>How to find your response sheet link?</span>
                {showGuide ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUrl(DEMO_URL);
                  handleCalculate(DEMO_URL);
                }}
                className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Try sample answer key URL
              </button>
            </div>

            {/* 3-Step Guide for Normies */}
            {showGuide && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2 mt-3 animate-in fade-in duration-200">
                <div className="font-semibold text-slate-800 text-sm mb-1">
                  How to get your answer key URL in 3 simple steps:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200/80">
                    <span className="inline-block w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-center leading-5 text-[11px] mb-1.5">
                      1
                    </span>
                    <div className="font-medium text-slate-800">Login to SSC</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Visit the official SSC candidate challenge portal using your credentials.
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200/80">
                    <span className="inline-block w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-center leading-5 text-[11px] mb-1.5">
                      2
                    </span>
                    <div className="font-medium text-slate-800">Open Response Sheet</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Click &ldquo;View Response Sheet&rdquo; or &ldquo;Challenge Sheet&rdquo; to view your paper.
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200/80">
                    <span className="inline-block w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-center leading-5 text-[11px] mb-1.5">
                      3
                    </span>
                    <div className="font-medium text-slate-800">Copy &amp; Paste URL</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Copy the full address from your browser bar (containing <code>EncKey</code>) and paste here.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Unable to process sheet:</span>{" "}
                {error}
              </div>
            </div>
          )}
        </section>

        {/* Queue Progress Indicator */}
        {queueState && (
          <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center space-x-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="font-semibold text-sm text-slate-900">
                  Response Sheet Queued for Evaluation
                </span>
              </div>
              {queueState.queuePosition !== undefined && (
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-200">
                  Position #{queueState.queuePosition} in line
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-2">
              {queueState.message ||
                "Your URL has been saved securely. Processing submissions one by one to ensure zero errors..."}
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Automatic real-time polling active...</span>
              <span className="text-slate-400">Please keep this page open</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !queueState && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              Fetching response sections &amp; computing scores...
            </p>
            <p className="text-xs text-slate-500">
              Retrieving Reasoning, General Awareness, Quant, and English Comprehension.
            </p>
          </div>
        )}

        {/* Result Score Card */}
        {result && result.candidate && result.summary && (
          <div className="space-y-6">
            {/* Roll Number Duplication Notice */}
            {result.alreadySavedByRollNo && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {result.duplicateNotice ||
                      `This roll number (${result.candidate.rollNo}) is already saved. Displaying saved results.`}
                  </span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-md font-semibold shrink-0">
                  Already Saved
                </span>
              </div>
            )}

            {/* Candidate & Metadata Header */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-3">
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                      {result.candidate.name}
                    </h2>
                    <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                      Roll: {result.candidate.rollNo}
                    </span>
                    {result.alreadySavedByRollNo && (
                      <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-md border border-blue-200">
                        Saved Candidate
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {result.candidate.examLevel}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={copyShareLink}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Share Result</span>
                      </>
                    )}
                  </button>

                  {/* PDF Download Dropdown */}
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      onClick={() => setPdfMenuOpen(!pdfMenuOpen)}
                      className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                      <ChevronDown className="w-3 h-3 text-slate-300" />
                    </button>

                    {pdfMenuOpen && (
                      <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-1.5 animate-in fade-in duration-150">
                        <button
                          type="button"
                          onClick={() => {
                            setPdfMenuOpen(false);
                            downloadQuestionsPdf(result, "correct_only");
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-50 rounded-lg flex items-start gap-2.5 cursor-pointer transition-colors"
                        >
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-slate-900 text-xs">
                              Answers Only (Revision Sheet)
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Clean review sheet showing only the official correct answer for each question.
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPdfMenuOpen(false);
                            downloadQuestionsPdf(result, "all_options");
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-50 rounded-lg flex items-start gap-2.5 cursor-pointer transition-colors"
                        >
                          <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-slate-900 text-xs">
                              Complete Question Paper
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Full paper with all 4 options, candidate choices, and correct answer keys.
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Candidate Info Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Exam Date
                    </span>
                    <span className="font-medium text-slate-800">
                      {result.candidate.testDate || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Shift &amp; Time
                    </span>
                    <span className="font-medium text-slate-800">
                      {result.candidate.shift || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Test Centre
                    </span>
                    <span className="font-medium text-slate-800 truncate block">
                      {result.candidate.centre || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Grand Total Scoreboard */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Raw Marks
              </span>
              <div className="mt-1 flex items-baseline justify-center gap-2">
                <span className="text-4xl sm:text-5xl font-black text-slate-900 tabular-numbers">
                  {result.summary.totalMarks.toFixed(2)}
                </span>
                <span className="text-lg font-medium text-slate-400">
                  / {result.summary.maxMarks}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-500 text-xs mb-1">
                    <FileCheck2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Attempted</span>
                  </div>
                  <div className="font-bold text-base text-slate-900 tabular-numbers">
                    {result.summary.attempted}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      / {result.summary.totalQuestions}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-emerald-700 text-xs mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Correct (+2)</span>
                  </div>
                  <div className="font-bold text-base text-emerald-800 tabular-numbers">
                    {result.summary.correct}
                  </div>
                </div>

                <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-rose-700 text-xs mb-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Wrong (-0.5)</span>
                  </div>
                  <div className="font-bold text-base text-rose-800 tabular-numbers">
                    {result.summary.wrong}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-500 text-xs mb-1">
                    <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Left (0)</span>
                  </div>
                  <div className="font-bold text-base text-slate-700 tabular-numbers">
                    {result.summary.unattempted}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-3 bg-blue-50/70 rounded-xl border border-blue-200/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-700 text-xs mb-1">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    <span>Accuracy</span>
                  </div>
                  <div className="font-bold text-base text-blue-800 tabular-numbers">
                    {result.summary.accuracy}%
                  </div>
                </div>
              </div>
            </div>

            {/* Section-Wise Breakdown with Visual Progress Bars */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Section-Wise Performance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Detailed distribution across all 4 subjects
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 hidden sm:flex">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Correct
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Wrong
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Left
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {result.sections?.map((sec) => {
                  const total = sec.totalQuestions || 25;
                  const correctPct = (sec.correct / total) * 100;
                  const wrongPct = (sec.wrong / total) * 100;
                  const unattemptedPct = (sec.unattempted / total) * 100;

                  return (
                    <div
                      key={sec.id}
                      className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                        <div>
                          <span className="font-semibold text-slate-900 text-sm">
                            Part {sec.id}: {sec.name}
                          </span>
                          <span className="text-xs text-slate-400 ml-1.5">
                            ({sec.qRange})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-600">
                            <span className="text-emerald-700 font-semibold">{sec.correct}</span> correct &middot;{" "}
                            <span className="text-rose-700 font-semibold">{sec.wrong}</span> wrong &middot;{" "}
                            <span className="text-slate-500">{sec.unattempted}</span> left
                          </span>
                          <span className="font-bold text-sm text-slate-900 tabular-numbers">
                            {sec.sectionMarks.toFixed(2)}{" "}
                            <span className="text-xs font-normal text-slate-400">
                              / {sec.maxMarks}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Stacked Visual Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex">
                        <div
                          style={{ width: `${correctPct}%` }}
                          className="h-full bg-emerald-500"
                          title={`Correct: ${sec.correct} (${correctPct.toFixed(0)}%)`}
                        />
                        <div
                          style={{ width: `${wrongPct}%` }}
                          className="h-full bg-rose-500"
                          title={`Wrong: ${sec.wrong} (${wrongPct.toFixed(0)}%)`}
                        />
                        <div
                          style={{ width: `${unattemptedPct}%` }}
                          className="h-full bg-slate-300"
                          title={`Unattempted: ${sec.unattempted} (${unattemptedPct.toFixed(0)}%)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Question Review Section */}
            {result.questions && result.questions.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Question Paper Review
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showing {filteredQuestions?.length} of {result.summary.totalQuestions} questions
                    </p>
                  </div>

                  {/* Filter Pills and View Modes */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Status Filters */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setFilter("all")}
                        className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                          filter === "all"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All ({result.summary.totalQuestions})
                      </button>
                      <button
                        onClick={() => setFilter("wrong")}
                        className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                          filter === "wrong"
                            ? "bg-rose-600 text-white shadow-xs"
                            : "text-rose-700 hover:text-rose-900"
                        }`}
                      >
                        Wrong ({result.summary.wrong})
                      </button>
                      <button
                        onClick={() => setFilter("unattempted")}
                        className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                          filter === "unattempted"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Left ({result.summary.unattempted})
                      </button>
                      <button
                        onClick={() => setFilter("correct")}
                        className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                          filter === "correct"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-emerald-700 hover:text-emerald-900"
                        }`}
                      >
                        Correct ({result.summary.correct})
                      </button>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setViewMode("cards")}
                        className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                          viewMode === "cards"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        title="Detailed Cards View"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode("table")}
                        className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                          viewMode === "table"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                        title="Compact Table View"
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Detailed Cards View */}
                {viewMode === "cards" && (
                  <div className="space-y-4">
                    {filteredQuestions?.map((q) => {
                      let badge = null;
                      let cardBorder = "border-slate-200";

                      if (q.status === "correct") {
                        cardBorder = "border-emerald-200 bg-white";
                        badge = (
                          <span className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Correct (+2.00)</span>
                          </span>
                        );
                      } else if (q.status === "wrong") {
                        cardBorder = "border-rose-200 bg-white";
                        badge = (
                          <span className="bg-rose-50 text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Wrong (-0.50)</span>
                          </span>
                        );
                      } else {
                        badge = (
                          <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                            <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
                            <span>Left (0.00)</span>
                          </span>
                        );
                      }

                      return (
                        <div
                          key={q.qNum}
                          className={`rounded-xl border ${cardBorder} p-4 sm:p-5 shadow-xs`}
                        >
                          <div className="flex items-center justify-between text-xs mb-3 pb-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                Question {q.qNum}
                              </span>
                              <span className="text-slate-400 text-xs">
                                &middot; {q.sectionName}
                              </span>
                            </div>
                            <div>{badge}</div>
                          </div>

                          {/* Question Image */}
                          {q.questionImgUrl && (
                            <div className="mb-4 p-2 bg-slate-50/60 border border-slate-100 rounded-lg overflow-x-auto">
                              <img
                                src={q.questionImgUrl}
                                alt={`Question ${q.qNum}`}
                                className="max-h-64 object-contain rounded"
                                loading="lazy"
                              />
                            </div>
                          )}

                          {/* 4 Options Grid */}
                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                              {q.options.map((opt) => {
                                let badgeClass = "border-slate-200 bg-slate-50/50 text-slate-700";
                                if (opt.isCorrect && opt.isChosen) {
                                  badgeClass =
                                    "border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-400 text-emerald-950";
                                } else if (opt.isCorrect) {
                                  badgeClass =
                                    "border-emerald-300 bg-emerald-50/50 text-emerald-900";
                                } else if (opt.isChosen) {
                                  badgeClass =
                                    "border-rose-300 bg-rose-50/60 text-rose-900";
                                }

                                return (
                                  <div
                                    key={opt.optionNumber}
                                    className={`p-3 rounded-lg border text-xs flex flex-col justify-between transition-colors ${badgeClass}`}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="font-semibold text-slate-900">
                                        Option {opt.optionNumber}
                                      </span>
                                      <div className="flex gap-1 text-[11px] font-semibold">
                                        {opt.isChosen && (
                                          <span
                                            className={
                                              opt.isCorrect
                                                ? "text-emerald-700 font-bold"
                                                : "text-rose-700 font-bold"
                                            }
                                          >
                                            [Your Answer]
                                          </span>
                                        )}
                                        {opt.isCorrect && (
                                          <span className="text-emerald-700 font-bold">
                                            [Correct Answer]
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {opt.imgUrl && (
                                      <div className="bg-white p-1.5 border border-slate-200/60 rounded overflow-x-auto">
                                        <img
                                          src={opt.imgUrl}
                                          alt={`Option ${opt.optionNumber}`}
                                          className="max-h-24 object-contain"
                                          loading="lazy"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Compact Table View */}
                {viewMode === "table" && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="p-3 font-semibold">Q. No</th>
                          <th className="p-3 font-semibold">Section</th>
                          <th className="p-3 font-semibold text-center">Status</th>
                          <th className="p-3 font-semibold text-center">Your Choice</th>
                          <th className="p-3 font-semibold text-center">Correct Key</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredQuestions?.map((q) => (
                          <tr
                            key={q.qNum}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="p-3 font-bold text-slate-900">
                              Question {q.qNum}
                            </td>
                            <td className="p-3 text-slate-600">
                              Part {q.sectionId}: {q.sectionName}
                            </td>
                            <td className="p-3 text-center">
                              {q.status === "correct" && (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" /> Correct (+2)
                                </span>
                              )}
                              {q.status === "wrong" && (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                  <XCircle className="w-3 h-3" /> Wrong (-0.5)
                                </span>
                              )}
                              {q.status === "unattempted" && (
                                <span className="inline-flex items-center gap-1 text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                                  <MinusCircle className="w-3 h-3 text-slate-400" /> Left (0)
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center font-medium text-slate-700">
                              {q.chosenOption ? `Option ${q.chosenOption}` : "—"}
                            </td>
                            <td className="p-3 text-center font-bold text-emerald-700">
                              {q.correctOption ? `Option ${q.correctOption}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Examinations List & Statistics */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Examinations &amp; Live Statistics
                </h2>
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200/60">
                  Live Benchmarks
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any examination below to view student submissions, average scores, and shift breakdown.
              </p>
            </div>
            {loadingExams && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Updating stats...</span>
              </div>
            )}
          </div>

          {/* Examinations List */}
          {examinations.length === 0 && !loadingExams ? (
            <div className="text-center py-6 text-xs text-slate-500">
              No examinations recorded yet. Paste your answer key above to start evaluating.
            </div>
          ) : (
            <div className="space-y-3">
              {examinations.map((exam) => {
                const isExpanded = selectedExamId === exam.id;
                const details = examDetails[exam.id] || exam;
                const isLoadingThis = loadingExamId === exam.id;

                return (
                  <div
                    key={exam.id}
                    className={`rounded-xl border transition-all ${
                      isExpanded
                        ? "border-blue-200 bg-blue-50/20 shadow-xs ring-1 ring-blue-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectExam(exam.id)}
                      className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                          <Award className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base leading-snug">
                            {exam.name}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Official Staff Selection Commission examination evaluation
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center flex-wrap gap-2.5 self-start sm:self-center">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>{exam.studentCount} Students</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Avg: {exam.avgScore > 0 ? exam.avgScore.toFixed(2) : "N/A"}</span>
                        </span>
                        <span className="text-slate-400 p-1">
                          {isLoadingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          ) : isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Expanded Details Panel */}
                    {isExpanded && (
                      <div className="px-4 pb-5 pt-1 sm:px-5 border-t border-slate-200/60 mt-1 animate-in fade-in duration-200 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                            <div className="flex items-center justify-center gap-1.5 text-slate-500 text-xs mb-1">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>Total Candidates</span>
                            </div>
                            <div className="font-bold text-lg text-slate-900 tabular-numbers">
                              {details.studentCount}
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                            <div className="flex items-center justify-center gap-1.5 text-blue-700 text-xs mb-1">
                              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Overall Average Score</span>
                            </div>
                            <div className="font-bold text-lg text-blue-900 tabular-numbers">
                              {details.avgScore > 0 ? details.avgScore.toFixed(2) : "0.00"}{" "}
                              <span className="text-xs text-slate-400 font-normal">/ 200</span>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                            <div className="flex items-center justify-center gap-1.5 text-emerald-700 text-xs mb-1">
                              <Award className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Highest Recorded Score</span>
                            </div>
                            <div className="font-bold text-lg text-emerald-800 tabular-numbers">
                              {details.maxScore > 0 ? details.maxScore.toFixed(2) : "0.00"}{" "}
                              <span className="text-xs text-slate-400 font-normal">/ 200</span>
                            </div>
                          </div>
                        </div>

                        {/* Shift-Wise Breakdown */}
                        {details.shifts && details.shifts.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-1">
                              Shift-Wise Candidate Counts &amp; Average Scores
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                    <th className="p-2.5 font-semibold">Test Date</th>
                                    <th className="p-2.5 font-semibold">Shift Timing</th>
                                    <th className="p-2.5 font-semibold text-center">Candidates</th>
                                    <th className="p-2.5 font-semibold text-right">Shift Average</th>
                                    <th className="p-2.5 font-semibold text-right">Highest</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {details.shifts.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="p-2.5 font-medium text-slate-800">
                                        {s.testDate}
                                      </td>
                                      <td className="p-2.5 text-slate-600">{s.shiftTime}</td>
                                      <td className="p-2.5 text-center font-semibold text-slate-900 tabular-numbers">
                                        {s.studentCount}
                                      </td>
                                      <td className="p-2.5 text-right font-bold text-blue-700 tabular-numbers">
                                        {s.avgScore.toFixed(2)}
                                      </td>
                                      <td className="p-2.5 text-right font-semibold text-slate-800 tabular-numbers">
                                        {s.maxScore.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic p-2 text-center">
                            No shift submissions recorded for this examination yet.
                          </div>
                        )}

                        {/* Quick CTA to scroll up to calculate */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Calculate your score for this exam</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Modern Clean Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-500 space-y-2">
          <div className="flex justify-center items-center space-x-3 text-slate-600">
            <a
              href="https://github.com/blackpirateapps/ssc-answer-key-parser"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-900 flex items-center gap-1 transition-colors"
            >
              <GithubIcon className="w-3.5 h-3.5" />
              <span>GitHub Repository</span>
            </a>
            <span>&middot;</span>
            <span>Serverless Vercel Architecture</span>
            <span>&middot;</span>
            <span>Accurate Raw Marks</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Not officially affiliated with Staff Selection Commission. Evaluated directly from cbexams candidate response sheets.
          </p>
        </div>
      </footer>
    </div>
  );
}
