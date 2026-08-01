export type LogLineItem = {
  type: "line";
  raw: string;
  timestamp?: string | null;
  text: string;
};

export type HiddenLogKind = "frame" | "hls";

export type LogPlaceholderItem = {
  type: "placeholder";
  kind: HiddenLogKind;
  count: number;
  lines: string[];
  startTimestamp?: string | null;
  endTimestamp?: string | null;
};

export type LogDisplayItem = LogLineItem | LogPlaceholderItem;

const FRAME_LINE_RE = /\bframe=\s*\d+/;
const STDERR_ONLY_RE = /^\[.*]\s+stderr:\s*$/;
// Recorder timestamps are ISO strings. FFmpeg also starts many messages with
// bracketed contexts such as `[tcp @ 000001...]`; those are message text, not timestamps.
const TIMESTAMP_RE = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)]\s*(.*)$/;

export function parseRecordingLogLine(raw: string): { timestamp: string | null; text: string } {
  const match = raw.match(TIMESTAMP_RE);
  return match ? { timestamp: match[1], text: match[2] } : { timestamp: null, text: raw };
}

export function isRoutineHlsLogLine(raw: string): boolean {
  const { text } = parseRecordingLogLine(raw);
  const message = text.replace(/^stderr:\s*/, "").trim();

  return (
    /\bSkip \('#EXT-X-(?:VERSION|SERVER-CONTROL|PART-INF|PROGRAM-DATE-TIME|PART|PRELOAD-HINT)/.test(message) ||
    /\bHLS request for url\b/.test(message) ||
    /\bOpening 'https?:\/\//.test(message) ||
    /\bStarting connection attempt to\b/.test(message) ||
    /\bSuccessfully connected to\b/.test(message) ||
    /\bStatistics: \d+ bytes read, \d+ seeks\b/.test(message) ||
    /\bFound duplicated MOOV Atom\. Skipped it\b/.test(message) ||
    /^(?:\[)?(?:in#\d+\/hls|http|tcp|AVIOContext) @ [^\]]+(?:])?$/.test(message)
  );
}

export function buildRecordingLogDisplayItems(
  content: string,
  options: { hideEmptyLines: boolean; hideFrameLines: boolean; hideHlsNoise: boolean },
): LogDisplayItem[] {
  const lines = content.split(/\r?\n/);
  const items: LogDisplayItem[] = [];
  let hiddenBuffer: string[] = [];
  let hiddenKind: HiddenLogKind | null = null;
  let hiddenStartTs: string | null = null;
  let hiddenEndTs: string | null = null;
  let lastTimestamp: string | null = null;

  const flushHidden = () => {
    if (hiddenBuffer.length === 0 || hiddenKind === null) return;
    items.push({
      type: "placeholder",
      kind: hiddenKind,
      count: hiddenBuffer.length,
      lines: hiddenBuffer,
      startTimestamp: hiddenStartTs,
      endTimestamp: hiddenEndTs,
    });
    hiddenBuffer = [];
    hiddenKind = null;
    hiddenStartTs = null;
    hiddenEndTs = null;
  };

  const hideLine = (raw: string, kind: HiddenLogKind) => {
    if (hiddenKind !== null && hiddenKind !== kind) flushHidden();
    hiddenKind = kind;
    const parsed = parseRecordingLogLine(raw);
    const timestamp = parsed.timestamp ?? lastTimestamp;
    if (timestamp) {
      hiddenStartTs ??= timestamp;
      hiddenEndTs = timestamp;
    }
    hiddenBuffer.push(raw);
  };

  for (const raw of lines) {
    const parsed = parseRecordingLogLine(raw);
    if (parsed.timestamp) lastTimestamp = parsed.timestamp;

    // FFmpeg chunks commonly end with a newline and the recorder adds another,
    // leaving blank separators between otherwise contiguous HLS diagnostics.
    // Keep the active HLS block open across those invisible separators.
    if (options.hideHlsNoise && hiddenKind === "hls" && raw.trim() === "") continue;

    if (options.hideFrameLines && FRAME_LINE_RE.test(raw)) {
      hideLine(raw, "frame");
      continue;
    }

    if (options.hideHlsNoise && isRoutineHlsLogLine(raw)) {
      hideLine(raw, "hls");
      continue;
    }

    if (options.hideEmptyLines && (raw.trim() === "" || STDERR_ONLY_RE.test(raw))) continue;

    flushHidden();
    items.push({ type: "line", raw, timestamp: parsed.timestamp ?? lastTimestamp, text: parsed.text });
  }

  flushHidden();
  return items;
}
