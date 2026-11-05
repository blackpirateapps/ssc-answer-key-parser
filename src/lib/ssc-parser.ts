import * as cheerio from "cheerio";
import {
  CandidateInfo,
  OverallSummary,
  QuestionDetail,
  ScoreCardResponse,
  SectionSummary,
} from "@/types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const SECTIONS_CONFIG = [
  {
    id: "A",
    name: "General Intelligence & Reasoning",
    start: 1,
    end: 25,
  },
  {
    id: "B",
    name: "General Awareness",
    start: 26,
    end: 50,
  },
  {
    id: "C",
    name: "Quantitative Aptitude",
    start: 51,
    end: 75,
  },
  {
    id: "D",
    name: "English Comprehension",
    start: 76,
    end: 100,
  },
];

interface AspNetFormData {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
  cookies: string;
}

export async function parseSscAnswerKey(rawUrl: string): Promise<ScoreCardResponse> {
  // 1. Validate & normalize URL
  const parsedUrl = new URL(rawUrl.trim());
  if (!parsedUrl.hostname.includes("cbexams.com")) {
    throw new Error("Invalid URL: Expected an SSC cbexams response sheet URL.");
  }

  const cleanUrl = parsedUrl.href;

  // 2. Fetch Part A (Initial GET)
  const partARes = await fetch(cleanUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!partARes.ok) {
    throw new Error(
      `Failed to fetch response sheet: HTTP ${partARes.status} ${partARes.statusText}`
    );
  }

  // Extract cookies from Set-Cookie header
  const setCookie = partARes.headers.get("set-cookie") || "";
  const cookieHeader = setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  const partAHtml = await partARes.text();
  const $a = cheerio.load(partAHtml);

  // Extract ASP.NET Hidden Tokens
  const viewState = $a("#__VIEWSTATE").val() as string;
  const viewStateGenerator = $a("#__VIEWSTATEGENERATOR").val() as string;
  const eventValidation = $a("#__EVENTVALIDATION").val() as string;

  if (!viewState || !eventValidation) {
    throw new Error(
      "Could not parse ASP.NET form state. The answer key URL may have expired or is invalid."
    );
  }

  const formData: AspNetFormData = {
    viewState,
    viewStateGenerator: viewStateGenerator || "",
    eventValidation,
    cookies: cookieHeader,
  };

  // 3. Extract Candidate Details from Part A
  const candidate = parseCandidateDetails($a);

  // 4. Fetch Parts B, C, and D in parallel using Part A's ViewState
  const [partBHtml, partCHtml, partDHtml] = await Promise.all([
    fetchPart(cleanUrl, "P2", "Click Here for PART-B", formData),
    fetchPart(cleanUrl, "P3", "Click Here for PART-C", formData),
    fetchPart(cleanUrl, "P4", "Click Here for PART-D", formData),
  ]);

  // 5. Parse all questions section by section
  const htmls = [partAHtml, partBHtml, partCHtml, partDHtml];
  const allQuestions: QuestionDetail[] = [];
  const sectionsSummary: SectionSummary[] = [];

  for (let i = 0; i < SECTIONS_CONFIG.length; i++) {
    const secConfig = SECTIONS_CONFIG[i];
    const $sec = cheerio.load(htmls[i]);
    const secQuestions: QuestionDetail[] = [];

    for (let qNum = secConfig.start; qNum <= secConfig.end; qNum++) {
      const qDetail = parseQuestion($sec, qNum, secConfig.id, secConfig.name);
      secQuestions.push(qDetail);
      allQuestions.push(qDetail);
    }

    const correctCount = secQuestions.filter((q) => q.status === "correct").length;
    const wrongCount = secQuestions.filter((q) => q.status === "wrong").length;
    const unattemptedCount = secQuestions.filter((q) => q.status === "unattempted").length;
    const attemptedCount = correctCount + wrongCount;

    const positiveMarks = correctCount * 2.0;
    const negativeMarks = wrongCount * 0.5;
    const sectionMarks = Number((positiveMarks - negativeMarks).toFixed(2));

    sectionsSummary.push({
      id: secConfig.id,
      name: secConfig.name,
      qRange: `Q.${secConfig.start} – Q.${secConfig.end}`,
      totalQuestions: secConfig.end - secConfig.start + 1,
      attempted: attemptedCount,
      correct: correctCount,
      wrong: wrongCount,
      unattempted: unattemptedCount,
      positiveMarks,
      negativeMarks,
      sectionMarks,
      maxMarks: 50,
      wrongQuestions: secQuestions.filter((q) => q.status === "wrong").map((q) => q.qNum),
      unattemptedQuestions: secQuestions
        .filter((q) => q.status === "unattempted")
        .map((q) => q.qNum),
    });
  }

  // 6. Calculate Overall Summary
  const totalCorrect = sectionsSummary.reduce((acc, s) => acc + s.correct, 0);
  const totalWrong = sectionsSummary.reduce((acc, s) => acc + s.wrong, 0);
  const totalUnattempted = sectionsSummary.reduce((acc, s) => acc + s.unattempted, 0);
  const totalAttempted = totalCorrect + totalWrong;
  const totalMarks = Number((totalCorrect * 2.0 - totalWrong * 0.5).toFixed(2));
  const accuracy =
    totalAttempted > 0
      ? Number(((totalCorrect / totalAttempted) * 100).toFixed(2))
      : 0;

  const summary: OverallSummary = {
    totalQuestions: 100,
    attempted: totalAttempted,
    correct: totalCorrect,
    wrong: totalWrong,
    unattempted: totalUnattempted,
    accuracy,
    totalMarks,
    maxMarks: 200,
  };

  return {
    success: true,
    cached: false,
    fetchedAt: new Date().toISOString(),
    candidate,
    summary,
    sections: sectionsSummary,
    questions: allQuestions,
  };
}

async function fetchPart(
  url: string,
  buttonName: string,
  buttonVal: string,
  formData: AspNetFormData
): Promise<string> {
  const body = new URLSearchParams();
  body.append("__EVENTTARGET", "");
  body.append("__EVENTARGUMENT", "");
  body.append("__VIEWSTATE", formData.viewState);
  if (formData.viewStateGenerator) {
    body.append("__VIEWSTATEGENERATOR", formData.viewStateGenerator);
  }
  body.append("__EVENTVALIDATION", formData.eventValidation);
  body.append(buttonName, buttonVal);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: formData.cookies,
      Referer: url,
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch part via ${buttonName}: HTTP ${res.status}`);
  }

  return await res.text();
}

function parseCandidateDetails($: cheerio.CheerioAPI): CandidateInfo {
  let rollNo = "";
  let name = "";
  let examLevel = "Combined Graduate Level Examination, 2026";
  let testDate = "";
  let shift = "";
  let centre = "";

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) {
      const key = $(tds[0]).text().replace(/\s+/g, " ").trim().toLowerCase();
      let val = $(tds[1]).text().replace(/[:\xa0]/g, " ").replace(/\s+/g, " ").trim();

      const selectVal = $(tds[1]).find("select option:selected").text().trim();
      if (selectVal) {
        val = selectVal;
      }

      if (key.includes("roll")) rollNo = val;
      else if (key.includes("candidate name")) name = val;
      else if (key.includes("exam level")) examLevel = val || examLevel;
      else if (key.includes("test date")) testDate = val;
      else if (key.includes("test time") || key.includes("shift")) shift = val;
      else if (key.includes("centre")) centre = val;
    }
  });

  return {
    rollNo: rollNo || "N/A",
    name: name || "N/A",
    examLevel,
    testDate: testDate || "N/A",
    shift: shift || "N/A",
    centre: centre || "N/A",
  };
}

function parseQuestion(
  $: cheerio.CheerioAPI,
  qNum: number,
  sectionId: string,
  sectionName: string
): QuestionDetail {
  // Find the exact font element containing Q.No: {qNum}
  const qFont = $("font").filter((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    return txt === `Q.No: ${qNum}` || txt === `Q.No:${qNum}`;
  }).first();

  const qTable = qFont.closest("table");
  if (!qTable || qTable.length === 0) {
    return {
      qNum,
      sectionId,
      sectionName,
      status: "unattempted",
      chosenOption: null,
      correctOption: null,
    };
  }

  const rows = qTable.find("tr").toArray();

  let qRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if ($(rows[i]).text().includes("Q.No:")) {
      qRowIdx = i;
      break;
    }
  }

  let isNotAnswered = false;
  const optionRows: any[] = [];

  for (let i = qRowIdx + 1; i < rows.length; i++) {
    const rowEl = $(rows[i]);
    const rowText = rowEl.text().toLowerCase();

    if (rowText.includes("not answered")) {
      isNotAnswered = true;
    }

    rowEl.find("td").each((_, td) => {
      const bg = ($(td).attr("bgcolor") || "").toLowerCase();
      if (bg === "gray") {
        isNotAnswered = true;
      }
    });

    if (rowEl.find("img").length > 0) {
      optionRows.push(rowEl);
    }
  }

  let chosenOption: number | null = null;
  let correctOption: number | null = null;

  optionRows.forEach((optRow, idx) => {
    const optNum = idx + 1;
    optRow.find("td").each((_: any, td: any) => {
      const bg = ($(td).attr("bgcolor") || "").toLowerCase();
      if (bg === "green") {
        chosenOption = optNum;
        correctOption = optNum;
      } else if (bg === "red") {
        chosenOption = optNum;
      } else if (bg === "yellow") {
        correctOption = optNum;
      }
    });
  });

  let status: "correct" | "wrong" | "unattempted" = "unattempted";

  if (isNotAnswered) {
    status = "unattempted";
    chosenOption = null;
  } else if (chosenOption && correctOption && chosenOption === correctOption) {
    status = "correct";
  } else if (chosenOption && correctOption && chosenOption !== correctOption) {
    status = "wrong";
  } else if (!chosenOption && correctOption) {
    status = "unattempted";
  }

  return {
    qNum,
    sectionId,
    sectionName,
    status,
    chosenOption,
    correctOption,
  };
}
