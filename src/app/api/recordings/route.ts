import { NextRequest, NextResponse } from "next/server";
import { createRecording, getAllRecordingsWithStats } from "@/lib/recordings";
import { CreateRecordingDto } from "@/types/recording";
import { initializeRecordings, startCleanupScheduler } from "@/lib/recordings";

// Initialize recordings on first request
let initialized = false;

export function ensureInitialized() {
  if (!initialized) {
    initializeRecordings();
    startCleanupScheduler();
    initialized = true;
    console.log("Recordings initialized and cleanup scheduler started");
  }
}

export async function GET() {
  ensureInitialized();

  const recordings = getAllRecordingsWithStats();
  return NextResponse.json(recordings);
}

export async function POST(request: NextRequest) {
  ensureInitialized();
  try {
    const body: CreateRecordingDto = await request.json();

    // Validate required fields
    if (!body.name || !body.rtspUrl || !body.startTime || !body.duration) {
      return NextResponse.json(
        {
          error: "Missing required fields: name, rtspUrl, startTime, duration",
        },
        { status: 400 },
      );
    }

    // Validate RTSP URL
    if (!body.rtspUrl.startsWith("rtsp://")) {
      return NextResponse.json({ error: "Invalid RTSP URL. Must start with rtsp://" }, { status: 400 });
    }

    // Validate duration
    if (body.duration <= 0) {
      return NextResponse.json({ error: "Duration must be a positive number" }, { status: 400 });
    }

    const recording = createRecording(body);
    return NextResponse.json(recording, { status: 201 });
  } catch (error) {
    console.error("Error creating recording:", error);
    return NextResponse.json({ error: "Failed to create recording" }, { status: 500 });
  }
}
