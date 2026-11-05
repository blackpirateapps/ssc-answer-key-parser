"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreCardResponse, QuestionStatus, RawSectionReport } from "@/types";
import { calculateClientScores } from "@/lib/scoring";

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
  const [queueState, setQueueState] = useState<{
    status: string;
    queuePosition?: number;
    message?: string;
    encKey?: string;
  } | null>(null);

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
            "URL saved! Processing answer keys one by one...",
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
    <div className="min-h-screen bg-[#f6f6ef] text-[#222222] font-sans flex flex-col justify-between">
      {/* Top Hacker News Style Bar */}
      <header className="bg-[#ff6600] px-3 py-1.5 flex items-center justify-between border-b border-[#d85800]">
        <div className="flex items-center space-x-2">
          <span className="bg-white text-[#ff6600] font-bold text-xs px-1.5 py-0.5 border border-black font-mono">
            Y
          </span>
          <span className="font-bold text-sm tracking-tight text-black">
            SSC CGL Score Calculator
          </span>
          <span className="hidden sm:inline text-xs text-black/75">
            | minimal &middot; high-concurrency &middot; instant
          </span>
        </div>
        <div className="text-xs text-black flex items-center space-x-3">
          <a
            href="https://github.com/blackpirateapps/ssc-answer-key-parser"
            target="_blank"
            rel="noreferrer"
            className="hover:underline font-mono"
          >
            github
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl w-full mx-auto p-3 sm:p-4 flex-grow">
        {/* Input Card */}
        <section className="bg-white border border-[#e2e2d5] p-3 sm:p-4 mb-4 shadow-xs">
          <h1 className="text-base font-bold mb-1">Enter Answer Key URL</h1>
          <p className="text-xs text-gray-600 mb-3">
            Paste the response sheet URL from <code>sscexams.cbexams.com</code>. Designed to absorb 10k-100k spikes with PostgreSQL queueing.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCalculate();
            }}
            className="space-y-2"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sscexams.cbexams.com/CGLE.../ViewCandResponse.aspx?EncKey=..."
                required
                className="flex-grow px-2.5 py-1.5 text-xs sm:text-sm border border-gray-400 bg-[#fafaf7] focus:bg-white focus:outline-hidden focus:border-[#ff6600] font-mono"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-[#ff6600] text-black font-semibold px-4 py-1.5 text-xs sm:text-sm hover:bg-[#e65c00] active:bg-[#cc5200] disabled:opacity-50 cursor-pointer border border-[#d85800]"
              >
                {loading ? "Calculating..." : "Calculate Score"}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setUrl(DEMO_URL);
                  handleCalculate(DEMO_URL);
                }}
                className="text-[#828282] hover:text-black underline cursor-pointer"
              >
                Load sample answer key URL
              </button>
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl("");
                    setResult(null);
                    setError(null);
                    setQueueState(null);
                  }}
                  className="text-gray-500 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-2 bg-[#ffebee] border border-[#ffcdd2] text-[#c62828] text-xs">
              <strong>Error:</strong> {error}
            </div>
          )}
        </section>

        {/* Queue Progress Indicator */}
        {queueState && (
          <div className="bg-[#fffdf2] border border-[#ffe082] p-3 text-xs font-mono mb-4 text-[#856404]">
            <div className="flex items-center justify-between border-b border-[#ffe082]/60 pb-1.5 mb-2">
              <div className="flex items-center space-x-2 font-bold">
                <span className="text-sm">⏳</span>
                <span>ANSWER KEY SAVED &amp; QUEUED</span>
              </div>
              {queueState.queuePosition !== undefined && (
                <span className="bg-[#ffe082] text-black text-[10px] font-bold px-2 py-0.5">
                  Position #{queueState.queuePosition} in line
                </span>
              )}
            </div>
            <p className="text-xs text-gray-700 mb-1">
              {queueState.message ||
                "Your URL has been saved in Postgres. Processing responses one by one..."}
            </p>
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
              <span>Automatic real-time polling active...</span>
              <span className="text-[10px] text-gray-400">Do not refresh</span>
            </div>
          </div>
        )}

        {/* Loading Spinner / State */}
        {loading && !queueState && (
          <div className="text-center py-10 text-xs text-gray-600 font-mono">
            Fetching Part A, B, C, D in parallel &middot; Parsing answers &amp; question images...
          </div>
        )}

        {/* Result Score Card */}
        {result && result.candidate && result.summary && (
          <div className="space-y-4">
            {/* Roll Number Duplication Notice */}
            {result.alreadySavedByRollNo && (
              <div className="bg-[#e8f4fd] border border-[#b6d4fe] p-3 text-xs font-mono text-[#084298] flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm">ℹ️</span>
                  <span>
                    {result.duplicateNotice ||
                      `This roll number (${result.candidate.rollNo}) is already saved, showing saved results.`}
                  </span>
                </div>
                <span className="bg-[#cfe2ff] text-[#084298] text-[10px] px-2 py-0.5 border border-[#b6d4fe] font-bold">
                  DUPLICATE ROLL NO
                </span>
              </div>
            )}

            {/* Candidate & Metadata Header */}
            <div className="bg-white border border-[#e2e2d5] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between border-b border-gray-200 pb-2 mb-2 gap-2">
                <div className="flex items-center flex-wrap gap-1">
                  <span className="font-bold text-sm text-black">
                    {result.candidate.name}
                  </span>
                  <span className="text-gray-500">
                    (Roll: {result.candidate.rollNo})
                  </span>
                  {result.alreadySavedByRollNo && (
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-mono px-1.5 py-0.5 border border-blue-300 ml-1">
                      Already Saved
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#f0f0eb] text-gray-700 text-[10px] font-mono px-1.5 py-0.5 border border-gray-300">
                    Browser Calculated
                  </span>
                  {result.cached && (
                    <span className="bg-green-100 text-green-800 text-[10px] font-mono px-1.5 py-0.5 border border-green-300">
                      ⚡ CACHED
                    </span>
                  )}
                  <button
                    onClick={copyShareLink}
                    className="text-xs bg-[#f0f0eb] border border-gray-300 hover:bg-gray-200 px-2 py-0.5 cursor-pointer"
                  >
                    {copied ? "Link Copied!" : "Share Link"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-gray-700">
                <div>
                  <span className="text-gray-500">Exam:</span>{" "}
                  {result.candidate.examLevel}
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>{" "}
                  {result.candidate.testDate}
                </div>
                <div>
                  <span className="text-gray-500">Shift:</span>{" "}
                  {result.candidate.shift}
                </div>
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="text-gray-500">Centre:</span>{" "}
                  {result.candidate.centre}
                </div>
              </div>
            </div>

            {/* Grand Total Scoreboard */}
            <div className="bg-white border border-[#e2e2d5] p-4 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Total Raw Marks (Calculated in Browser)
              </div>
              <div className="text-4xl font-extrabold font-mono text-black">
                {result.summary.totalMarks.toFixed(2)}{" "}
                <span className="text-base font-normal text-gray-500">
                  / {result.summary.maxMarks}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-gray-200 text-xs font-mono">
                <div className="p-1.5 bg-[#fbfbf8] border border-gray-200">
                  <div className="text-gray-500">Attempted</div>
                  <div className="font-bold text-sm text-black">
                    {result.summary.attempted} / {result.summary.totalQuestions}
                  </div>
                </div>
                <div className="p-1.5 bg-[#f0fff0] border border-green-200">
                  <div className="text-green-700">Correct (+2)</div>
                  <div className="font-bold text-sm text-green-800">
                    {result.summary.correct}
                  </div>
                </div>
                <div className="p-1.5 bg-[#fff0f0] border border-red-200">
                  <div className="text-red-700">Wrong (-0.5)</div>
                  <div className="font-bold text-sm text-red-800">
                    {result.summary.wrong}
                  </div>
                </div>
                <div className="p-1.5 bg-[#f5f5f5] border border-gray-200">
                  <div className="text-gray-600">Left (0)</div>
                  <div className="font-bold text-sm text-gray-700">
                    {result.summary.unattempted}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 p-1.5 bg-[#fdfaf0] border border-amber-200">
                  <div className="text-amber-800">Accuracy</div>
                  <div className="font-bold text-sm text-amber-900">
                    {result.summary.accuracy}%
                  </div>
                </div>
              </div>
            </div>

            {/* Section-Wise Breakdown Table */}
            <div className="bg-white border border-[#e2e2d5] p-3 sm:p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Section-Wise Breakdown
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead>
                    <tr className="bg-[#f0f0eb] border-b border-gray-300 text-gray-700">
                      <th className="p-2 font-semibold">Section</th>
                      <th className="p-2 font-semibold text-center">Attempted</th>
                      <th className="p-2 font-semibold text-center text-green-700">Correct</th>
                      <th className="p-2 font-semibold text-center text-red-700">Wrong</th>
                      <th className="p-2 font-semibold text-center text-gray-600">Left</th>
                      <th className="p-2 font-semibold text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sections?.map((sec) => (
                      <tr
                        key={sec.id}
                        className="border-b border-gray-200 hover:bg-[#fafaf7]"
                      >
                        <td className="p-2">
                          <span className="font-bold text-black font-sans">
                            Part {sec.id}: {sec.name}
                          </span>
                          <span className="block text-[10px] text-gray-500 font-mono">
                            {sec.qRange}
                          </span>
                        </td>
                        <td className="p-2 text-center">{sec.attempted}</td>
                        <td className="p-2 text-center text-green-700 font-bold">
                          {sec.correct}
                        </td>
                        <td className="p-2 text-center text-red-700 font-bold">
                          {sec.wrong}
                        </td>
                        <td className="p-2 text-center text-gray-500">
                          {sec.unattempted}
                        </td>
                        <td className="p-2 text-right font-bold text-sm text-black">
                          {sec.sectionMarks.toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-gray-400">
                            / {sec.maxMarks}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Question Review Section */}
            {result.questions && result.questions.length > 0 && (
              <div className="bg-white border border-[#e2e2d5] p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-gray-200 gap-2">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Question Review
                    </h2>
                    <span className="text-xs text-gray-400 font-mono">
                      ({filteredQuestions?.length} shown)
                    </span>
                  </div>

                  {/* Filters & View Toggle */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="inline-flex border border-gray-300">
                      <button
                        onClick={() => setFilter("all")}
                        className={`px-2 py-1 font-mono cursor-pointer ${
                          filter === "all"
                            ? "bg-[#ff6600] text-black font-bold"
                            : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        All ({result.summary.totalQuestions})
                      </button>
                      <button
                        onClick={() => setFilter("wrong")}
                        className={`px-2 py-1 font-mono cursor-pointer border-l border-gray-300 ${
                          filter === "wrong"
                            ? "bg-[#ff6600] text-black font-bold"
                            : "bg-white text-red-700 hover:bg-red-50"
                        }`}
                      >
                        Wrong ({result.summary.wrong})
                      </button>
                      <button
                        onClick={() => setFilter("unattempted")}
                        className={`px-2 py-1 font-mono cursor-pointer border-l border-gray-300 ${
                          filter === "unattempted"
                            ? "bg-[#ff6600] text-black font-bold"
                            : "bg-white text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        Left ({result.summary.unattempted})
                      </button>
                      <button
                        onClick={() => setFilter("correct")}
                        className={`px-2 py-1 font-mono cursor-pointer border-l border-gray-300 ${
                          filter === "correct"
                            ? "bg-[#ff6600] text-black font-bold"
                            : "bg-white text-green-700 hover:bg-green-50"
                        }`}
                      >
                        Correct ({result.summary.correct})
                      </button>
                    </div>

                    <div className="inline-flex border border-gray-300">
                      <button
                        onClick={() => setViewMode("cards")}
                        className={`px-2 py-1 font-mono cursor-pointer ${
                          viewMode === "cards"
                            ? "bg-black text-white font-bold"
                            : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        Cards
                      </button>
                      <button
                        onClick={() => setViewMode("table")}
                        className={`px-2 py-1 font-mono cursor-pointer border-l border-gray-300 ${
                          viewMode === "table"
                            ? "bg-black text-white font-bold"
                            : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        Compact
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cards View */}
                {viewMode === "cards" && (
                  <div className="space-y-4">
                    {filteredQuestions?.map((q) => {
                      const statusBorder =
                        q.status === "correct"
                          ? "border-l-4 border-l-green-500"
                          : q.status === "wrong"
                          ? "border-l-4 border-l-red-500"
                          : "border-l-4 border-l-gray-400";

                      return (
                        <div
                          key={q.qNum}
                          className={`border border-gray-200 p-3 bg-[#fafaf7] ${statusBorder}`}
                        >
                          <div className="flex items-center justify-between text-xs mb-2 pb-1.5 border-b border-gray-200">
                            <div>
                              <span className="font-bold font-mono">
                                Q.{q.qNum}
                              </span>{" "}
                              <span className="text-gray-500 text-[11px]">
                                ({q.sectionName})
                              </span>
                            </div>
                            <div>
                              {q.status === "correct" && (
                                <span className="bg-green-100 text-green-800 text-[10px] font-mono font-bold px-1.5 py-0.5 border border-green-300">
                                  ✓ CORRECT (+2.00)
                                </span>
                              )}
                              {q.status === "wrong" && (
                                <span className="bg-red-100 text-red-800 text-[10px] font-mono font-bold px-1.5 py-0.5 border border-red-300">
                                  ✗ WRONG (-0.50)
                                </span>
                              )}
                              {q.status === "unattempted" && (
                                <span className="bg-gray-200 text-gray-700 text-[10px] font-mono px-1.5 py-0.5 border border-gray-300">
                                  — UNATTEMPTED (0.00)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Question Image */}
                          {q.questionImgUrl && (
                            <div className="mb-3 p-1 bg-white border border-gray-200 overflow-x-auto">
                              <img
                                src={q.questionImgUrl}
                                alt={`Question ${q.qNum}`}
                                className="max-h-64 object-contain"
                                loading="lazy"
                              />
                            </div>
                          )}

                          {/* 4 Options Grid */}
                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                              {q.options.map((opt) => {
                                let badgeClass =
                                  "border-gray-200 bg-white text-gray-800";
                                if (opt.isCorrect && opt.isChosen) {
                                  badgeClass =
                                    "border-green-500 bg-green-50 ring-1 ring-green-500 text-green-900";
                                } else if (opt.isCorrect) {
                                  badgeClass =
                                    "border-amber-400 bg-amber-50/60 ring-1 ring-amber-400 text-amber-900";
                                } else if (opt.isChosen) {
                                  badgeClass =
                                    "border-red-400 bg-red-50 ring-1 ring-red-400 text-red-900";
                                }

                                return (
                                  <div
                                    key={opt.optionNumber}
                                    className={`p-2 border text-xs flex flex-col justify-between ${badgeClass}`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold font-mono text-[11px]">
                                        Option {opt.optionNumber}
                                      </span>
                                      <div className="flex gap-1 text-[10px] font-mono font-bold">
                                        {opt.isChosen && (
                                          <span
                                            className={
                                              opt.isCorrect
                                                ? "text-green-700"
                                                : "text-red-700"
                                            }
                                          >
                                            [You chose]
                                          </span>
                                        )}
                                        {opt.isCorrect && (
                                          <span className="text-emerald-700">
                                            [Correct Ans]
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {opt.imgUrl && (
                                      <div className="bg-white p-1 border border-gray-100 overflow-x-auto">
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse font-mono">
                      <thead>
                        <tr className="bg-[#f0f0eb] border-b border-gray-300 text-gray-700">
                          <th className="p-1.5">Q.#</th>
                          <th className="p-1.5">Section</th>
                          <th className="p-1.5 text-center">Status</th>
                          <th className="p-1.5 text-center">Chosen</th>
                          <th className="p-1.5 text-center">Correct</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuestions?.map((q) => (
                          <tr
                            key={q.qNum}
                            className="border-b border-gray-200 hover:bg-[#fafaf7]"
                          >
                            <td className="p-1.5 font-bold">Q.{q.qNum}</td>
                            <td className="p-1.5 text-gray-600">
                              Part {q.sectionId}
                            </td>
                            <td className="p-1.5 text-center font-bold">
                              {q.status === "correct" && (
                                <span className="text-green-700">
                                  ✓ Correct
                                </span>
                              )}
                              {q.status === "wrong" && (
                                <span className="text-red-700">
                                  ✗ Wrong
                                </span>
                              )}
                              {q.status === "unattempted" && (
                                <span className="text-gray-500">
                                  — Left
                                </span>
                              )}
                            </td>
                            <td className="p-1.5 text-center">
                              {q.chosenOption ? `Option ${q.chosenOption}` : "—"}
                            </td>
                            <td className="p-1.5 text-center font-bold text-gray-800">
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
      </main>

      {/* Classic Hacker News Minimal Footer */}
      <footer className="border-t border-[#d85800] bg-[#f6f6ef] py-3 text-center text-xs text-gray-600 space-y-1">
        <div className="flex justify-center space-x-2 text-gray-500">
          <a
            href="https://github.com/blackpirateapps/ssc-answer-key-parser"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            GitHub
          </a>
          <span>|</span>
          <a
            href="https://news.ycombinator.com"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Hacker News Style
          </a>
          <span>|</span>
          <span>Fast Vercel Serverless Parser</span>
        </div>
        <p className="text-[11px] text-gray-500">
          Not officially affiliated with Staff Selection Commission. Data parsed directly from cbexams response sheet.
        </p>
      </footer>
    </div>
  );
}
