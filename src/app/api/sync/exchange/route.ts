import { NextRequest, NextResponse } from "next/server";
import { Recording } from "@/types/recording";
import { SavedStream } from "@/types/stream";
import { SyncExchangeRequest, SyncExchangeResponse } from "@/types/sync";
import { isAuthorizedSyncRequest } from "@/lib/sync/auth";
import { getLocalInstanceId } from "@/lib/instanceIdentity";
import { applyIncomingSync } from "@/lib/sync/apply";
import { getRecordingsSince, getStreamsSince } from "@/lib/sync/diff";
import { ensureAppRuntimeInitialized } from "@/lib/runtime";

export async function POST(request: NextRequest) {
  ensureAppRuntimeInitialized();

  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SyncExchangeRequest<Recording, SavedStream>;

    if (!body.fromInstanceId || !body.recordings || !body.streams) {
      return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });
    }

    // Capture our own changes since the peer's cursor before merging their payload in, so the
    // reply reflects what changed since they last synced with us, not what changed after.
    const outgoingRecordings = getRecordingsSince(body.since?.recordings);
    const outgoingStreams = getStreamsSince(body.since?.streams);

    applyIncomingSync(body.recordings, body.streams, body.fromInstanceId);

    const response: SyncExchangeResponse<Recording, SavedStream> = {
      fromInstanceId: getLocalInstanceId(),
      serverTime: new Date().toISOString(),
      recordings: outgoingRecordings,
      streams: outgoingStreams,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error handling sync exchange:", error);
    return NextResponse.json({ error: "Failed to process sync exchange" }, { status: 500 });
  }
}
