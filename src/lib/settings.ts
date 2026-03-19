import { defaultSettings, Settings } from "@/types/settings";
import { parseCustomFFmpegArgs } from "@/lib/ffmpegArgs";
import { resolveRtspTimeoutFlag } from "@/lib/ffmpegRtspTimeout";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SETTINGS_FILE = process.env.SETTINGS_FILE_PATH || "./data/settings.json";

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadSettings(): Settings {
  ensureDataDir();

  if (!fs.existsSync(SETTINGS_FILE)) {
    saveSettings(defaultSettings);
    return defaultSettings;
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);
    // Merge with defaults to ensure all fields exist
    return { ...defaultSettings, ...settings };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const currentSettings = loadSettings();
  const newSettings = { ...currentSettings, ...updates };
  saveSettings(newSettings);
  return newSettings;
}

// Detect available hardware acceleration
export interface HardwareAccelInfo {
  nvidia: boolean;
  intel: boolean;
  amd: boolean;
  available: string[];
}

function runFfmpegSync(ffmpegPath: string, args: string[]): { status: number | null; output: string } {
  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf-8",
    timeout: 7000,
  });

  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`.toLowerCase(),
  };
}

function encoderRuntimeProbe(ffmpegPath: string, encoder: string): boolean {
  const probe = runFfmpegSync(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=1280x720:rate=1",
    "-frames:v",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    encoder,
    "-f",
    "null",
    "-",
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.debug(`[DEBUG] Probing encoder ${encoder}:`, probe);
  }

  return probe.status === 0;
}

export function detectHardwareAcceleration(): HardwareAccelInfo {
  const info: HardwareAccelInfo = {
    nvidia: false,
    intel: false,
    amd: false,
    available: ["none"],
  };

  try {
    const ffmpegPath = process.env.FFMPEG_PATH || loadSettings().ffmpegPath || "ffmpeg";

    const hwAccelOutput = runFfmpegSync(ffmpegPath, ["-hide_banner", "-hwaccels"]).output;
    const encoderOutput = runFfmpegSync(ffmpegPath, ["-hide_banner", "-encoders"]).output;

    const nvidiaCompiled = hwAccelOutput.includes("cuda") || encoderOutput.includes("h264_nvenc");
    if (nvidiaCompiled && encoderRuntimeProbe(ffmpegPath, "h264_nvenc")) {
      info.nvidia = true;
      info.available.push("nvidia");
    }

    const intelCompiled = hwAccelOutput.includes("qsv") || encoderOutput.includes("h264_qsv");
    if (intelCompiled && encoderRuntimeProbe(ffmpegPath, "h264_qsv")) {
      info.intel = true;
      info.available.push("intel");
    }

    const amdCompiled = hwAccelOutput.includes("amf") || encoderOutput.includes("h264_amf");
    if (amdCompiled && encoderRuntimeProbe(ffmpegPath, "h264_amf")) {
      info.amd = true;
      info.available.push("amd");
    }

    if (info.nvidia || info.intel || info.amd) {
      info.available.unshift("auto");
    }
  } catch (error) {
    console.error("Failed to detect hardware acceleration:", error);
  }

  return info;
}

// Generate snapshot from RTSP stream
export function generateSnapshotArgs(rtspUrl: string, outputPath: string, settings: Settings): string[] {
  const args: string[] = [];
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";
  const rtspTimeoutFlag = resolveRtspTimeoutFlag(ffmpegPath);
  const rtspIoTimeoutUs = Math.max(0, Math.floor((settings.rtspSocketTimeoutMs ?? 10000) * 1000)).toString();
  const customArgs = parseCustomFFmpegArgs(settings.customFFmpegArgs);

  args.push("-rtsp_transport", settings.rtspTransport);
  args.push("-rtsp_flags", "prefer_tcp");
  args.push(rtspTimeoutFlag, rtspIoTimeoutUs);
  args.push(...customArgs);
  args.push("-i", rtspUrl);
  args.push("-vframes", "1");

  // Quality based on settings
  switch (settings.previewQuality) {
    case "low":
      args.push("-vf", "scale=320:-1");
      break;
    case "medium":
      args.push("-vf", "scale=640:-1");
      break;
    case "high":
      args.push("-vf", "scale=1280:-1");
      break;
  }

  args.push("-y", outputPath);

  return args;
}
