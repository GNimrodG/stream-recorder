// noinspection ES6PreferShortImport

import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resetRtspTimeoutFlagCacheForTests, resolveRtspTimeoutFlag } from "../src/lib/ffmpegRtspTimeout";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const spawnSyncMock = vi.mocked(spawnSync);

describe("resolveRtspTimeoutFlag", () => {
  beforeEach(() => {
    resetRtspTimeoutFlagCacheForTests();
    spawnSyncMock.mockReset();
  });

  it("prefers -rw_timeout when supported", () => {
    spawnSyncMock.mockReturnValue({ stdout: "-rw_timeout", stderr: "", status: 0 } as never);

    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-rw_timeout");
  });

  it("falls back to -stimeout when -rw_timeout is not available", () => {
    spawnSyncMock.mockReturnValue({ stdout: "-stimeout", stderr: "", status: 0 } as never);

    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-stimeout");
  });

  it("falls back to -timeout when only legacy timeout is available", () => {
    spawnSyncMock.mockReturnValue({ stdout: "-timeout", stderr: "", status: 0 } as never);

    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-timeout");
  });

  it("caches detected value per ffmpeg path", () => {
    spawnSyncMock.mockReturnValue({ stdout: "-rw_timeout", stderr: "", status: 0 } as never);

    expect(resolveRtspTimeoutFlag("ffmpeg-custom")).toBe("-rw_timeout");
    expect(resolveRtspTimeoutFlag("ffmpeg-custom")).toBe("-rw_timeout");
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it("uses legacy timeout fallback if probe throws", () => {
    spawnSyncMock.mockImplementation(() => {
      throw new Error("probe failed");
    });

    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-timeout");
  });
});
