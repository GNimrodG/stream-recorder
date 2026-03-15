import { RecordingManager } from "@/lib/RecordingManager";
import { createRecording, getAllRecordings } from "@/lib/recordings";
import { checkStreamStatus } from "@/lib/stream";
import { getAllStreams } from "@/lib/streams";

const STATUS_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_RECORDING_DURATION_SECONDS = 24 * 60 * 60; // 24 hours

let schedulerInitialized = false;
let tickInProgress = false;

const activeAutoRecordingByStreamId = new Map<string, string>();

function msUntilNextFiveMinuteBoundary(now: Date): number {
  const msIntoWindow = (now.getMinutes() % 5) * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds();

  if (msIntoWindow === 0) {
    return 0;
  }

  return STATUS_CHECK_INTERVAL_MS - msIntoWindow;
}

function stopRecordingById(recordingId: string, reason: string) {
  const manager = RecordingManager.getInstance(recordingId);
  if (!manager) {
    return;
  }

  if (!manager.hasCompleted()) {
    console.log(`[AUTO] Stopping recording ${recordingId}. Reason: ${reason}`);
    manager.stop();
  }
}

function rehydrateActiveAutoRecordings() {
  activeAutoRecordingByStreamId.clear();

  const recordings = getAllRecordings();
  for (const recording of recordings) {
    if (!recording.autoStopWhenStreamOffline || !recording.sourceStreamId || recording.success !== undefined) {
      continue;
    }

    const manager = RecordingManager.getInstance(recording.id);
    if (manager && !manager.hasCompleted()) {
      activeAutoRecordingByStreamId.set(recording.sourceStreamId, recording.id);
    }
  }

  if (activeAutoRecordingByStreamId.size > 0) {
    console.log(`[AUTO] Rehydrated ${activeAutoRecordingByStreamId.size} active auto recordings.`);
  }
}

async function handleAutoRecordingForStream(stream: { id: string; name: string; rtspUrl: string }) {
  const currentRecordingId = activeAutoRecordingByStreamId.get(stream.id);

  if (currentRecordingId) {
    const manager = RecordingManager.getInstance(currentRecordingId);

    if (!manager || manager.hasCompleted()) {
      activeAutoRecordingByStreamId.delete(stream.id);
    } else {
      const status = await checkStreamStatus(stream.rtspUrl);
      if (status !== "live") {
        stopRecordingById(currentRecordingId, `stream became ${status}`);
        activeAutoRecordingByStreamId.delete(stream.id);
      }
      return;
    }
  }

  const status = await checkStreamStatus(stream.rtspUrl);
  if (status !== "live") {
    return;
  }

  const recording = createRecording({
    name: `${stream.name} (Auto)`,
    rtspUrl: stream.rtspUrl,
    startTime: new Date().toISOString(),
    duration: AUTO_RECORDING_DURATION_SECONDS,
    sourceStreamId: stream.id,
    autoStopWhenStreamOffline: true,
  });

  activeAutoRecordingByStreamId.set(stream.id, recording.id);
  console.log(`[AUTO] Started auto recording ${recording.id} for stream ${stream.id}.`);
}

async function runAutoRecordingTick() {
  if (tickInProgress) {
    console.log("[AUTO] Skipping tick because previous tick is still running.");
    return;
  }

  tickInProgress = true;

  try {
    const streams = getAllStreams();
    const autoEnabledStreams = streams.filter((stream) => stream.autoRecordWhenLive);
    const enabledStreamIds = new Set(autoEnabledStreams.map((stream) => stream.id));

    for (const [streamId, recordingId] of activeAutoRecordingByStreamId.entries()) {
      if (!enabledStreamIds.has(streamId)) {
        stopRecordingById(recordingId, "auto-record disabled for stream");
        activeAutoRecordingByStreamId.delete(streamId);
      }
    }

    for (const stream of autoEnabledStreams) {
      try {
        await handleAutoRecordingForStream(stream);
      } catch (error) {
        console.error(`[AUTO] Failed processing stream ${stream.id}:`, error);
      }
    }
  } finally {
    tickInProgress = false;
  }
}

export function ensureAutoRecordingSchedulerInitialized() {
  if (schedulerInitialized) {
    return;
  }

  schedulerInitialized = true;
  rehydrateActiveAutoRecordings();

  const delay = msUntilNextFiveMinuteBoundary(new Date());
  console.log(`[AUTO] Scheduling auto-record checks. First run in ${delay}ms, then every 5 minutes aligned to clock.`);

  setTimeout(() => {
    runAutoRecordingTick().catch((error) => {
      console.error("[AUTO] Auto-record tick failed:", error);
    });

    setInterval(() => {
      runAutoRecordingTick().catch((error) => {
        console.error("[AUTO] Auto-record tick failed:", error);
      });
    }, STATUS_CHECK_INTERVAL_MS);
  }, delay);
}
