import { describe, expect, it } from "vitest";
import {
  buildRecordingLogDisplayItems,
  isRoutineHlsLogLine,
  parseRecordingLogLine,
} from "../src/lib/recordingLogDisplay";

describe("recording log display", () => {
  it.each([
    "[2026-08-01T17:17:52.000Z] stderr: [http @ abc] Opening 'http://camera/live_part.mp4' for reading",
    "in#0/hls @ 0000017b4aff5a80",
    "Skip ('#EXT-X-PART:DURATION=0.20000,URI=\"part.mp4\"')",
    "[2026-08-01T17:17:52.000Z] stderr: [tcp @ abc] Successfully connected to camera port 8888",
    "[tcp @ 0000017b4affb700]",
    "[2026-08-01T17:17:52.000Z] stderr: [mov @ abc] Found duplicated MOOV Atom. Skipped it",
  ])("recognizes routine LL-HLS output: %s", (line) => {
    expect(isRoutineHlsLogLine(line)).toBe(true);
  });

  it("keeps non-monotonic DTS warnings visible", () => {
    const warning =
      "[2026-08-01T17:17:55.000Z] stderr: [vost#0:0/copy @ abc] Non-monotonic DTS; previous: 1879025, current: 1879025; changing to 1879026. This may result in incorrect timestamps in the output file.";

    expect(isRoutineHlsLogLine(warning)).toBe(false);
    expect(
      buildRecordingLogDisplayItems(warning, {
        hideEmptyLines: false,
        hideFrameLines: false,
        hideHlsNoise: true,
      }),
    ).toEqual([
      expect.objectContaining({
        type: "line",
        text: expect.stringContaining("Non-monotonic DTS"),
      }),
    ]);
  });

  it("does not interpret an FFmpeg context prefix as a timestamp", () => {
    expect(parseRecordingLogLine("[tcp @ 0000017b4affb700]")).toEqual({
      timestamp: null,
      text: "[tcp @ 0000017b4affb700]",
    });
  });

  it("collapses routine HLS output but keeps errors readable and expandable", () => {
    const content = [
      "[2026-08-01T17:17:52.000Z] stderr: [http @ abc] Opening 'http://camera/part.mp4' for reading",
      "in#0/hls @ 0000017b4aff5a80",
      "Skip ('#EXT-X-PART:DURATION=0.20000,URI=\"part.mp4\"')",
      "[2026-08-01T17:17:53.000Z] stderr: Server returned 503 Service Unavailable",
    ].join("\n");

    const items = buildRecordingLogDisplayItems(content, {
      hideEmptyLines: true,
      hideFrameLines: false,
      hideHlsNoise: true,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "placeholder", kind: "hls", count: 3 });
    expect(items[0].type === "placeholder" ? items[0].lines : []).toHaveLength(3);
    expect(items[1]).toMatchObject({ type: "line", text: expect.stringContaining("503 Service Unavailable") });
  });

  it("inherits a chunk timestamp for visible FFmpeg continuation lines", () => {
    const items = buildRecordingLogDisplayItems(
      "[2026-08-01T17:17:53.000Z] stderr: Input error\nServer returned 503 Service Unavailable",
      { hideEmptyLines: false, hideFrameLines: false, hideHlsNoise: false },
    );

    expect(items[1]).toMatchObject({
      type: "line",
      timestamp: "2026-08-01T17:17:53.000Z",
      text: "Server returned 503 Service Unavailable",
    });
  });

  it("groups routine HLS chunks across blank stderr separators", () => {
    const content = [
      "[2026-08-01T17:17:52.000Z] stderr: [http @ abc] Opening 'http://camera/part1.mp4' for reading",
      "",
      "",
      "[2026-08-01T17:17:53.000Z] stderr: [http @ def] Opening 'http://camera/part2.mp4' for reading",
      "",
      "[2026-08-01T17:17:54.000Z] Recording completed successfully.",
    ].join("\n");

    const items = buildRecordingLogDisplayItems(content, {
      hideEmptyLines: false,
      hideFrameLines: false,
      hideHlsNoise: true,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "placeholder", kind: "hls", count: 2 });
    expect(items[1]).toMatchObject({ type: "line", text: "Recording completed successfully." });
  });
});
