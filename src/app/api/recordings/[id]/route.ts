import { NextRequest, NextResponse } from "next/server";
import { deleteRecording, getRecordingById, startRecording, stopRecording, updateRecording } from "@/lib/recordings";
import { UpdateRecordingDto } from "@/types/recording";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json(recording);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body: UpdateRecordingDto = await request.json();
    const recording = updateRecording(id, body);

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    return NextResponse.json(recording);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update recording" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = deleteRecording(id);

  if (!success) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// Custom actions via POST
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  switch (action) {
    case "start":
      if (recording.status !== "scheduled") {
        return NextResponse.json({ error: "Recording is not in scheduled status" }, { status: 400 });
      }
      startRecording(id);
      return NextResponse.json({ success: true, message: "Recording started" });

    case "stop":
      if (recording.status !== "recording" && recording.status !== "retrying") {
        return NextResponse.json({ error: "Recording is not currently running" }, { status: 400 });
      }
      stopRecording(id);
      return NextResponse.json({ success: true, message: "Recording stopped" });

    default:
      return NextResponse.json({ error: "Invalid action. Use ?action=start or ?action=stop" }, { status: 400 });
  }
}
