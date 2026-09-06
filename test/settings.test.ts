import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/types/settings";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: spawnSyncMock };
});

const baseSettings: Settings = {
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
  streamStatusResponseTimeoutMs: 4000,
  streamStatusConnectionTimeoutMs: 500,
  reconnectAttempts: 3,
  reconnectDelay: 5,
  outputDirectory: "./recordings",
  maxStorageGB: 0,
  autoDeleteAfterDays: 0,
  previewEnabled: true,
  previewQuality: "medium",
  snapshotInterval: 5,
};

describe("generateSnapshotArgs", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnSyncMock.mockReset();
  });

  it("uses the modern -timeout flag when the installed FFmpeg only supports it", async () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "  -timeout <int> set timeout\n", stderr: "" });

    const { generateSnapshotArgs } = await import("../src/lib/settings");
    const args = generateSnapshotArgs("rtsp://example/live", "snapshot.jpg", baseSettings);

    expect(args).toContain("-timeout");
    expect(args).not.toContain("-stimeout");
    expect(args[args.indexOf("-timeout") + 1]).toBe("4321000");
  });

  it("falls back to the legacy -stimeout flag when that's all the installed FFmpeg supports", async () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "  -stimeout <int> set timeout\n", stderr: "" });

    const { generateSnapshotArgs } = await import("../src/lib/settings");
    const args = generateSnapshotArgs("rtsp://example/live", "snapshot.jpg", baseSettings);

    expect(args).toContain("-stimeout");
    expect(args[args.indexOf("-stimeout") + 1]).toBe("4321000");
  });

  it("defaults to the modern -timeout flag when probing FFmpeg fails or is inconclusive", async () => {
    spawnSyncMock.mockReturnValue({ status: null, stdout: "", stderr: "", error: new Error("ENOENT") });

    const { generateSnapshotArgs } = await import("../src/lib/settings");
    const args = generateSnapshotArgs("rtsp://example/live", "snapshot.jpg", baseSettings);

    expect(args).toContain("-timeout");
    expect(args).not.toContain("-stimeout");
  });

  it("uses HTTP reconnect options for HTTPS transport streams", async () => {
    const settings: Settings = {
      ffmpegPath: "ffmpeg",
      hardwareAcceleration: "none",
      outputFormat: "mp4",
      videoCodec: "copy",
      audioCodec: "copy",
      customFFmpegArgs: "",
      logLevel: "info",
      defaultDuration: 3600,
      rtspTransport: "tcp",
      rtspSocketTimeoutMs: 4321,
      streamStatusResponseTimeoutMs: 4000,
      streamStatusConnectionTimeoutMs: 500,
      reconnectAttempts: 3,
      reconnectDelay: 7,
      outputDirectory: "./recordings",
      maxStorageGB: 0,
      autoDeleteAfterDays: 0,
      previewEnabled: true,
      previewQuality: "medium",
      snapshotInterval: 5,
    };

    const { generateSnapshotArgs } = await import("../src/lib/settings");
    const args = generateSnapshotArgs("https://example.test/channel.live.ts", "snapshot.jpg", settings);

    expect(args).not.toContain("-rtsp_transport");
    expect(args).toContain("-rw_timeout");
    expect(args).toContain("-reconnect_streamed");
    expect(args[args.indexOf("-reconnect_delay_max") + 1]).toBe("7");
  });
});
