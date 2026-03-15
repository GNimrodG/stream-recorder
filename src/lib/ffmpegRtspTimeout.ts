import { spawnSync } from "node:child_process";

export type RtspTimeoutFlag = "-rw_timeout" | "-stimeout" | "-timeout";

const timeoutFlagCache = new Map<string, RtspTimeoutFlag>();

function detectRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  try {
    const result = spawnSync(ffmpegPath, ["-hide_banner", "-h", "full"], {
      encoding: "utf-8",
      timeout: 7000,
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();

    if (output.includes("-rw_timeout")) {
      return "-rw_timeout";
    }

    if (output.includes("-stimeout")) {
      return "-stimeout";
    }

    if (output.includes("-timeout")) {
      return "-timeout";
    }
  } catch {
    // Fallback to legacy timeout option if probing fails.
  }

  return "-timeout";
}

export function resolveRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  const cached = timeoutFlagCache.get(ffmpegPath);
  if (cached) {
    return cached;
  }

  const detected = detectRtspTimeoutFlag(ffmpegPath);
  timeoutFlagCache.set(ffmpegPath, detected);
  return detected;
}

export function resetRtspTimeoutFlagCacheForTests(): void {
  timeoutFlagCache.clear();
}
