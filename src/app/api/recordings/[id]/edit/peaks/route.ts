import { NextRequest, NextResponse } from "next/server";
import { getRecordingWithStatsById } from "@/lib/recordings";
import { getAudioPeaks } from "@/lib/videoAnalysis";
import { resolveMergedRecordingOutputPath } from "@/lib/recordingFiles";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureInitialized();

  try {
    const { id } = await params;
    const recording = getRecordingWithStatsById(id);

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const outputPath = resolveMergedRecordingOutputPath(recording);

    if (!outputPath) {
      return NextResponse.json({ error: "Recording has no finalized merged output file" }, { status: 400 });
    }

    const peaks = await getAudioPeaks(outputPath, 240, request.signal);
    return NextResponse.json(peaks);
  } catch (error) {
    if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return new NextResponse(null, { status: 499 });
    }

    console.error("Error extracting audio peaks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract audio peaks" },
      { status: 500 },
    );
  }
}
