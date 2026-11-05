import { NextRequest, NextResponse } from "next/server";
import { getExaminationsList, getExaminationDetails } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get("id");

    if (idParam) {
      const examId = parseInt(idParam, 10);
      if (isNaN(examId) || examId <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid examination ID" },
          { status: 400 }
        );
      }

      const examDetails = await getExaminationDetails(examId);
      if (!examDetails) {
        return NextResponse.json(
          { success: false, error: "Examination not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        examination: examDetails,
      });
    }

    const examinations = await getExaminationsList();
    return NextResponse.json({
      success: true,
      examinations,
    });
  } catch (err: any) {
    if (err?.digest === "NEXT_PRERENDER_INTERRUPTED") {
      throw err;
    }
    console.error("API /api/examinations error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch examinations." },
      { status: 500 }
    );
  }
}
