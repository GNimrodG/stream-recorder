import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

describe("ffmpegRtspTimeout", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnSyncMock.mockReset();
  });

  it("resolves the timeout flag from RTSP demuxer help and caches it per ffmpeg path", async () => {
    spawnSyncMock.mockImplementation((_ffmpegPath: string, args: string[]) => {
      const helpOutput = args.includes("demuxer=rtsp")
        ? [
            "Demuxer rtsp [RTSP input]:",
            "  -timeout           <int64>      .D......... set timeout (in microseconds)",
          ].join("\n")
        : "";

      return { stdout: helpOutput, stderr: "", status: 0 };
    });

    const { resolveRtspTimeoutFlag } = await import("../src/lib/ffmpegRtspTimeout");

    expect(resolveRtspTimeoutFlag("/opt/ffmpeg")).toBe("-timeout");
    expect(resolveRtspTimeoutFlag("/opt/ffmpeg")).toBe("-timeout");
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock).toHaveBeenCalledWith("/opt/ffmpeg", ["-hide_banner", "-h", "demuxer=rtsp"], {
      encoding: "utf-8",
      timeout: 7000,
    });
  });

  it("falls back to full help when demuxer help is inconclusive and keeps caches separate per path", async () => {
    spawnSyncMock.mockImplementation((_ffmpegPath: string, args: string[]) => {
      const command = args.join(" ");

      if (command.includes("demuxer=rtsp")) {
        return { stdout: "", stderr: "", status: 0 };
      }

      return {
        stdout: ["Full help output", "  -stimeout         <int>        .D......... set socket I/O timeout"].join("\n"),
        stderr: "",
        status: 0,
      };
    });

    const { resolveRtspTimeoutFlag } = await import("../src/lib/ffmpegRtspTimeout");

    expect(resolveRtspTimeoutFlag("ffmpeg-a")).toBe("-stimeout");
    expect(resolveRtspTimeoutFlag("ffmpeg-a")).toBe("-stimeout");
    expect(resolveRtspTimeoutFlag("ffmpeg-b")).toBe("-stimeout");
    expect(spawnSyncMock).toHaveBeenCalledTimes(4);
  });
});
