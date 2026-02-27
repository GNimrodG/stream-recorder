import { NextRequest, NextResponse } from "next/server";
import { deleteRecording, getRecordingWithStatsById, updateRecording } from "@/lib/recordings";
import { UpdateRecordingDto } from "@/types/recording";
import { RecordingManager } from "@/lib/RecordingManager";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureInitialized();

  const { id } = await params;
  const recording = getRecordingWithStatsById(id);

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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const manager = RecordingManager.getInstance(id);

  if (!manager) {
    return NextResponse.json({ error: "Recording manager not found" }, { status: 404 });
  }

  switch (action) {
    case "start":
      if (manager.hasStarted()) {
        return NextResponse.json({ error: "The recording has already started." }, { status: 400 });
      }
      manager.start();
      return NextResponse.json({ success: true, message: "Recording started" });

    case "stop":
      if (!manager.hasStarted()) {
        return NextResponse.json({ error: "Recording is not currently running" }, { status: 400 });
      }
      manager.stop();
      return NextResponse.json({ success: true, message: "Recording stopped" });

    case "disableLiveCheck":
      if (manager.isIgnoringStreamStatus)
        return NextResponse.json({ error: "Live check is already disabled for this recording." }, { status: 400 });

      manager.disableLiveCheck();
      return NextResponse.json({ success: true, message: "Live check disabled for this recording" });

    case "enableLiveCheck":
      if (!manager.isIgnoringStreamStatus)
        return NextResponse.json({ error: "Live check is already enabled for this recording." }, { status: 400 });

      manager.enableLiveCheck();
      return NextResponse.json({ success: true, message: "Live check enabled for this recording" });

    default:
      return NextResponse.json({ error: "Invalid action. Use ?action=start or ?action=stop" }, { status: 400 });
  }
}
