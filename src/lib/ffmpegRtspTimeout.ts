import { spawnSync } from "node:child_process";

export type RtspTimeoutFlag = "-rw_timeout" | "-stimeout";

const timeoutFlagOrder: Array<Exclude<RtspTimeoutFlag, "-timeout">> = ["-rw_timeout", "-stimeout"];
const timeoutFlagPatterns: Record<Exclude<RtspTimeoutFlag, "-timeout">, RegExp> = {
  "-rw_timeout": /^\s+-rw_timeout\s+/m,
  "-stimeout": /^\s+-stimeout\s+/m,
};
const deprecatedTimeoutFlagPattern = /^\s+-timeout\s+/m;
const timeoutFlagCache = new Map<string, RtspTimeoutFlag>();

function probeRtspTimeoutFlag(ffmpegPath: string): RtspTimeoutFlag {
  const helpOutputs = [
    ["-hide_banner", "-h", "demuxer=rtsp"],
    ["-hide_banner", "-h", "full"],
  ];

  console.log(`[ffmpegRtspTimeout] Probing RTSP timeout support for ${ffmpegPath}`);

  for (const args of helpOutputs) {
    console.log(`[ffmpegRtspTimeout] Running: ${ffmpegPath} ${args.join(" ")}`);

    const result = spawnSync(ffmpegPath, args, {
      encoding: "utf-8",
      timeout: 7000,
    });

    const helpText = `${result.stdout || ""}${result.stderr || ""}`.toLowerCase();
    const hasDeprecatedTimeoutFlag = deprecatedTimeoutFlagPattern.test(helpText);
    const supportedFlag = timeoutFlagOrder.find((flag) => timeoutFlagPatterns[flag].test(helpText));

    console.log(
      `[ffmpegRtspTimeout] Probe result for ${ffmpegPath} (${args.join(" ")}): ` +
        `${supportedFlag || "no supported RTSP timeout flag"}${hasDeprecatedTimeoutFlag ? ", deprecated -timeout present" : ""}`,
    );

    if (supportedFlag) {
      if (hasDeprecatedTimeoutFlag) {
        console.warn(
          `[ffmpegRtspTimeout] FFmpeg exposes deprecated -timeout for ${ffmpegPath}, but a supported client-side RTSP timeout flag was found.`,
        );
      }
      return supportedFlag;
    }

    if (hasDeprecatedTimeoutFlag) {
      console.warn(
        `[ffmpegRtspTimeout] FFmpeg exposes deprecated -timeout for ${ffmpegPath}, but it is ignored for RTSP pulls. Falling back to -stimeout.`,
      );
    }
  }

  console.warn(`Unable to determine the RTSP timeout flag for ${ffmpegPath}; defaulting to -stimeout.`);
  return "-stimeout";
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
