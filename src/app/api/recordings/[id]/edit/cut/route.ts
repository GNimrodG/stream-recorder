import { NextRequest, NextResponse } from "next/server";
import { getRecordingWithStatsById } from "@/lib/recordings";
import { cutVideo, createCutJob } from "@/lib/videoCutter";
import { CutRequest } from "@/types/editor";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveMergedRecordingOutputPath } from "@/lib/recordingFiles";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureInitialized();

  try {
    const { id } = await params;
    const body: CutRequest = await request.json();

    // Validate input
    const recording = getRecordingWithStatsById(id);
    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const inputPath = resolveMergedRecordingOutputPath(recording);

    if (!inputPath) {
      return NextResponse.json({ error: "Recording has no finalized merged output file" }, { status: 400 });
    }

    if (!body.segments || body.segments.length === 0) {
      return NextResponse.json({ error: "At least one segment is required" }, { status: 400 });
    }

    // Validate segments
    for (const segment of body.segments) {
      if (segment.startTime < 0 || segment.endTime <= segment.startTime) {
        return NextResponse.json({ error: "Invalid segment times" }, { status: 400 });
      }
    }

    // Create job
    const jobId = randomUUID();
    const job = createCutJob(jobId, id);

    // Generate output filename
    const outputExt = body.outputFormat || "mp4";
    const originalName = path.basename(inputPath, path.extname(inputPath));
    const outputFilename = `${originalName}_edited_${Date.now()}.${outputExt}`;
    const editedOutputPath = path.join(path.dirname(inputPath), outputFilename);

    // Process asynchronously
    (async () => {
      try {
        job.status = "processing";
        job.progress = 10;

        // Perform the cut
        await cutVideo(inputPath, editedOutputPath, body.segments, jobId);

        job.status = "completed";
        job.progress = 100;
        job.outputPath = editedOutputPath;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Unknown error";
        console.error("Video cut failed:", error);
      }
    })();

    return NextResponse.json({
      success: true,
      jobId,
    });
  } catch (error) {
    console.error("Error processing cut request:", error);
    return NextResponse.json({ error: "Failed to process cut request" }, { status: 500 });
  }
}
