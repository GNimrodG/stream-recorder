import { describe, expect, it } from "vitest";
import { getStreamUrlKind, isSupportedStreamUrl, normalizeStreamUrl } from "../src/lib/streamUrl";

describe("stream URL handling", () => {
  it.each([
    ["rtsp://camera.local/live", "rtsp"],
    ["http://example.test/live.m3u8", "http"],
    ["https://example.test/channel.live.ts?token=abc", "http"],
  ] as const)("recognizes %s", (url, expectedKind) => {
    expect(getStreamUrlKind(url)).toBe(expectedKind);
    expect(isSupportedStreamUrl(url)).toBe(true);
  });

  it("normalizes the legacy rtspt alias", () => {
    expect(normalizeStreamUrl("rtspt://camera.local/live")).toBe("rtsp://camera.local/live");
  });

  it.each(["ftp://example.test/live", "not a url", "file:///tmp/video.ts"])("rejects %s", (url) => {
    expect(isSupportedStreamUrl(url)).toBe(false);
  });
});
