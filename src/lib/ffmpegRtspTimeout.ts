export type RtspTimeoutFlag = "-rw_timeout" | "-stimeout" | "-timeout";

const timeoutFlagOrder: RtspTimeoutFlag[] = ["-rw_timeout", "-stimeout", "-timeout"];
const timeoutFlagCache = new Map<string, RtspTimeoutFlag>();

export function resolveRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  return timeoutFlagCache.get(ffmpegPath) ?? "-rw_timeout";
}

export function extractUnsupportedRtspTimeoutFlag(line: string): RtspTimeoutFlag | null {
  const normalized = line.toLowerCase();
  for (const flag of timeoutFlagOrder) {
    if (normalized.includes(`option ${flag.slice(1)} not found`)) {
      return flag;
    }
  }
  return null;
}

export function reportUnsupportedRtspTimeoutFlag(ffmpegPath: string, unsupportedFlag: RtspTimeoutFlag): RtspTimeoutFlag {
  const unsupportedIndex = timeoutFlagOrder.indexOf(unsupportedFlag);
  const fallback = timeoutFlagOrder[Math.min(timeoutFlagOrder.length - 1, unsupportedIndex + 1)];
  timeoutFlagCache.set(ffmpegPath, fallback);
  return fallback;
}

export function resetRtspTimeoutFlagCacheForTests(): void {
  timeoutFlagCache.clear();
}
