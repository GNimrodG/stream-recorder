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

    if (lines.includes("cuda") || lines.includes("nvenc") || lines.includes("cuvid")) {
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

// Generate snapshot from RTSP stream
export function generateSnapshotArgs(rtspUrl: string, outputPath: string, settings: Settings): string[] {
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
