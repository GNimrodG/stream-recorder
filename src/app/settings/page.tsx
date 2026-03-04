import SettingsPageClient from "./SettingsPageClient";
import { detectHardwareAcceleration, loadSettings } from "@/lib/settings";
import { getStorageStats } from "@/lib/storage";

export default async function SettingsPage() {
  // Load settings directly from the file system
  const settings = loadSettings();

  // Detect hardware acceleration capabilities
  const hwInfo = detectHardwareAcceleration();

  // Get storage statistics
  const storageStats = getStorageStats();

  // Check for Docker environment and env vars
  const isDocker = !!process.env.DOCKER_ENV;
  const envVars = {
    FFMPEG_PATH: process.env.FFMPEG_PATH || null,
    RECORDINGS_OUTPUT_DIR: process.env.RECORDINGS_OUTPUT_DIR || null,
  };

  return (
    <SettingsPageClient
      initialSettings={settings}
      initialHwInfo={hwInfo}
      initialStorageStats={storageStats}
      isDocker={isDocker}
      envVars={envVars}
    />
  );
}
