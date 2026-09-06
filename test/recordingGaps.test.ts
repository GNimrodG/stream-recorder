import { describe, expect, it } from "vitest";
import { analyzeRecordingGaps } from "../src/lib/recordingGaps";

describe("analyzeRecordingGaps", () => {
  it("reports no gaps for a healthy single-attempt recording", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.100Z] Starting recording, checking if stream is live...",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 60 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:01:00.300Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:01:00.400Z] Output file size: 10.00 MB",
      "[2026-08-01T10:01:00.500Z] Recording completed successfully.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);

    expect(result.segments).toEqual([
      { startTimestamp: "2026-08-01T10:00:00.900Z", endTimestamp: "2026-08-01T10:01:00.300Z" },
    ]);
    expect(result.gaps).toEqual([]);
    expect(result.totalGapSeconds).toBe(0);
  });

  it("captures a reconnect gap with the ffmpeg error as the reason", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 300 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:02:00.000Z] stderr: Connection timed out",
      "[2026-08-01T10:02:00.500Z] FFmpeg process exited with code 1 and signal none",
      "[2026-08-01T10:02:00.600Z] Last error message: Connection timed out",
      "[2026-08-01T10:02:00.700Z] Output file size: 5.00 MB",
      "[2026-08-01T10:02:05.700Z] Recording stopped before completion, 180.0 seconds remaining. Will retry...",
      "[2026-08-01T10:02:10.700Z] Recording to: /out/cam_attempt2.mp4 for duration: 180 seconds",
      "[2026-08-01T10:02:12.000Z] Recording has started, frames are being received.",
      "[2026-08-01T10:05:00.000Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:05:00.100Z] Recording completed successfully.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);

    expect(result.segments).toEqual([
      { startTimestamp: "2026-08-01T10:00:00.900Z", endTimestamp: "2026-08-01T10:02:00.500Z" },
      { startTimestamp: "2026-08-01T10:02:12.000Z", endTimestamp: "2026-08-01T10:05:00.000Z" },
    ]);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      startTimestamp: "2026-08-01T10:02:00.500Z",
      endTimestamp: "2026-08-01T10:02:12.000Z",
      reasonKind: "connection-error",
      reason: "Connection timed out",
    });
    expect(result.gaps[0].durationSeconds).toBeCloseTo(11.5, 5);
  });

  it("treats a stalled wait for the stream to come online as a gap", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.100Z] Starting recording, checking if stream is live...",
      "[2026-08-01T10:00:00.200Z] Stream is not live, waiting for it to go live...",
      "[2026-08-01T10:00:05.200Z] Stream status check #1: offline",
      "[2026-08-01T10:00:10.200Z] Stream status check #2: offline",
      "[2026-08-01T10:00:15.200Z] Stream is now live, starting recording...",
      "[2026-08-01T10:00:15.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 60 seconds",
      "[2026-08-01T10:00:15.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:01:15.300Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:01:15.400Z] Recording completed successfully.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      startTimestamp: "2026-08-01T10:00:00.000Z",
      endTimestamp: "2026-08-01T10:00:15.900Z",
      reasonKind: "waiting-for-stream",
    });
    expect(result.gaps[0].reason).toContain("offline");
  });

  it("hides the brief startup-connection gap for a healthy recording", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 60 seconds",
      "[2026-08-01T10:00:01.000Z] Recording has started, frames are being received.",
      "[2026-08-01T10:01:00.300Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:01:00.400Z] Recording completed successfully.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);
    expect(result.gaps).toEqual([]);
  });

  it("reports an unresolved gap when max reconnect attempts are exhausted", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.100Z] Starting recording, checking if stream is live...",
      "[2026-08-01T10:00:00.200Z] Stream is not live, waiting for it to go live...",
      "[2026-08-01T10:00:05.200Z] Stream status check #1: offline",
      "[2026-08-01T10:00:10.200Z] Stream status check #2: offline",
      "[2026-08-01T10:00:10.300Z] Maximum reconnect attempts (2) reached while waiting for stream to go live. Cancelling recording.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);

    expect(result.segments).toEqual([]);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      startTimestamp: "2026-08-01T10:00:00.000Z",
      endTimestamp: "2026-08-01T10:00:10.300Z",
      reasonKind: "waiting-for-stream",
    });
  });

  it("leaves the current gap open (no end timestamp) while a recording is still retrying", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 300 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:02:00.000Z] FFmpeg process exited with code 1 and signal none",
      "[2026-08-01T10:02:00.100Z] Recording stopped before completion, 240.0 seconds remaining. Will retry...",
    ].join("\n");

    const nowMs = new Date("2026-08-01T10:02:30.100Z").getTime();
    const result = analyzeRecordingGaps(log, nowMs);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].endTimestamp).toBeNull();
    expect(result.gaps[0].durationSeconds).toBeCloseTo(30.1, 5);
    expect(result.segments).toEqual([
      { startTimestamp: "2026-08-01T10:00:00.900Z", endTimestamp: "2026-08-01T10:02:00.000Z" },
    ]);
  });

  it("marks a still-recording segment as ongoing", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 300 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);
    expect(result.segments).toEqual([
      { startTimestamp: "2026-08-01T10:00:00.900Z", endTimestamp: "2026-08-01T10:00:00.900Z", ongoing: true },
    ]);
    expect(result.gaps).toEqual([]);
  });

  it("captures a fatal ffmpeg process error as its own gap", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 300 seconds",
      "[2026-08-01T10:00:00.400Z] FFmpeg process error: spawn ffmpeg ENOENT",
    ].join("\n");

    const result = analyzeRecordingGaps(log);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      reasonKind: "process-error",
      reason: "spawn ffmpeg ENOENT",
    });
    expect(result.gaps[0].durationSeconds).toBeCloseTo(0.4, 5);
  });

  it("does not report a trailing gap for a manually cancelled recording", () => {
    const log = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 300 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:00:30.000Z] Stopping recording...",
      "[2026-08-01T10:00:30.100Z] FFmpeg process exited with code 255 and signal SIGINT",
      "[2026-08-01T10:00:30.200Z] Recording was aborted, not checking for completion.",
    ].join("\n");

    const result = analyzeRecordingGaps(log);
    expect(result.gaps).toEqual([]);
    expect(result.segments).toEqual([
      { startTimestamp: "2026-08-01T10:00:00.900Z", endTimestamp: "2026-08-01T10:00:30.100Z" },
    ]);
  });
});
