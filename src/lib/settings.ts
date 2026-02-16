import { defaultSettings, Settings } from "@/types/settings";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SETTINGS_FILE = process.env.SETTINGS_FILE_PATH || "./data/settings.json";

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

let cachedSettings: Settings | null = null;

export function loadSettings(): Settings {
  if (cachedSettings) {
    return cachedSettings;
  }

  ensureDataDir();

  if (!fs.existsSync(SETTINGS_FILE)) {
    saveSettings(defaultSettings);
    return defaultSettings;
  }

  try {
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);
    // Merge with defaults to ensure all fields exist
    return (cachedSettings = { ...defaultSettings, ...settings });
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  cachedSettings = settings;
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

export function detectHardwareAcceleration(): HardwareAccelInfo {
  const info: HardwareAccelInfo = {
    nvidia: false,
    intel: false,
    amd: false,
    available: ["none"],
  };

  try {
    // Try to get FFmpeg hardware acceleration info
    const output = execSync("ffmpeg -hide_banner -hwaccels", {
      encoding: "utf-8",
      timeout: 5000,
    });

    const lines = output.toLowerCase();

    if (
      lines.includes("cuda") ||
      lines.includes("nvenc") ||
      lines.includes("cuvid")
    ) {
      info.nvidia = true;
      info.available.push("nvidia");
    }

    if (lines.includes("qsv") || lines.includes("vaapi")) {
      info.intel = true;
      info.available.push("intel");
    }

    if (lines.includes("amf") || lines.includes("vaapi")) {
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

// Build FFmpeg arguments based on settings
export function buildFFmpegArgs(
  rtspUrl: string,
  outputPath: string,
  duration: number,
  settings: Settings,
): string[] {
  const args: string[] = [];

  // Hardware acceleration input options
  if (settings.hardwareAcceleration !== "none") {
    const hwAccel = getHardwareAccelArgs(settings.hardwareAcceleration);
    args.push(...hwAccel.input);
  }

  // RTSP transport
  args.push("-rtsp_transport", settings.rtspTransport);

  // RTSP-specific options for better stability
  args.push("-rtsp_flags", "prefer_tcp");

  // Input
  args.push("-i", rtspUrl);

  // Video codec
  if (settings.videoCodec === "copy") {
    args.push("-c:v", "copy");
  } else {
    const videoEncoder = getVideoEncoder(
      settings.videoCodec,
      settings.hardwareAcceleration,
    );
    args.push("-c:v", videoEncoder);
  }

  // Audio codec
  if (settings.audioCodec === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", settings.audioCodec);
  }

  // Duration
  args.push("-t", duration.toString());

  // Output format specific options
  if (settings.outputFormat === "mp4") {
    args.push("-movflags", "+faststart");
  }

  // Overwrite output
  args.push("-y");

  // Output file
  args.push(outputPath);

  return args;
}

function getHardwareAccelArgs(hwAccel: Settings["hardwareAcceleration"]): {
  input: string[];
  output: string[];
} {
  switch (hwAccel) {
    case "nvidia":
      return {
        input: ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
        output: [],
      };
    case "intel":
      return {
        input: ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
        output: [],
      };
    case "amd":
      return {
        input: ["-hwaccel", "amf"],
        output: [],
      };
    case "auto":
      // Try CUDA first (most common), then QSV, then AMF
      return {
        input: ["-hwaccel", "auto"],
        output: [],
      };
    default:
      return { input: [], output: [] };
  }
}

function getVideoEncoder(
  codec: string,
  hwAccel: Settings["hardwareAcceleration"],
): string {
  if (hwAccel === "none") {
    switch (codec) {
      case "h264":
        return "libx264";
      case "h265":
        return "libx265";
      case "vp9":
        return "libvpx-vp9";
      default:
        return "libx264";
    }
  }

  if (hwAccel === "nvidia") {
    switch (codec) {
      case "h264":
        return "h264_nvenc";
      case "h265":
        return "hevc_nvenc";
      default:
        return "h264_nvenc";
    }
  }

  if (hwAccel === "intel") {
    switch (codec) {
      case "h264":
        return "h264_qsv";
      case "h265":
        return "hevc_qsv";
      case "vp9":
        return "vp9_qsv";
      default:
        return "h264_qsv";
    }
  }

  if (hwAccel === "amd") {
    switch (codec) {
      case "h264":
        return "h264_amf";
      case "h265":
        return "hevc_amf";
      default:
        return "h264_amf";
    }
  }

  // Auto mode - try to use hardware encoder
  switch (codec) {
    case "h264":
      return "h264_nvenc";
    case "h265":
      return "hevc_nvenc";
    default:
      return "libx264";
  }
}

// Generate snapshot from RTSP stream
export function generateSnapshotArgs(
  rtspUrl: string,
  outputPath: string,
  settings: Settings,
): string[] {
  const args: string[] = [];

  args.push("-rtsp_transport", settings.rtspTransport);
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
