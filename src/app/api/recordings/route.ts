import { NextRequest, NextResponse } from "next/server";
import {
  createRecording,
  getAllRecordings,
  getRecordingStats,
  initializeRecordings,
  startCleanupScheduler,
} from "@/lib/recordings";
import { CreateRecordingDto } from "@/types/recording";

// Initialize recordings on first request
let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    initializeRecordings();
    startCleanupScheduler();
    initialized = true;
  }
}

export async function GET(request: NextRequest) {
  ensureInitialized();

  const searchParams = request.nextUrl.searchParams;
  const stats = searchParams.get("stats");

  if (stats === "true") {
    return NextResponse.json(getRecordingStats());
  }

  const recordings = getAllRecordings();
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
      return NextResponse.json(
        { error: "Invalid RTSP URL. Must start with rtsp://" },
        { status: 400 },
      );
    }

    // Validate duration
    if (body.duration <= 0) {
      return NextResponse.json(
        { error: "Duration must be a positive number" },
        { status: 400 },
      );
    }

    const recording = createRecording(body);
    return NextResponse.json(recording, { status: 201 });
  } catch (error) {
    console.error("Error creating recording:", error);
    return NextResponse.json(
      { error: "Failed to create recording" },
      { status: 500 },
    );
  }
}
