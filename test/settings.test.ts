import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../src/types/settings";

const { resolveRtspTimeoutFlagMock } = vi.hoisted(() => ({
  resolveRtspTimeoutFlagMock: vi.fn(() => "-stimeout" as const),
}));

vi.mock("@/lib/ffmpegRtspTimeout", () => ({
  resolveRtspTimeoutFlag: resolveRtspTimeoutFlagMock,
}));

describe("generateSnapshotArgs", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveRtspTimeoutFlagMock.mockClear();
  });

  it("uses adaptive RTSP timeout flag resolution", async () => {
    const settings: Settings = {
      ffmpegPath: "custom-ffmpeg",
      hardwareAcceleration: "none",
      outputFormat: "mp4",
      videoCodec: "copy",
      audioCodec: "copy",
      customFFmpegArgs: "",
      logLevel: "info",
      defaultDuration: 3600,
      rtspTransport: "tcp",
      rtspSocketTimeoutMs: 4321,
      reconnectAttempts: 3,
      reconnectDelay: 5,
      outputDirectory: "./recordings",
      maxStorageGB: 0,
      autoDeleteAfterDays: 0,
      previewEnabled: true,
      previewQuality: "medium",
      snapshotInterval: 5,
    };

    const { generateSnapshotArgs } = await import("../src/lib/settings");
    const args = generateSnapshotArgs("rtsp://example/live", "snapshot.jpg", settings);

    expect(resolveRtspTimeoutFlagMock).toHaveBeenCalledWith("custom-ffmpeg");
    expect(args).toContain("-stimeout");
    expect(args[args.indexOf("-stimeout") + 1]).toBe("4321000");
    expect(args).not.toContain("-rw_timeout");
  });
});
