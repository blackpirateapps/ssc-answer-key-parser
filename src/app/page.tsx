"use client";

import { useEffect, useState } from "react";
import { ScoreCardResponse, QuestionStatus } from "@/types";

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

  const handleCalculate = async (inputUrl?: string) => {
    const targetUrl = (inputUrl || url).trim();
    if (!targetUrl) {
      setError("Please paste your cbexams answer key URL.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse answer key.");
      }

      setResult(data);

      // Update browser URL query string without reloading
      if (typeof window !== "undefined") {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("url", targetUrl);
        window.history.replaceState({}, "", newUrl.toString());
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching the answer key.");
    } finally {
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
            Paste the response sheet URL from <code>sscexams.cbexams.com</code>. Designed to handle high-traffic spikes via serverless caching.
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

        {/* Loading Spinner / State */}
        {loading && (
          <div className="text-center py-10 text-xs text-gray-600 font-mono">
            Fetching Part A, B, C, D in parallel &middot; Parsing answers &amp; question images...
          </div>
        )}

        {/* Result Score Card */}
        {result && result.candidate && result.summary && (
          <div className="space-y-4">
            {/* Candidate & Metadata Header */}
            <div className="bg-white border border-[#e2e2d5] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between border-b border-gray-200 pb-2 mb-2 gap-2">
                <div>
                  <span className="font-bold text-sm text-black">
                    {result.candidate.name}
                  </span>{" "}
                  <span className="text-gray-500">
                    (Roll: {result.candidate.rollNo})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {result.cached && (
                    <span className="bg-green-100 text-green-800 text-[10px] font-mono px-1.5 py-0.5 border border-green-300">
                      ⚡ CACHED RESULT
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
                Total Raw Marks
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
                    {result.summary.attempted} / 100
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

            {/* Question-By-Question Detailed Breakdown */}
            <div className="bg-white border border-[#e2e2d5] p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-200">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Question Review ({filteredQuestions?.length || 0} Questions)
                </h2>

                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex items-center text-xs border border-gray-300 rounded-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setViewMode("cards")}
                      className={`px-2 py-0.5 cursor-pointer ${
                        viewMode === "cards"
                          ? "bg-black text-white font-bold"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Cards (Questions &amp; Options)
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`px-2 py-0.5 cursor-pointer ${
                        viewMode === "table"
                          ? "bg-black text-white font-bold"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Compact Table
                    </button>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex flex-wrap gap-1 text-xs">
                    <button
                      onClick={() => setFilter("all")}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        filter === "all"
                          ? "bg-[#ff6600] text-black font-bold border-[#d85800]"
                          : "bg-[#f0f0eb] text-gray-700 border-gray-300"
                      }`}
                    >
                      All (100)
                    </button>
                    <button
                      onClick={() => setFilter("wrong")}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        filter === "wrong"
                          ? "bg-red-600 text-white font-bold border-red-800"
                          : "bg-[#fff0f0] text-red-700 border-red-300"
                      }`}
                    >
                      Wrong ({result.summary.wrong})
                    </button>
                    <button
                      onClick={() => setFilter("unattempted")}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        filter === "unattempted"
                          ? "bg-gray-700 text-white font-bold border-gray-900"
                          : "bg-[#f5f5f5] text-gray-700 border-gray-300"
                      }`}
                    >
                      Left ({result.summary.unattempted})
                    </button>
                    <button
                      onClick={() => setFilter("correct")}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        filter === "correct"
                          ? "bg-green-700 text-white font-bold border-green-900"
                          : "bg-[#f0fff0] text-green-700 border-green-300"
                      }`}
                    >
                      Correct ({result.summary.correct})
                    </button>
                  </div>
                </div>
              </div>

              {/* View 1: Detailed Cards View (Showing Question Image & 4 Options) */}
              {viewMode === "cards" && (
                <div className="space-y-4">
                  {filteredQuestions?.map((q) => (
                    <article
                      key={q.qNum}
                      className="border border-gray-300 p-3 bg-white shadow-2xs"
                    >
                      {/* Card Header */}
                      <div className="flex flex-wrap items-center justify-between pb-2 mb-2 border-b border-gray-200 gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs bg-black text-white px-2 py-0.5 font-mono">
                            Q.{q.qNum}
                          </span>
                          <span className="text-xs text-gray-600 font-sans">
                            Part {q.sectionId}: {q.sectionName}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {q.status === "correct" && (
                            <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 border border-green-300 font-mono">
                              ✓ Correct (+2.00)
                            </span>
                          )}
                          {q.status === "wrong" && (
                            <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 border border-red-300 font-mono">
                              ✗ Wrong (-0.50)
                            </span>
                          )}
                          {q.status === "unattempted" && (
                            <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 border border-gray-300 font-mono">
                              — Not Answered (0.00)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Summary Banner */}
                      <div className="text-xs font-mono mb-3 p-1.5 bg-[#fbfbf8] border border-gray-200 flex flex-wrap justify-between gap-1">
                        <span>
                          <span className="text-gray-500">Your Selection:</span>{" "}
                          <strong
                            className={
                              q.status === "wrong"
                                ? "text-red-700 font-bold"
                                : q.status === "correct"
                                ? "text-green-700 font-bold"
                                : "text-gray-600"
                            }
                          >
                            {q.chosenOption
                              ? `Option ${q.chosenOption}`
                              : "None (Left Unattempted)"}
                          </strong>
                        </span>
                        <span>
                          <span className="text-gray-500">Official Correct Answer:</span>{" "}
                          <strong className="text-emerald-800 font-bold">
                            {q.correctOption ? `Option ${q.correctOption}` : "N/A"}
                          </strong>
                        </span>
                      </div>

                      {/* Question Image */}
                      {q.questionImgUrl && (
                        <div className="mb-3 bg-[#fafafa] p-2 border border-gray-200">
                          <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">
                            Question:
                          </div>
                          <img
                            src={q.questionImgUrl}
                            alt={`Question ${q.qNum}`}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="max-w-full h-auto"
                          />
                        </div>
                      )}

                      {/* Options Grid (4 Options) */}
                      {q.options && q.options.length > 0 && (
                        <div>
                          <div className="text-[10px] text-gray-500 font-mono uppercase mb-1.5">
                            Options:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt) => {
                              let cardStyle = "border-gray-200 bg-white";
                              let badge = null;

                              if (opt.isChosen && opt.isCorrect) {
                                cardStyle =
                                  "border-2 border-green-600 bg-green-50/50";
                                badge = (
                                  <span className="bg-green-700 text-white text-[10px] font-bold px-1.5 py-0.5">
                                    ✓ Your Choice &amp; Correct
                                  </span>
                                );
                              } else if (opt.isChosen && !opt.isCorrect) {
                                cardStyle =
                                  "border-2 border-red-500 bg-red-50/50";
                                badge = (
                                  <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                                    ✗ Your Choice (Wrong)
                                  </span>
                                );
                              } else if (!opt.isChosen && opt.isCorrect) {
                                cardStyle =
                                  "border-2 border-emerald-600 bg-emerald-50/40";
                                badge = (
                                  <span className="bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.5">
                                    ✓ Correct Answer
                                  </span>
                                );
                              }

                              return (
                                <div
                                  key={opt.optionNumber}
                                  className={`p-2 border flex flex-col justify-between ${cardStyle}`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-mono font-bold text-gray-700">
                                      Option {opt.optionNumber}
                                    </span>
                                    {badge}
                                  </div>
                                  {opt.imgUrl && (
                                    <div className="mt-1">
                                      <img
                                        src={opt.imgUrl}
                                        alt={`Option ${opt.optionNumber}`}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        className="max-w-full h-auto"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {/* View 2: Compact Table View */}
              {viewMode === "table" && (
                <div className="max-h-96 overflow-y-auto border border-gray-200">
                  <table className="w-full text-xs text-left border-collapse font-mono">
                    <thead className="sticky top-0 bg-[#f0f0eb] border-b border-gray-300">
                      <tr>
                        <th className="p-1.5 w-16">Q.No</th>
                        <th className="p-1.5 w-32 hidden sm:table-cell">Section</th>
                        <th className="p-1.5 w-24">Status</th>
                        <th className="p-1.5 text-center">Your Choice</th>
                        <th className="p-1.5 text-center">Correct Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQuestions?.map((q) => (
                        <tr
                          key={q.qNum}
                          className={`border-b border-gray-100 ${
                            q.status === "wrong"
                              ? "bg-[#fffafa]"
                              : q.status === "correct"
                              ? "bg-[#fafdfa]"
                              : "bg-[#fafafa]"
                          }`}
                        >
                          <td className="p-1.5 font-bold">#{q.qNum}</td>
                          <td className="p-1.5 text-gray-500 hidden sm:table-cell text-[11px]">
                            Part {q.sectionId}
                          </td>
                          <td className="p-1.5">
                            {q.status === "correct" && (
                              <span className="text-green-700 font-bold">
                                ✓ Correct
                              </span>
                            )}
                            {q.status === "wrong" && (
                              <span className="text-red-600 font-bold">
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
