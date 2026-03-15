import { NextRequest, NextResponse } from "next/server";
import { createRecording, getAllRecordingsWithStats, getPaginatedRecordingsWithStats } from "@/lib/recordings";
import { CreateRecordingDto, RecordingFilterStatus } from "@/types/recording";
import { ensureAppRuntimeInitialized } from "@/lib/runtime";

export function ensureInitialized() {
  ensureAppRuntimeInitialized();
}

function parsePositiveInt(value: string | null, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseStatus(value: string | null): RecordingFilterStatus {
  const validStatuses: RecordingFilterStatus[] = [
    "all",
    "scheduled",
    "starting",
    "recording",
    "completed",
    "failed",
    "cancelled",
    "retrying",
  ];

  if (value && validStatuses.includes(value as RecordingFilterStatus)) {
    return value as RecordingFilterStatus;
  }

  return "all";
}

export async function GET(request: NextRequest) {
  ensureInitialized();

  const searchParams = request.nextUrl.searchParams;
  const hasPaginatedQuery = searchParams.has("page") || searchParams.has("pageSize") || searchParams.has("status");

  if (!hasPaginatedQuery) {
    const recordings = getAllRecordingsWithStats();
    return NextResponse.json(recordings);
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10);
  const status = parseStatus(searchParams.get("status"));

  const paginatedRecordings = getPaginatedRecordingsWithStats({ page, pageSize, status });
  return NextResponse.json(paginatedRecordings);
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
