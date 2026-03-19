// noinspection ES6PreferShortImport

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../src/types/settings";

const { resolveRtspTimeoutFlagMock } = vi.hoisted(() => ({
  resolveRtspTimeoutFlagMock: vi.fn(() => "-rw_timeout" as const),
}));

const mockedSettings: Settings = {
  ffmpegPath: "ffmpeg",
  hardwareAcceleration: "none",
  outputFormat: "mp4",
  videoCodec: "copy",
  audioCodec: "copy",
  customFFmpegArgs: "",
  logLevel: "info",
  defaultDuration: 3600,
  rtspTransport: "tcp",
  rtspSocketTimeoutMs: 1234,
  reconnectAttempts: 3,
  reconnectDelay: 5,
  outputDirectory: "./recordings",
  maxStorageGB: 0,
  autoDeleteAfterDays: 0,
  previewEnabled: true,
  previewQuality: "medium",
  snapshotInterval: 5,
};

vi.mock("@/lib/settings", () => ({
  loadSettings: () => mockedSettings,
  generateSnapshotArgs: vi.fn(),
}));

vi.mock("@/lib/ffmpegArgs", () => ({
  parseCustomFFmpegArgs: () => [],
}));

vi.mock("@/lib/ffmpegRtspTimeout", () => ({
  resolveRtspTimeoutFlag: resolveRtspTimeoutFlagMock,
}));

describe("FFmpeg timeout arguments", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveRtspTimeoutFlagMock.mockClear();
  });

  it("uses -rw_timeout for recording args", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgs("rtsp://example/live", "out.mp4", 60);

    expect(args).toContain("-rw_timeout");
    expect(args[args.indexOf("-rw_timeout") + 1]).toBe("1234000");
    expect(args).not.toContain("-timeout");
    expect(resolveRtspTimeoutFlagMock).toHaveBeenCalledWith("ffmpeg");
  });

  it("uses -rw_timeout for preview args", async () => {
    const { buildFFmpegArgsForPreview } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgsForPreview("rtsp://example/live");

    expect(args).toContain("-rw_timeout");
    expect(args[args.indexOf("-rw_timeout") + 1]).toBe("1234000");
    expect(args).not.toContain("-timeout");
    expect(resolveRtspTimeoutFlagMock).toHaveBeenCalledWith("ffmpeg");
  });
});
