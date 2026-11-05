import * as cheerio from "cheerio";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import {
  CandidateInfo,
  OverallSummary,
  QuestionDetail,
  ScoreCardResponse,
  SectionSummary,
} from "@/types";

if (process.env.PROXY_URL) {
  try {
    const dispatcher = new ProxyAgent(process.env.PROXY_URL);
    setGlobalDispatcher(dispatcher);
    console.log("Global proxy dispatcher configured with PROXY_URL");
  } catch (err) {
    console.warn("Failed to set ProxyAgent:", err);
  }
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
  "Sec-Ch-Ua":
    '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

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

export function normalizeAnswerKeyUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    // Normalize ViewCandResponse2.aspx, ViewCandResponse3.aspx, etc. to canonical ViewCandResponse.aspx
    parsed.pathname = parsed.pathname.replace(
      /ViewCandResponse\d*\.aspx/i,
      "ViewCandResponse.aspx"
    );
    return parsed.href;
  } catch {
    return rawUrl.trim();
  }
}

const PART_BUTTONS = [
  { id: "A", buttonId: "P1", buttonText: "Click Here for PART-A" },
  { id: "B", buttonId: "P2", buttonText: "Click Here for PART-B" },
  { id: "C", buttonId: "P3", buttonText: "Click Here for PART-C" },
  { id: "D", buttonId: "P4", buttonText: "Click Here for PART-D" },
];

function detectSectionIndex($: cheerio.CheerioAPI): number {
  let firstQ = 1;
  let found = false;

  $("font").each((_, el) => {
    const m = $(el).text().match(/Q\.No:\s*(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!found || n < firstQ) {
        firstQ = n;
        found = true;
      }
    }
  });

  if (firstQ >= 76) return 3; // Part D
  if (firstQ >= 51) return 2; // Part C
  if (firstQ >= 26) return 1; // Part B
  return 0; // Part A
}

export async function parseSscAnswerKey(rawUrl: string): Promise<ScoreCardResponse> {
  // 1. Validate & normalize URL to canonical ViewCandResponse.aspx
  const cleanUrl = normalizeAnswerKeyUrl(rawUrl);
  const parsedUrl = new URL(cleanUrl);
  if (!parsedUrl.hostname.includes("cbexams.com")) {
    throw new Error("Invalid URL: Expected an SSC cbexams response sheet URL.");
  }

  // 2. Initial GET
  const partARes = await fetch(cleanUrl, {
    headers: BROWSER_HEADERS,
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

  // 4. Determine which section was loaded initially, and fetch remaining 3 in parallel
  const initialPartIdx = detectSectionIndex($a);
  const htmls: string[] = new Array(4);
  htmls[initialPartIdx] = partAHtml;

  const partsToFetch: { idx: number; cfg: (typeof PART_BUTTONS)[0] }[] = [];
  for (let i = 0; i < 4; i++) {
    if (i !== initialPartIdx) {
      partsToFetch.push({ idx: i, cfg: PART_BUTTONS[i] });
    }
  }

  const fetchedResults = await Promise.all(
    partsToFetch.map(({ cfg }) =>
      fetchPart(cleanUrl, cfg.buttonId, cfg.buttonText, formData)
    )
  );

  partsToFetch.forEach(({ idx }, i) => {
    htmls[idx] = fetchedResults[i];
  });
  const allQuestions: QuestionDetail[] = [];
  const sectionsSummary: SectionSummary[] = [];

  for (let i = 0; i < SECTIONS_CONFIG.length; i++) {
    const secConfig = SECTIONS_CONFIG[i];
    const $sec = cheerio.load(htmls[i]);
    const secQuestions: QuestionDetail[] = [];

    for (let qNum = secConfig.start; qNum <= secConfig.end; qNum++) {
      const qDetail = parseQuestion($sec, qNum, secConfig.id, secConfig.name, cleanUrl);
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
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: formData.cookies,
      Referer: url,
      Origin: new URL(url).origin,
      "Sec-Fetch-Site": "same-origin",
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

function toAbsoluteUrl(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function parseQuestion(
  $: cheerio.CheerioAPI,
  qNum: number,
  sectionId: string,
  sectionName: string,
  baseUrl: string
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
      questionImgUrl: null,
      options: [],
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

  // Question row image
  let questionImgUrl: string | null = null;
  if (qRowIdx >= 0) {
    const qRow = $(rows[qRowIdx]);
    const rawQImg = qRow.find("img").attr("src");
    questionImgUrl = toAbsoluteUrl(rawQImg, baseUrl);
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
  const options: any[] = [];

  optionRows.forEach((optRow, idx) => {
    const optNum = idx + 1;
    let bg: string | null = null;

    optRow.find("td").each((_: any, td: any) => {
      const b = ($(td).attr("bgcolor") || "").toLowerCase();
      if (b) bg = b;
    });

    const isCorrect = bg === "green" || bg === "yellow";
    const isChosen = bg === "green" || bg === "red";

    if (bg === "green") {
      chosenOption = optNum;
      correctOption = optNum;
    } else if (bg === "red") {
      chosenOption = optNum;
    } else if (bg === "yellow") {
      correctOption = optNum;
    }

    const optImg = optRow.find("img").attr("src");
    options.push({
      optionNumber: optNum,
      imgUrl: toAbsoluteUrl(optImg, baseUrl),
      isCorrect,
      isChosen,
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
    questionImgUrl,
    options,
  };
}
