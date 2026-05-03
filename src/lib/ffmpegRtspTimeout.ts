import { spawnSync } from "node:child_process";

export type RtspTimeoutFlag = "-timeout" | "-rw_timeout" | "-stimeout";

const timeoutFlagOrder: RtspTimeoutFlag[] = ["-timeout", "-rw_timeout", "-stimeout"];
const timeoutFlagPatterns: Record<RtspTimeoutFlag, RegExp> = {
  "-timeout": /^\s+-timeout\s+/m,
  "-rw_timeout": /^\s+-rw_timeout\s+/m,
  "-stimeout": /^\s+-stimeout\s+/m,
};
const timeoutFlagCache = new Map<string, RtspTimeoutFlag>();

function probeRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  const helpOutputs = [
    ["-hide_banner", "-h", "demuxer=rtsp"],
    ["-hide_banner", "-h", "full"],
  ];

  for (const args of helpOutputs) {
    const result = spawnSync(ffmpegPath, args, {
      encoding: "utf-8",
      timeout: 7000,
    });

    const helpText = `${result.stdout || ""}${result.stderr || ""}`.toLowerCase();
    const supportedFlag = timeoutFlagOrder.find((flag) => timeoutFlagPatterns[flag].test(helpText));

    if (supportedFlag) {
      return supportedFlag;
    }
  }

  console.warn(`Unable to determine the RTSP timeout flag for ${ffmpegPath}; defaulting to -timeout.`);
  return "-timeout";
}

export function resolveRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  const cached = timeoutFlagCache.get(ffmpegPath);
  if (cached) {
    return cached;
  }

  const resolved = probeRtspTimeoutFlag(ffmpegPath);
  timeoutFlagCache.set(ffmpegPath, resolved);
  return resolved;
}
