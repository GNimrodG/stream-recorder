import { NextResponse } from "next/server";
import { getRecordingStats } from "@/lib/recordings";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET() {
  ensureInitialized();

  return NextResponse.json(getRecordingStats());
}
