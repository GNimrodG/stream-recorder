import { NextRequest, NextResponse } from "next/server";
import { getAllRecordingsWithStats } from "@/lib/recordings";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET(request: NextRequest) {
  ensureInitialized();

  const searchParams = request.nextUrl.searchParams;
  const length = parseInt(searchParams.get("length") || "10", 10);

  const recordings = getAllRecordingsWithStats();

  return NextResponse.json(
    recordings.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, length),
  );
}
