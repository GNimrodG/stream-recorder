import { beforeEach, describe, expect, it } from "vitest";
import {
  extractUnsupportedRtspTimeoutFlag,
  reportUnsupportedRtspTimeoutFlag,
  resetRtspTimeoutFlagCacheForTests,
  resolveRtspTimeoutFlag,
} from "../src/lib/ffmpegRtspTimeout";

describe("ffmpegRtspTimeout", () => {
  beforeEach(() => {
    resetRtspTimeoutFlagCacheForTests();
  });

  it("parses unsupported timeout options from ffmpeg stderr", () => {
    expect(extractUnsupportedRtspTimeoutFlag("Option rw_timeout not found.")).toBe("-rw_timeout");
    expect(extractUnsupportedRtspTimeoutFlag("Option stimeout not found.")).toBe("-stimeout");
    expect(extractUnsupportedRtspTimeoutFlag("Option timeout not found.")).toBe("-timeout");
    expect(extractUnsupportedRtspTimeoutFlag("Input #0, rtsp, from 'rtsp://example/live':")).toBeNull();
  });

  it("uses fallback order and caches the next timeout flag per ffmpeg path", () => {
    const ffmpegPath = "/usr/bin/ffmpeg";

    expect(resolveRtspTimeoutFlag(ffmpegPath)).toBe("-rw_timeout");
    expect(reportUnsupportedRtspTimeoutFlag(ffmpegPath, "-rw_timeout")).toBe("-stimeout");
    expect(resolveRtspTimeoutFlag(ffmpegPath)).toBe("-stimeout");
    expect(reportUnsupportedRtspTimeoutFlag(ffmpegPath, "-stimeout")).toBe("-timeout");
    expect(resolveRtspTimeoutFlag(ffmpegPath)).toBe("-timeout");
  });
});
