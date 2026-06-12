import { NextRequest, NextResponse } from "next/server";
import { getRecordingWithStatsById } from "@/lib/recordings";
import { getVideoMetadata } from "@/lib/videoMetadata";
import { resolveMergedRecordingOutputPath } from "@/lib/recordingFiles";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureInitialized();

  try {
    const { id } = await params;
    const recording = getRecordingWithStatsById(id);

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const outputPath = resolveMergedRecordingOutputPath(recording);

    if (!outputPath) {
      return NextResponse.json({ error: "Recording has no finalized merged output file yet" }, { status: 400 });
    }

    const metadata = getVideoMetadata(outputPath);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Error fetching video metadata:", error);
    return NextResponse.json({ error: "Failed to fetch video metadata" }, { status: 500 });
  }
}
