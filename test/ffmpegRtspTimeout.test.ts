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

  it("prefers -rw_timeout and ignores deprecated -timeout when both appear", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    spawnSyncMock.mockImplementation((_ffmpegPath: string, args: string[]) => {
      const helpOutput = args.includes("demuxer=rtsp")
        ? [
            "Demuxer rtsp [RTSP input]:",
            "  -timeout           <int64>      .D......... deprecated listen timeout",
            "  -rw_timeout        <int64>      .D......... set socket I/O timeout",
          ].join("\n")
        : "";

      return { stdout: helpOutput, stderr: "", status: 0 };
    });

    const { resolveRtspTimeoutFlag } = await import("../src/lib/ffmpegRtspTimeout");

    expect(resolveRtspTimeoutFlag("/opt/ffmpeg")).toBe("-rw_timeout");
    expect(resolveRtspTimeoutFlag("/opt/ffmpeg")).toBe("-rw_timeout");
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Probing RTSP timeout support"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated -timeout"));
    expect(spawnSyncMock).toHaveBeenCalledWith("/opt/ffmpeg", ["-hide_banner", "-h", "demuxer=rtsp"], {
      encoding: "utf-8",
      timeout: 7000,
    });

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("falls back to -stimeout when -rw_timeout is unavailable and keeps caches separate per path", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    spawnSyncMock.mockImplementation((_ffmpegPath: string, args: string[]) => {
      const command = args.join(" ");

      if (command.includes("demuxer=rtsp")) {
        return { stdout: "", stderr: "", status: 0 };
      }

      return {
        stdout: [
          "Full help output",
          "  -timeout          <int64>      .D......... deprecated listen timeout",
          "  -stimeout         <int>        .D......... set socket I/O timeout",
        ].join("\n"),
        stderr: "",
        status: 0,
      };
    });

    const { resolveRtspTimeoutFlag } = await import("../src/lib/ffmpegRtspTimeout");

    expect(resolveRtspTimeoutFlag("ffmpeg-a")).toBe("-stimeout");
    expect(resolveRtspTimeoutFlag("ffmpeg-a")).toBe("-stimeout");
    expect(resolveRtspTimeoutFlag("ffmpeg-b")).toBe("-stimeout");
    expect(spawnSyncMock).toHaveBeenCalledTimes(4);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Running:"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated -timeout"));

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
