import { NextRequest, NextResponse } from "next/server";
import {
  detectHardwareAcceleration,
  loadSettings,
  updateSettings,
} from "@/lib/settings";
import { Settings } from "@/types/settings";
import fs from "fs";

// Check if running in Docker by looking for /.dockerenv or /proc/1/cgroup
function isRunningInDocker(): boolean {
  try {
    // Check for .dockerenv file
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }

    // Check /proc/1/cgroup for docker
    if (fs.existsSync("/proc/1/cgroup")) {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
      return cgroup.includes("docker");
    }

    return false;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hwInfo = searchParams.get("hwinfo");

  if (hwInfo === "true") {
    const info = detectHardwareAcceleration();
    return NextResponse.json(info);
  }

  const settings = loadSettings();
  const isDocker = isRunningInDocker();

  // Include environment variable values for transparency
  const envVars = {
    FFMPEG_PATH: process.env.FFMPEG_PATH || null,
    RECORDINGS_OUTPUT_DIR: process.env.RECORDINGS_OUTPUT_DIR || null,
  };

  return NextResponse.json({ ...settings, isDocker, envVars });
}

export async function PATCH(request: NextRequest) {
  try {
    const body: Partial<Settings> = await request.json();
    const updatedSettings = updateSettings(body);
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: Settings = await request.json();
    const updatedSettings = updateSettings(body);
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
