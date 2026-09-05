import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedSyncRequest } from "@/lib/sync/auth";
import { getAllRecordingsWithStats } from "@/lib/recordings";
import { getLocalInstanceId, shouldExecuteLocally } from "@/lib/instanceIdentity";
import { ensureAppRuntimeInitialized } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  ensureAppRuntimeInitialized();

  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const localInstanceId = getLocalInstanceId();
  const locallyExecuted = getAllRecordingsWithStats()
    .filter((recording) => shouldExecuteLocally(recording, localInstanceId))
    .map((recording) => ({
      id: recording.id,
      status: recording.status,
      frames: recording.frames,
      fps: recording.fps,
      time: recording.time,
      bitrate: recording.bitrate,
      speed: recording.speed,
      updatedAt: recording.updatedAt,
      errorMessage: recording.errorMessage,
      isIgnoringLiveStatus: recording.isIgnoringLiveStatus,
    }));

  return NextResponse.json({ instanceId: localInstanceId, recordings: locallyExecuted });
}
