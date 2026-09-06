import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../src/types/settings";

const loadSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/settings")>();
  return { ...actual, loadSettings: loadSettingsMock };
});

describe("FFmpeg stream input arguments", () => {
  beforeEach(() => {
    loadSettingsMock.mockReturnValue({ ...defaultSettings, reconnectDelay: 6 });
  });

  it("uses reconnectable HTTP input options for .live.ts streams", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgs("https://example.test/channel.live.ts?token=abc", "output.mp4", 60);

    expect(args).not.toContain("-rtsp_transport");
    expect(args).toContain("-rw_timeout");
    expect(args).toContain("-reconnect");
    expect(args).toContain("-reconnect_streamed");
    expect(args[args.indexOf("-reconnect_delay_max") + 1]).toBe("6");
    expect(args).not.toContain("-bsf:a");
    expect(args[args.indexOf("-i") + 1]).toBe("https://example.test/channel.live.ts?token=abc");
  });

  it("does not force an ADTS filter for an HLS playlist", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgs("https://example.test/live/playlist.m3u8", "output.mp4", 60);

    expect(args).not.toContain("-bsf:a");
    expect(args).not.toContain("aac_adtstoasc");
  });

  it("adds the ADTS conversion only for a positively detected MPEG-TS input", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const transportStreamArgs = buildFFmpegArgs("https://example.test/channel.live.ts", "output.mp4", 60, "mpegts");
    const cmafArgs = buildFFmpegArgs("https://example.test/live/playlist.m3u8", "output.mp4", 60, "fmp4");

    expect(transportStreamArgs[transportStreamArgs.indexOf("-bsf:a") + 1]).toBe("aac_adtstoasc");
    expect(cmafArgs).not.toContain("-bsf:a");
  });

  it("retains RTSP-specific input options for RTSP streams", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgs("rtsp://camera.local/live", "output.mp4", 60);

    expect(args).toContain("-rtsp_transport");
    expect(args).toContain("-rtsp_flags");
    expect(args).not.toContain("-reconnect_streamed");
    expect(args).not.toContain("-bsf:a");
  });

  it("trusts the source's own PTS/DTS instead of wallclock timestamps, for both RTSP and HTTP", async () => {
    const { buildFFmpegArgs } = await import("../src/lib/ffmpeg");
    const rtspArgs = buildFFmpegArgs("rtsp://camera.local/live", "output.mp4", 60);
    const httpArgs = buildFFmpegArgs("https://example.test/channel.live.ts", "output.mp4", 60);

    for (const args of [rtspArgs, httpArgs]) {
      expect(args).not.toContain("-use_wallclock_as_timestamps");
      expect(args[args.indexOf("-fflags") + 1]).toBe("+genpts+discardcorrupt");
    }
  });

  it("trusts the source's own PTS/DTS in the live preview pipeline too", async () => {
    const { buildFFmpegArgsForPreview } = await import("../src/lib/ffmpeg");
    const args = buildFFmpegArgsForPreview("rtsp://camera.local/live");

    expect(args).not.toContain("-use_wallclock_as_timestamps");
    expect(args[args.indexOf("-fflags") + 1]).toBe("+genpts+discardcorrupt");
  });
});
