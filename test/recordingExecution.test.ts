import { describe, expect, it } from "vitest";
import {
  getLocalExecutionResult,
  isPendingLocally,
  mergeInstanceResults,
  setLocalExecutionResult,
  toLocalRecordingView,
} from "@/lib/recordingExecution";
import { mergeCollection } from "@/lib/sync/merge";
import { Recording } from "@/types/recording";

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "rec-1",
    name: "Shared",
    rtspUrl: "rtsp://example/live",
    startTime: "2026-10-10T21:55:00.000Z",
    duration: 3600,
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
    originInstanceId: "instance-a",
    executionInstanceId: "all",
    ...overrides,
  };
}

describe("recording execution results", () => {
  it("keeps each instance's result separate for all-instances recordings", () => {
    const stored = recording();

    setLocalExecutionResult(stored, "instance-a", { success: true, outputPath: "/a/final.mp4" });

    expect(stored.success).toBeUndefined();
    expect(stored.outputPath).toBeUndefined();
    expect(isPendingLocally(stored, "instance-a")).toBe(false);
    expect(isPendingLocally(stored, "instance-b")).toBe(true);
    expect(toLocalRecordingView(stored, "instance-a").outputPath).toBe("/a/final.mp4");
    expect(toLocalRecordingView(stored, "instance-b").outputPath).toBeUndefined();
  });

  it("writes top-level fields for recordings with a single executor", () => {
    const stored = recording({ executionInstanceId: "instance-a" });

    setLocalExecutionResult(stored, "instance-a", { success: true, outputPath: "/a/final.mp4" });

    expect(stored.success).toBe(true);
    expect(stored.outputPath).toBe("/a/final.mp4");
    expect(stored.instanceResults).toBeUndefined();
  });

  it("reads top-level fields of all-instances recordings that predate per-instance results", () => {
    const legacy = recording({ success: true, outputPath: "/legacy/final.mp4" });

    expect(getLocalExecutionResult(legacy, "instance-b")).toMatchObject({
      success: true,
      outputPath: "/legacy/final.mp4",
    });
  });

  it("does not let a peer's finished copy hide this instance's pending run during sync", () => {
    const local = recording();
    setLocalExecutionResult(local, "instance-b", { attemptPaths: ["/b/part1.mp4"] });

    const remote = recording({ updatedAt: "2026-10-11T00:00:00.000Z" });
    setLocalExecutionResult(remote, "instance-a", { success: true, outputPath: "/a/final.mp4" });

    const { items } = mergeCollection(
      "recordings",
      { localItems: [local], localTombstones: [], remoteItems: [remote], remoteTombstones: [] },
      { combineItems: mergeInstanceResults },
    );

    expect(isPendingLocally(items[0], "instance-b")).toBe(true);
    expect(getLocalExecutionResult(items[0], "instance-b").attemptPaths).toEqual(["/b/part1.mp4"]);
    expect(getLocalExecutionResult(items[0], "instance-a").outputPath).toBe("/a/final.mp4");
  });

  it("keeps the newer copy of an instance's own entry", () => {
    const winner = recording({
      instanceResults: { "instance-a": { attemptPaths: ["/a/part1.mp4"], updatedAt: "2026-10-10T22:00:00.000Z" } },
    });
    const other = recording({
      instanceResults: { "instance-a": { success: true, updatedAt: "2026-10-11T01:00:00.000Z" } },
    });

    expect(mergeInstanceResults(winner, other).instanceResults?.["instance-a"].success).toBe(true);
    expect(mergeInstanceResults(other, winner).instanceResults?.["instance-a"].success).toBe(true);
  });
});
