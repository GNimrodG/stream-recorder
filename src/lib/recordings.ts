import { Recording, RecordingStats } from "@/types/recording";
import { ChildProcess, spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs, loadSettings } from "./settings";

const RECORDINGS_FILE =
  process.env.RECORDINGS_DB_PATH || "./data/recordings.json";
const RECORDINGS_OUTPUT_DIR =
  process.env.RECORDINGS_OUTPUT_DIR || "./recordings";
const LOGS_DIR = process.env.LOGS_DIR || "./logs";

// In-memory store for active recording processes
const activeProcesses: Map<string, ChildProcess> = new Map();

// Cleanup scheduler
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup scheduler (runs every hour)
 */
export function startCleanupScheduler(): void {
  if (cleanupInterval) {
    return; // Already running
  }

  console.log("Starting automatic storage cleanup scheduler (runs every hour)");

  // Run immediately on start
  setTimeout(() => runStorageCleanup(), 5000); // 5 second delay after startup

  // Then run every hour
  cleanupInterval = setInterval(
    () => {
      runStorageCleanup();
    },
    60 * 60 * 1000,
  ); // 1 hour
}

/**
 * Stop automatic cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("Stopped automatic storage cleanup scheduler");
  }
}

// Ensure directories exist
function ensureDirectories() {
  const dataDir = path.dirname(RECORDINGS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(RECORDINGS_OUTPUT_DIR)) {
    fs.mkdirSync(RECORDINGS_OUTPUT_DIR, { recursive: true });
  }
}

// Cache for recordings to minimize file I/O
let recordingsCache: Recording[] | null = null;

// Load recordings from file
function loadRecordings(): Recording[] {
  if (recordingsCache) {
    return recordingsCache;
  }

  ensureDirectories();
  if (!fs.existsSync(RECORDINGS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(RECORDINGS_FILE, "utf-8");
    recordingsCache = JSON.parse(data);
    return recordingsCache!;
  } catch {
    return [];
  }
}

// Save recordings to file
function saveRecordings(recordings: Recording[]): void {
  recordingsCache = recordings;
  ensureDirectories();
  fs.writeFileSync(RECORDINGS_FILE, JSON.stringify(recordings, null, 2));
}

export function getAllRecordings(): Recording[] {
  return loadRecordings();
}

export function getRecordingById(id: string): Recording | undefined {
  const recordings = loadRecordings();
  return recordings.find((r) => r.id === id);
}

export function createRecording(data: {
  name: string;
  rtspUrl: string;
  startTime: string;
  duration: number;
}): Recording {
  const recordings = loadRecordings();
  const now = new Date().toISOString();

  const recording: Recording = {
    id: randomUUID(),
    name: data.name,
    rtspUrl: data.rtspUrl,
    startTime: data.startTime,
    duration: data.duration,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };

  recordings.push(recording);
  saveRecordings(recordings);

  // Schedule the recording
  scheduleRecording(recording);

  return recording;
}

export function updateRecording(
  id: string,
  data: Partial<Recording>,
): Recording | null {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    return null;
  }

  const recording = recordings[index];

  // Don't allow updating if currently recording
  if (recording.status === "recording") {
    throw new Error("Cannot update a recording in progress");
  }

  const updatedRecording: Recording = {
    ...recording,
    ...data,
    id: recording.id, // Prevent id change
    updatedAt: new Date().toISOString(),
  };

  recordings[index] = updatedRecording;
  saveRecordings(recordings);

  // Reschedule if still scheduled
  if (updatedRecording.status === "scheduled") {
    scheduleRecording(updatedRecording);
  }

  return updatedRecording;
}

export function deleteRecording(id: string): boolean {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    return false;
  }

  const recording = recordings[index];

  // Stop if currently recording
  if (recording.status === "recording") {
    stopRecording(id);
  }

  // Delete output file if exists
  if (recording.outputPath && fs.existsSync(recording.outputPath)) {
    fs.unlinkSync(recording.outputPath);
  }

  recordings.splice(index, 1);
  saveRecordings(recordings);

  return true;
}

export function getRecordingStats(): RecordingStats {
  const recordings = loadRecordings();
  return {
    total: recordings.length,
    scheduled: recordings.filter((r) => r.status === "scheduled").length,
    recording: recordings.filter((r) => r.status === "recording").length,
    completed: recordings.filter((r) => r.status === "completed").length,
    failed: recordings.filter((r) => r.status === "failed").length,
  };
}

function scheduleRecording(recording: Recording): void {
  const startTime = new Date(recording.startTime).getTime();
  const now = Date.now();
  const delay = startTime - now;

  if (delay <= 0) {
    // Start immediately if start time is in the past
    startRecording(recording.id);
  } else {
    // Schedule for later
    setTimeout(() => {
      startRecording(recording.id);
    }, delay);
  }
}

export function startRecording(id: string): void {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    console.error(`Recording ${id} not found`);
    return;
  }

  const recording = recordings[index];

  if (recording.status !== "scheduled") {
    console.error(`Recording ${id} is not in scheduled status`);
    return;
  }

  ensureDirectories();

  // Load settings for hardware acceleration and other options
  const settings = loadSettings();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sanitizedName = recording.name.replace(/[^a-zA-Z0-9]/g, "_");
  const outputFileName = `${sanitizedName}_${timestamp}.${settings.outputFormat}`;
  // Priority: ENV var > settings > default
  const outputDir =
    process.env.RECORDINGS_OUTPUT_DIR ||
    settings.outputDirectory ||
    "./recordings";

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFileName);

  // Build FFmpeg command with settings (includes hardware acceleration)
  const ffmpegArgs = buildFFmpegArgs(
    recording.rtspUrl,
    outputPath,
    recording.duration,
    settings,
  );

  // Priority: ENV var > settings > default
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  console.log(
    `Starting recording with ${settings.hardwareAcceleration} acceleration: ${ffmpegPath} ${ffmpegArgs.join(" ")}`,
  );

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

  activeProcesses.set(id, ffmpeg);

  // Update status to recording
  recording.status = "recording";
  recording.outputPath = outputPath;
  recording.pid = ffmpeg.pid;
  recording.updatedAt = new Date().toISOString();
  recordings[index] = recording;
  saveRecordings(recordings);

  ffmpeg.stdout.on("data", (data) => {
    console.log(`[${id}] stdout: ${data}`);

    // Log FFmpeg output to a file for debugging
    const logFilePath = path.join(LOGS_DIR, `${id}.log`);
    fs.appendFileSync(logFilePath, data.toString());
  });

  let lastErrorMessage = "";

  ffmpeg.stderr.on("data", (data: string) => {
    console.log(`[${id}] stderr: ${data}`);
    lastErrorMessage = data.toString();

    // Log FFmpeg error output to a file for debugging
    const logFilePath = path.join(LOGS_DIR, `${id}.log`);
    fs.appendFileSync(logFilePath, data.toString());

    const line = data.toString();

    // Parse FFmpeg progress info
    if (line.includes("frame=")) {
      const frameMatch = line.match(/frame=\s*(\d+)/);
      const fpsMatch = line.match(/fps=\s*([\d.]+)/);
      const timeMatch = line.match(/time=\s*([\d:.]+)/);
      const bitrateMatch = line.match(/bitrate=\s*([\d.]+k?bits\/s)/);
      const speedMatch = line.match(/speed=\s*([\d.]+x)/);

      const currentRecordings = loadRecordings();
      const currentIndex = currentRecordings.findIndex((r) => r.id === id);

      if (currentIndex !== -1) {
        if (frameMatch) {
          currentRecordings[currentIndex].frameCount = parseInt(
            frameMatch[1],
            10,
          );
        }
        if (fpsMatch) {
          currentRecordings[currentIndex].fps = parseFloat(fpsMatch[1]);
        }
        if (timeMatch) {
          currentRecordings[currentIndex].time = timeMatch[1];
        }
        if (bitrateMatch) {
          currentRecordings[currentIndex].bitrate = bitrateMatch[1];
        }
        if (speedMatch) {
          currentRecordings[currentIndex].speed = parseFloat(speedMatch[1]);
        }
        saveRecordings(currentRecordings);
      }
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`[${id}] FFmpeg exited with code ${code}`);
    activeProcesses.delete(id);

    // Reload and update status
    const currentRecordings = loadRecordings();
    const currentIndex = currentRecordings.findIndex((r) => r.id === id);

    if (currentIndex !== -1) {
      currentRecordings[currentIndex].status =
        code === 0 ? "completed" : "failed";
      currentRecordings[currentIndex].updatedAt = new Date().toISOString();
      if (code === 0) {
        currentRecordings[currentIndex].completedAt = new Date().toISOString();
      }
      if (code !== 0) {
        currentRecordings[currentIndex].errorMessage =
          `FFmpeg exited with code ${code}: ${lastErrorMessage}`;
      }
      currentRecordings[currentIndex].pid = undefined;
      currentRecordings[currentIndex].fps = undefined;
      currentRecordings[currentIndex].frameCount = undefined;
      currentRecordings[currentIndex].time = undefined;
      currentRecordings[currentIndex].bitrate = undefined;
      currentRecordings[currentIndex].speed = undefined;
      saveRecordings(currentRecordings);

      // Run storage cleanup after successful recording
      if (code === 0) {
        setTimeout(() => {
          runStorageCleanup();
        }, 1000); // Delay slightly to ensure file is written
      }
    }
  });

  ffmpeg.on("error", (err) => {
    console.error(`[${id}] FFmpeg error:`, err);
    activeProcesses.delete(id);

    const currentRecordings = loadRecordings();
    const currentIndex = currentRecordings.findIndex((r) => r.id === id);

    if (currentIndex !== -1) {
      currentRecordings[currentIndex].status = "failed";
      currentRecordings[currentIndex].errorMessage = err.message;
      currentRecordings[currentIndex].updatedAt = new Date().toISOString();
      currentRecordings[currentIndex].pid = undefined;
      saveRecordings(currentRecordings);
    }
  });
}

export function stopRecording(id: string): boolean {
  const process = activeProcesses.get(id);

  if (process) {
    process.kill("SIGTERM");
    activeProcesses.delete(id);

    const recordings = loadRecordings();
    const index = recordings.findIndex((r) => r.id === id);

    if (index !== -1) {
      recordings[index].status = "cancelled";
      recordings[index].updatedAt = new Date().toISOString();
      recordings[index].pid = undefined;
      saveRecordings(recordings);
    }

    return true;
  }

  return false;
}

// Initialize: reschedule any pending recordings on startup
export function initializeRecordings(): void {
  const recordings = loadRecordings();
  const now = Date.now();

  recordings.forEach((recording) => {
    if (recording.status === "scheduled") {
      const startTime = new Date(recording.startTime).getTime();
      if (startTime > now) {
        scheduleRecording(recording);
      } else {
        // Mark as failed if start time has passed
        recording.status = "failed";
        recording.errorMessage = "Missed scheduled start time";
        recording.updatedAt = new Date().toISOString();
      }
    } else if (recording.status === "recording") {
      // Mark interrupted recordings as failed
      recording.status = "failed";
      recording.errorMessage = "Recording was interrupted by server restart";
      recording.updatedAt = new Date().toISOString();
      recording.pid = undefined;
      recording.fps = undefined;
      recording.frameCount = undefined;
      recording.time = undefined;
      recording.bitrate = undefined;
      recording.speed = undefined;
    }
  });

  saveRecordings(recordings);
}

// Storage management functions

/**
 * Get the total size of all recordings in GB
 */
function getTotalStorageUsed(): number {
  const recordings = loadRecordings();
  let totalBytes = 0;

  for (const recording of recordings) {
    if (recording.outputPath && fs.existsSync(recording.outputPath)) {
      try {
        const stats = fs.statSync(recording.outputPath);
        totalBytes += stats.size;
      } catch (error) {
        console.error(`Failed to get size for ${recording.outputPath}:`, error);
      }
    }
  }

  // Convert bytes to GB
  return totalBytes / (1024 * 1024 * 1024);
}

/**
 * Delete old recordings based on autoDeleteAfterDays setting
 * Returns the number of recordings deleted
 */
export function cleanupOldRecordings(): number {
  const settings = loadSettings();

  // If autoDeleteAfterDays is 0, don't delete anything
  if (settings.autoDeleteAfterDays <= 0) {
    return 0;
  }

  const recordings = loadRecordings();
  const now = new Date();
  const cutoffDate = new Date(
    now.getTime() - settings.autoDeleteAfterDays * 24 * 60 * 60 * 1000,
  );

  let deletedCount = 0;
  const recordingsToKeep: Recording[] = [];

  for (const recording of recordings) {
    // Only delete completed recordings
    if (recording.status === "completed" && recording.completedAt) {
      const completedDate = new Date(recording.completedAt);
      if (completedDate < cutoffDate) {
        // Delete the file
        if (recording.outputPath && fs.existsSync(recording.outputPath)) {
          try {
            fs.unlinkSync(recording.outputPath);
            console.log(
              `Auto-deleted old recording: ${recording.name} (${recording.outputPath})`,
            );
          } catch (error) {
            console.error(`Failed to delete ${recording.outputPath}:`, error);
            // Keep the recording in DB if we couldn't delete the file
            recordingsToKeep.push(recording);
            continue;
          }
        }
        deletedCount++;
        continue;
      }
    }
    recordingsToKeep.push(recording);
  }

  if (deletedCount > 0) {
    saveRecordings(recordingsToKeep);
    console.log(`Cleaned up ${deletedCount} old recording(s)`);
  }

  return deletedCount;
}

/**
 * Delete oldest recordings until storage is under maxStorageGB limit
 * Returns the number of recordings deleted
 */
export function enforceStorageLimit(): number {
  const settings = loadSettings();

  // If maxStorageGB is 0, don't enforce limit
  if (settings.maxStorageGB <= 0) {
    return 0;
  }

  let currentStorageGB = getTotalStorageUsed();

  // If we're under the limit, nothing to do
  if (currentStorageGB <= settings.maxStorageGB) {
    return 0;
  }

  const recordings = loadRecordings();

  // Get completed recordings sorted by completion date (oldest first)
  const completedRecordings = recordings
    .filter((r) => r.status === "completed" && r.completedAt && r.outputPath)
    .sort((a, b) => {
      const dateA = new Date(a.completedAt!).getTime();
      const dateB = new Date(b.completedAt!).getTime();
      return dateA - dateB;
    });

  let deletedCount = 0;

  for (const recording of completedRecordings) {
    if (currentStorageGB <= settings.maxStorageGB) {
      break;
    }

    if (recording.outputPath && fs.existsSync(recording.outputPath)) {
      try {
        const stats = fs.statSync(recording.outputPath);
        const fileGB = stats.size / (1024 * 1024 * 1024);

        fs.unlinkSync(recording.outputPath);
        console.log(
          `Deleted recording to free space: ${recording.name} (${fileGB.toFixed(2)} GB)`,
        );

        currentStorageGB -= fileGB;
        deletedCount++;

        // Remove from recordings list
        const index = recordings.findIndex((r) => r.id === recording.id);
        if (index !== -1) {
          recordings.splice(index, 1);
        }
      } catch (error) {
        console.error(`Failed to delete ${recording.outputPath}:`, error);
      }
    }
  }

  if (deletedCount > 0) {
    saveRecordings(recordings);
    console.log(
      `Freed up space by deleting ${deletedCount} recording(s). Current storage: ${currentStorageGB.toFixed(2)} GB`,
    );
  }

  return deletedCount;
}

/**
 * Run all cleanup tasks
 */
export function runStorageCleanup(): {
  deletedOld: number;
  deletedForSpace: number;
  currentStorageGB: number;
} {
  console.log("Running storage cleanup...");

  const deletedOld = cleanupOldRecordings();
  const deletedForSpace = enforceStorageLimit();
  const currentStorageGB = getTotalStorageUsed();

  console.log(
    `Cleanup complete: ${deletedOld} old recordings, ${deletedForSpace} for space, ${currentStorageGB.toFixed(2)} GB used`,
  );

  return { deletedOld, deletedForSpace, currentStorageGB };
}

/**
 * Get storage statistics
 */
export function getStorageStats(): {
  usedGB: number;
  maxGB: number;
  percentage: number;
  autoDeleteDays: number;
} {
  const settings = loadSettings();
  const usedGB = getTotalStorageUsed();
  const maxGB = settings.maxStorageGB;
  const percentage = maxGB > 0 ? (usedGB / maxGB) * 100 : 0;

  return {
    usedGB,
    maxGB,
    percentage,
    autoDeleteDays: settings.autoDeleteAfterDays,
  };
}
