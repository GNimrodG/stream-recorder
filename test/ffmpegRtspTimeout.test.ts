// noinspection ES6PreferShortImport

import { beforeEach, describe, expect, it } from "vitest";
import {
  extractUnsupportedRtspTimeoutFlag,
  reportUnsupportedRtspTimeoutFlag,
  resetRtspTimeoutFlagCacheForTests,
  resolveRtspTimeoutFlag,
} from "../src/lib/ffmpegRtspTimeout";

describe("resolveRtspTimeoutFlag", () => {
  beforeEach(() => {
    resetRtspTimeoutFlagCacheForTests();
  });

  it("defaults to -rw_timeout", () => {
    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-rw_timeout");
  });

  it("returns cached value after demotion", () => {
    reportUnsupportedRtspTimeoutFlag("ffmpeg", "-rw_timeout");
    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-stimeout");
  });

  it("demotes -stimeout to -timeout", () => {
    reportUnsupportedRtspTimeoutFlag("ffmpeg", "-stimeout");
    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-timeout");
  });

  it("stays at -timeout when already at end of fallback chain", () => {
    reportUnsupportedRtspTimeoutFlag("ffmpeg", "-timeout");
    expect(resolveRtspTimeoutFlag("ffmpeg")).toBe("-timeout");
  });
});

describe("extractUnsupportedRtspTimeoutFlag", () => {
  it("detects -rw_timeout", () => {
    expect(extractUnsupportedRtspTimeoutFlag("Option rw_timeout not found.")).toBe("-rw_timeout");
  });

  it("detects -stimeout", () => {
    expect(extractUnsupportedRtspTimeoutFlag("Option stimeout not found.")).toBe("-stimeout");
  });

  it("detects -timeout", () => {
    expect(extractUnsupportedRtspTimeoutFlag("Option timeout not found.")).toBe("-timeout");
  });

  it("returns null for unrelated stderr lines", () => {
    expect(extractUnsupportedRtspTimeoutFlag("Connection refused")).toBeNull();
    expect(extractUnsupportedRtspTimeoutFlag("Successfully connected")).toBeNull();
  });
});
