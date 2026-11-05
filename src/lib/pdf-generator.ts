import { ScoreCardResponse } from "@/types";

export type PdfMode = "correct_only" | "all_options";

/**
 * Generates an A4 print-optimized document and triggers the browser's
 * native "Save as PDF" print dialog. Handles cross-origin cbexams images
 * smoothly without canvas tainting.
 */
export function downloadQuestionsPdf(
  result: ScoreCardResponse,
  mode: PdfMode = "all_options"
) {
  if (!result || !result.questions || result.questions.length === 0) {
    alert("No question data available to generate PDF.");
    return;
  }

  const candidate = result.candidate;
  const summary = result.summary;
  const sections = result.sections || [];
  const questions = result.questions;

  const modeTitle =
    mode === "correct_only"
      ? "Answer Key (Correct Answers Only)"
      : "Full Question Paper (All Options & Answers)";

  const title = `${candidate?.name || "Candidate"} - ${
    candidate?.rollNo || "Roll"
  } - SSC CGL ${modeTitle}`;

  // Group questions by section
  const sectionGroups: Record<string, typeof questions> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };

  questions.forEach((q) => {
    if (sectionGroups[q.sectionId]) {
      sectionGroups[q.sectionId].push(q);
    } else {
      sectionGroups[q.sectionId] = [q];
    }
  });

  const sectionNames: Record<string, string> = {
    A: "General Intelligence & Reasoning",
    B: "General Awareness",
    C: "Quantitative Aptitude",
    D: "English Comprehension",
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      font-size: 12px;
      line-height: 1.45;
      padding: 16px;
      font-variant-numeric: tabular-nums;
    }
    
    /* Sticky Screen Action Bar (Hidden in Print) */
    .screen-action-bar {
      position: sticky;
      top: 0;
      z-index: 9999;
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 18px;
      margin: -16px -16px 16px -16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid #334155;
    }
    .action-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 7px 16px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .action-btn:hover {
      background: #1d4ed8;
    }
    .action-close-btn {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #475569;
      padding: 6px 12px;
      font-size: 11px;
      border-radius: 6px;
      cursor: pointer;
    }
    .action-close-btn:hover {
      background: #334155;
      color: #fff;
    }

    /* Print Header & Candidate Info */
    .exam-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .exam-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
    }
    .exam-subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }
    
    .meta-table, .score-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .meta-table td, .score-table th, .score-table td {
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
    }
    .score-table th {
      background: #f1f5f9;
      font-weight: 600;
      text-align: left;
      color: #475569;
    }

    /* Score Grand Box */
    .summary-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-around;
      text-align: center;
      font-size: 11px;
    }
    .summary-item .num {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }

    /* Section Divider */
    .section-banner {
      background: #f1f5f9;
      border-left: 4px solid #2563eb;
      padding: 6px 12px;
      font-weight: 700;
      font-size: 12px;
      color: #0f172a;
      margin: 16px 0 10px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Question Cards */
    .question-card {
      border: 1px solid #e2e8f0;
      background: #ffffff;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .question-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 5px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .status-badge {
      font-weight: 600;
      padding: 2px 8px;
      font-size: 10px;
      border-radius: 4px;
      border: 1px solid transparent;
    }
    .status-correct {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }
    .status-wrong {
      background: #fff1f2;
      color: #9f1239;
      border-color: #fecdd3;
    }
    .status-left {
      background: #f1f5f9;
      color: #475569;
      border-color: #e2e8f0;
    }

    .q-img-wrap {
      margin: 6px 0;
      text-align: left;
    }
    .q-img-wrap img {
      max-width: 100%;
      height: auto;
      max-height: 180px;
      display: inline-block;
    }

    /* Mode: Correct Only Box */
    .correct-only-box {
      background: #ecfdf5;
      border: 1.5px solid #10b981;
      border-radius: 6px;
      padding: 8px 12px;
      margin-top: 6px;
    }
    .correct-only-label {
      font-weight: 600;
      color: #065f46;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .correct-only-box img {
      max-height: 70px;
      max-width: 100%;
      display: inline-block;
    }

    /* Mode: All Options Grid */
    .options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 6px;
    }
    @media (max-width: 600px) {
      .options-grid {
        grid-template-columns: 1fr;
      }
    }
    .opt-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      background: #f8fafc;
      font-size: 10.5px;
    }
    .opt-box.opt-correct {
      border: 1.5px solid #10b981;
      background: #ecfdf5;
    }
    .opt-box.opt-chosen-wrong {
      border: 1.5px solid #f43f5e;
      background: #fff1f2;
    }
    .opt-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 10px;
    }
    .opt-box img {
      max-height: 60px;
      max-width: 100%;
      display: inline-block;
    }

    /* Print Media Rules */
    @media print {
      body {
        padding: 0;
        background: #ffffff;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .screen-action-bar {
        display: none !important;
      }
      @page {
        margin: 10mm 12mm;
        size: A4 portrait;
      }
      .question-card {
        page-break-inside: avoid;
        break-inside: avoid;
        border: 1px solid #cbd5e1;
      }
      .section-banner {
        page-break-before: auto;
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- Action Bar on Screen -->
  <div class="screen-action-bar">
    <div style="display: flex; align-items: center; gap: 10px;">
      <button class="action-btn" onclick="window.print()">Print / Save as PDF</button>
      <span style="font-size: 11px; color: #94a3b8;">${modeTitle}</span>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <span id="loading-status" style="font-size: 11px; color: #cbd5e1;">Loading images...</span>
      <button class="action-close-btn" onclick="window.close()">Close</button>
    </div>
  </div>

  <!-- Exam Header -->
  <header class="exam-header">
    <div class="exam-title">Staff Selection Commission (SSC)</div>
    <div class="exam-subtitle">${candidate?.examLevel || "Combined Graduate Level Examination"} &middot; Official Response Sheet Evaluation</div>
  </header>

  <!-- Candidate Details Table -->
  <table class="meta-table">
    <tr>
      <td><strong>Candidate Name:</strong> ${candidate?.name || "N/A"}</td>
      <td><strong>Roll Number:</strong> ${candidate?.rollNo || "N/A"}</td>
    </tr>
    <tr>
      <td><strong>Test Date:</strong> ${candidate?.testDate || "N/A"}</td>
      <td><strong>Shift &amp; Time:</strong> ${candidate?.shift || "N/A"}</td>
    </tr>
    <tr>
      <td colspan="2"><strong>Test Centre:</strong> ${candidate?.centre || "N/A"}</td>
    </tr>
  </table>

  <!-- Score Summary -->
  <div class="summary-box">
    <div class="summary-item">
      <div style="color: #64748b;">Total Score</div>
      <div class="num" style="color: #2563eb;">${summary?.totalMarks.toFixed(2) || "0.00"} / ${summary?.maxMarks || 200}</div>
    </div>
    <div class="summary-item">
      <div style="color: #64748b;">Attempted</div>
      <div class="num">${summary?.attempted || 0} / ${summary?.totalQuestions || 100}</div>
    </div>
    <div class="summary-item">
      <div style="color: #64748b;">Correct (+2)</div>
      <div class="num" style="color: #059669;">${summary?.correct || 0}</div>
    </div>
    <div class="summary-item">
      <div style="color: #64748b;">Wrong (-0.5)</div>
      <div class="num" style="color: #e11d48;">${summary?.wrong || 0}</div>
    </div>
    <div class="summary-item">
      <div style="color: #64748b;">Left (0)</div>
      <div class="num" style="color: #64748b;">${summary?.unattempted || 0}</div>
    </div>
    <div class="summary-item">
      <div style="color: #64748b;">Accuracy</div>
      <div class="num">${summary?.accuracy || 0}%</div>
    </div>
  </div>

  <!-- Section-Wise Breakdown Table -->
  <table class="score-table">
    <thead>
      <tr>
        <th>Section</th>
        <th style="text-align: center;">Attempted</th>
        <th style="text-align: center; color: #059669;">Correct</th>
        <th style="text-align: center; color: #e11d48;">Wrong</th>
        <th style="text-align: center;">Left</th>
        <th style="text-align: right;">Score</th>
      </tr>
    </thead>
    <tbody>
      ${sections
        .map(
          (sec) => `
        <tr>
          <td>Part ${sec.id}: ${sec.name} (${sec.qRange})</td>
          <td style="text-align: center;">${sec.attempted}</td>
          <td style="text-align: center; font-weight: 600; color: #059669;">${sec.correct}</td>
          <td style="text-align: center; font-weight: 600; color: #e11d48;">${sec.wrong}</td>
          <td style="text-align: center; color: #64748b;">${sec.unattempted}</td>
          <td style="text-align: right; font-weight: 700;">${sec.sectionMarks.toFixed(2)} / ${sec.maxMarks}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <!-- Questions Section -->
  ${["A", "B", "C", "D"]
    .map((secId) => {
      const secQuestions = sectionGroups[secId] || [];
      if (secQuestions.length === 0) return "";

      const secName = sectionNames[secId] || `Part ${secId}`;

      return `
      <div class="section-banner">Part ${secId}: ${secName} (Q.${secQuestions[0]?.qNum} - Q.${secQuestions[secQuestions.length - 1]?.qNum})</div>
      <div>
        ${secQuestions
          .map((q) => {
            const statusClass =
              q.status === "correct"
                ? "status-correct"
                : q.status === "wrong"
                ? "status-wrong"
                : "status-left";

            const statusText =
              q.status === "correct"
                ? "Correct (+2.00)"
                : q.status === "wrong"
                ? "Wrong (-0.50)"
                : "Unattempted (0.00)";

            let answersHtml = "";

            if (mode === "correct_only") {
              const correctOpt =
                q.options?.find((o) => o.isCorrect) ||
                q.options?.[(q.correctOption || 1) - 1];

              answersHtml = `
                <div class="correct-only-box">
                  <div class="correct-only-label">Official Correct Answer: Option ${
                    correctOpt?.optionNumber || q.correctOption || "N/A"
                  } ${
                q.chosenOption
                  ? q.chosenOption === (correctOpt?.optionNumber || q.correctOption)
                    ? "(Your choice: Correct)"
                    : `(Your choice: Option ${q.chosenOption} - Wrong)`
                  : "(You left this unattempted)"
              }</div>
                  ${
                    correctOpt?.imgUrl
                      ? `<div class="q-img-wrap"><img src="${correctOpt.imgUrl}" alt="Option ${correctOpt.optionNumber}" loading="eager" /></div>`
                      : ""
                  }
                </div>
              `;
            } else {
              // mode === 'all_options'
              answersHtml = `
                <div class="options-grid">
                  ${(q.options || [])
                    .map((opt) => {
                      let optClass = "opt-box";
                      let badge = "";

                      if (opt.isCorrect) {
                        optClass += " opt-correct";
                        badge +=
                          '<span style="color:#065f46; font-weight:600;">[Official Correct Answer]</span> ';
                      }
                      if (opt.isChosen) {
                        if (opt.isCorrect) {
                          badge +=
                            '<span style="color:#065f46; font-weight:600;">[Your Choice]</span>';
                        } else {
                          optClass += " opt-chosen-wrong";
                          badge +=
                            '<span style="color:#9f1239; font-weight:600;">[Your Choice - Wrong]</span>';
                        }
                      }

                      return `
                      <div class="${optClass}">
                        <div class="opt-header">
                          <strong>Option ${opt.optionNumber}</strong>
                          <div>${badge}</div>
                        </div>
                        ${
                          opt.imgUrl
                            ? `<div class="q-img-wrap"><img src="${opt.imgUrl}" alt="Option ${opt.optionNumber}" loading="eager" /></div>`
                            : ""
                        }
                      </div>
                    `;
                    })
                    .join("")}
                </div>
              `;
            }

            return `
            <div class="question-card">
              <div class="question-top">
                <span><strong>Question ${q.qNum}</strong> (Part ${q.sectionId})</span>
                <span class="status-badge ${statusClass}">${statusText}</span>
              </div>
              ${
                q.questionImgUrl
                  ? `<div class="q-img-wrap"><img src="${q.questionImgUrl}" alt="Question ${q.qNum}" loading="eager" /></div>`
                  : ""
              }
              ${answersHtml}
            </div>
          `;
          })
          .join("")}
      </div>
    `;
    })
    .join("")}

  <script>
    window.addEventListener('load', function() {
      var images = Array.from(document.querySelectorAll('img'));
      var loaded = 0;
      var total = images.length;
      var statusEl = document.getElementById('loading-status');

      function updateProgress() {
        loaded++;
        if (statusEl) {
          statusEl.textContent = 'Preloading images: ' + loaded + '/' + total;
        }
        if (loaded >= total) {
          if (statusEl) {
            statusEl.textContent = 'All images loaded! Opening print dialog...';
          }
          setTimeout(function() {
            window.print();
          }, 350);
        }
      }

      if (total === 0) {
        if (statusEl) statusEl.textContent = 'Ready to print!';
        window.print();
        return;
      }

      images.forEach(function(img) {
        if (img.complete) {
          updateProgress();
        } else {
          img.onload = updateProgress;
          img.onerror = updateProgress;
        }
      });

      // Safety fallback: if some image hangs, trigger print after 4 seconds
      setTimeout(function() {
        if (loaded < total) {
          if (statusEl) statusEl.textContent = 'Ready to print (some images timed out)';
          window.print();
        }
      }, 4000);
    });
  </script>
</body>
</html>`;

  // Open printable document in a new window/tab
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert(
      "Popup blocked! Please allow popups for this site to download the PDF."
    );
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
