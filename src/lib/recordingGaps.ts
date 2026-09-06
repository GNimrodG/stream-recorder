// Parses a recording's ffmpeg log into "segments" (periods where ffmpeg was actively
// receiving and writing frames) and "gaps" (periods where the recording was down —
// waiting for the stream to come online, or reconnecting after ffmpeg lost the
// connection). This powers the connection-gaps timeline UI, which answers the
// question "where did the recording split, and for how long".

export type RecordingSegment = {
  startTimestamp: string;
  endTimestamp: string;
  /** True when this segment hadn't ended yet as of the end of the log (recording still in progress). */
  ongoing?: boolean;
};

export type RecordingGapReasonKind =
  | "connecting" // initial startup latency before the very first connection — not a real loss
  | "waiting-for-stream" // source stream reported offline
  | "connection-error" // ffmpeg reported a specific network/stream error before exiting
  | "no-frames" // ffmpeg exited cleanly but never produced a frame
  | "process-error" // the ffmpeg process itself failed to run
  | "unknown"; // ffmpeg stopped and restarted, but no specific reason was captured

export type RecordingGap = {
  startTimestamp: string;
  /** Null when the gap is still open (recording currently down, or the log ends mid-gap). */
  endTimestamp: string | null;
  /** Null only when the gap is open-ended and no reference "now" was supplied. */
  durationSeconds: number | null;
  reasonKind: RecordingGapReasonKind;
  reason: string;
};

export type RecordingGapAnalysis = {
  segments: RecordingSegment[];
  gaps: RecordingGap[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  totalGapSeconds: number;
};

const TIMESTAMP_RE = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)]\s?(.*)$/;

type LogEntry = { timestamp: string; text: string };

// Merges continuation lines (ffmpeg stderr chunks can contain embedded newlines) back
// into the log entry they belong to, so multi-line messages are matched as one unit.
function buildLogEntries(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const match = raw.match(TIMESTAMP_RE);
    if (match) {
      if (current) entries.push(current);
      current = { timestamp: match[1], text: match[2] };
    } else if (current) {
      current.text += `\n${raw}`;
    }
  }
  if (current) entries.push(current);

  return entries;
}

const MAX_REASON_LENGTH = 240;

function truncateReason(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  return cleaned.length > MAX_REASON_LENGTH ? `${cleaned.slice(0, MAX_REASON_LENGTH)}…` : cleaned;
}

// Gaps that never advanced past the initial "connecting" stage represent normal
// startup latency (the moment ffmpeg is spawned vs. the moment we observe its first
// frame=), not an actual loss of an already-running recording. Only hide them when
// they're brief; a stalled initial connection is still worth surfacing.
const MIN_NOTEWORTHY_CONNECTING_GAP_SECONDS = 3;

export function analyzeRecordingGaps(content: string, nowMs: number = Date.now()): RecordingGapAnalysis {
  const entries = buildLogEntries(content);

  const firstTimestamp = entries[0]?.timestamp ?? null;
  const lastTimestamp = entries.at(-1)?.timestamp ?? null;

  const segments: RecordingSegment[] = [];
  const gaps: RecordingGap[] = [];

  let inSegment = false;
  let segmentStart: string | null = null;
  let finished = false;

  // Tracked as a single mutable record (rather than separate `let`s) so TypeScript
  // doesn't over-narrow `reasonKind` based on which branch last assigned it.
  const gap: { open: boolean; start: string | null; reasonKind: RecordingGapReasonKind; reason: string } = {
    open: firstTimestamp !== null,
    start: firstTimestamp,
    reasonKind: "connecting",
    reason: "Waiting for the first connection to the stream.",
  };

  const openGap = (ts: string, kind: RecordingGapReasonKind, reason: string) => {
    gap.open = true;
    gap.start = ts;
    gap.reasonKind = kind;
    gap.reason = reason;
  };

  const closeGap = (ts: string) => {
    if (!gap.open || gap.start === null) return;
    const durationSeconds = Math.max(0, (new Date(ts).getTime() - new Date(gap.start).getTime()) / 1000);
    gaps.push({ startTimestamp: gap.start, endTimestamp: ts, durationSeconds, reasonKind: gap.reasonKind, reason: gap.reason });
    gap.open = false;
    gap.start = null;
  };

  // Ends the current gap (if any) without recording it — used when the recording
  // reaches a deliberate, successful stop, so there's nothing left to report as "lost".
  const discardGap = () => {
    gap.open = false;
    gap.start = null;
  };

  for (const entry of entries) {
    const ts = entry.timestamp;
    const line = entry.text.split("\n")[0] ?? "";
    let match: RegExpMatchArray | null;

    if (line === "Stream is not live, waiting for it to go live...") {
      if (gap.open) {
        gap.reasonKind = "waiting-for-stream";
        gap.reason = "Waiting for the source stream to come online.";
      }
      continue;
    }

    if ((match = line.match(/^Stream status check #\d+: (.+)$/))) {
      if (gap.open && (gap.reasonKind === "connecting" || gap.reasonKind === "waiting-for-stream")) {
        gap.reasonKind = "waiting-for-stream";
        gap.reason = `Waiting for the source stream to come online (last status: ${match[1]}).`;
      }
      continue;
    }

    if (line === "Recording has started, frames are being received.") {
      closeGap(ts);
      inSegment = true;
      segmentStart = ts;
      continue;
    }

    if ((match = line.match(/^FFmpeg process exited with code (.+) and signal (.+)$/))) {
      if (inSegment && segmentStart) {
        segments.push({ startTimestamp: segmentStart, endTimestamp: ts });
        inSegment = false;
        segmentStart = null;
      }
      openGap(ts, "unknown", `FFmpeg stopped unexpectedly (exit code ${match[1]}, signal ${match[2]}).`);
      continue;
    }

    if ((match = line.match(/^Last error message: (.+)$/))) {
      if (gap.open) {
        gap.reasonKind = "connection-error";
        gap.reason = truncateReason(entry.text.slice("Last error message: ".length));
      }
      continue;
    }

    if (line.startsWith("Warning: FFmpeg exited successfully but no frames were recorded")) {
      if (gap.open && gap.reasonKind === "unknown") {
        gap.reasonKind = "no-frames";
        gap.reason = "FFmpeg exited without receiving any video frames from the stream.";
      }
      continue;
    }

    if ((match = line.match(/^FFmpeg process error: (.+)$/))) {
      if (inSegment && segmentStart) {
        segments.push({ startTimestamp: segmentStart, endTimestamp: ts });
        inSegment = false;
        segmentStart = null;
      }
      if (!gap.open) openGap(ts, "process-error", truncateReason(match[1]));
      else {
        gap.reasonKind = "process-error";
        gap.reason = truncateReason(match[1]);
      }
      closeGap(ts);
      finished = true;
      continue;
    }

    if (
      /^Maximum reconnect attempts \(\d+\) reached while waiting for stream to go live\. Cancelling recording\.$/.test(
        line,
      )
    ) {
      closeGap(ts);
      finished = true;
      continue;
    }

    if (line === "Recording duration has elapsed while waiting for stream to go live. Cancelling recording.") {
      closeGap(ts);
      finished = true;
      continue;
    }

    if (line === "Recording completed successfully.") {
      if (inSegment && segmentStart) {
        segments.push({ startTimestamp: segmentStart, endTimestamp: ts });
        inSegment = false;
        segmentStart = null;
      }
      discardGap();
      finished = true;
      continue;
    }

    if (
      line === "Recording was aborted, not checking for completion." ||
      line === "Recording start aborted before it could begin." ||
      line === "Recording start aborted while waiting for stream to go live."
    ) {
      if (inSegment && segmentStart) {
        segments.push({ startTimestamp: segmentStart, endTimestamp: ts });
        inSegment = false;
        segmentStart = null;
      }
      discardGap();
      finished = true;
      continue;
    }
  }

  if (inSegment && segmentStart) {
    segments.push({ startTimestamp: segmentStart, endTimestamp: lastTimestamp ?? segmentStart, ongoing: true });
  }

  if (gap.open && !finished && gap.start) {
    const durationSeconds = Math.max(0, (nowMs - new Date(gap.start).getTime()) / 1000);
    gaps.push({
      startTimestamp: gap.start,
      endTimestamp: null,
      durationSeconds,
      reasonKind: gap.reasonKind,
      reason: gap.reason,
    });
  }

  const meaningfulGaps = gaps.filter(
    (gap) =>
      !(
        gap.reasonKind === "connecting" &&
        gap.durationSeconds !== null &&
        gap.durationSeconds < MIN_NOTEWORTHY_CONNECTING_GAP_SECONDS
      ),
  );

  const totalGapSeconds = meaningfulGaps.reduce((sum, gap) => sum + (gap.durationSeconds ?? 0), 0);

  return { segments, gaps: meaningfulGaps, firstTimestamp, lastTimestamp, totalGapSeconds };
}
