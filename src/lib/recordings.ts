import { Recording, RecordingStats } from "@/types/recording";
import { ChildProcess, spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { buildFFmpegArgs, generateSnapshotArgs, loadSettings } from "./settings";

const RECORDINGS_FILE = process.env.RECORDINGS_DB_PATH || "./data/recordings.json";
const RECORDINGS_OUTPUT_DIR = process.env.RECORDINGS_OUTPUT_DIR || "./recordings";
const LOGS_DIR = process.env.LOGS_DIR || "./logs";

// In-memory store for active recording processes
const activeProcesses: Map<string, ChildProcess> = new Map();

// Track scheduled timers (for future starts and retries) so they can be cancelled
const scheduledTimers: Map<string, NodeJS.Timeout> = new Map();

// Cleanup scheduler
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup scheduler (runs every 3 hours) to delete old recordings and enforce storage limits
 */
export function startCleanupScheduler(): void {
  if (cleanupInterval) {
    return; // Already running
  }

  console.log("Starting automatic storage cleanup scheduler (runs every 3 hours)");

  // Run immediately on start
  setTimeout(() => runStorageCleanup(), 5000); // 5-second delay after startup

  // Then run every hour
  cleanupInterval = setInterval(
    () => {
      runStorageCleanup();
    },
    3 * 60 * 60 * 1000, // 3 hours
  );
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

// Helper to clear any scheduled timer for a recording id
function clearScheduledTimer(id: string) {
  const t = scheduledTimers.get(id);
  if (t) {
    clearTimeout(t);
    scheduledTimers.delete(id);
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
function saveRecordings(recordings: Recording[], writeToDisk = true): void {
  recordingsCache = recordings;

  if (!writeToDisk) return;
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
    // initialize retry tracking fields
    originalDuration: data.duration,
    remainingDuration: data.duration,
    retryCount: 0,
  };

  recordings.push(recording);
  saveRecordings(recordings);

  // Schedule the recording
  scheduleRecording(recording);

  return recording;
}

export function updateRecording(id: string, data: Partial<Recording>): Recording | null {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    return null;
  }

  const recording = recordings[index];

  // Don't allow updating if currently recording
  if (recording.status === "recording" || recording.status === "retrying") {
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

  // If a retry or scheduled start is pending, cancel it so it doesn't restart after delete
  clearScheduledTimer(id);

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
  // Clear any existing timer to avoid duplicates
  clearScheduledTimer(recording.id);

  const startTime = new Date(recording.startTime).getTime();
  const now = Date.now();
  const delay = startTime - now;

  if (delay <= 0) {
    // Start immediately if start time is in the past
    startRecording(recording.id);
  } else {
    // Schedule for later and store the timer so it can be cancelled
    const timer = setTimeout(() => {
      // remove reference once fired
      scheduledTimers.delete(recording.id);
      startRecording(recording.id);
    }, delay);
    scheduledTimers.set(recording.id, timer);
  }
}

export function startRecording(id: string): void {
  // Clear any scheduled timer for this id since we're starting now
  clearScheduledTimer(id);

  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    console.error(`Recording ${id} not found`);
    return;
  }

  const recording = recordings[index];

  // Allow starting when scheduled or when retrying (retry timer schedules a start)
  if (recording.status !== "scheduled" && recording.status !== "retrying") {
    console.error(`Recording ${id} is not in scheduled or retrying status`);
    return;
  }

  ensureDirectories();

  // Load settings for hardware acceleration and other options
  const settings = loadSettings();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sanitizedName = recording.name.replace(/[^a-zA-Z0-9]/g, "_");
  // include retryCount in filename to avoid overwriting previous attempts
  const attempt = (recording.attemptPaths?.length || 0) + 1;
  const outputFileName = `${sanitizedName}_${timestamp}_attempt${attempt}.${settings.outputFormat}`;
  // Priority: ENV var > settings > default
  const outputDir = process.env.RECORDINGS_OUTPUT_DIR || settings.outputDirectory || "./recordings";

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFileName);

  // Determine how many seconds to record for this attempt
  const durationToRecord = recording.remainingDuration ?? recording.duration;

  // Track attempt path list
  if (!recording.attemptPaths) {
    recording.attemptPaths = [];
  }
  recording.attemptPaths.push(outputPath);

  // Build FFmpeg command with settings (includes hardware acceleration)
  const ffmpegArgs = buildFFmpegArgs(recording.rtspUrl, outputPath, durationToRecord, settings);

  // Priority: ENV var > settings > default
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  console.log(
    `Starting recording (attempt ${attempt}) with ${settings.hardwareAcceleration} acceleration: ${ffmpegPath} ${ffmpegArgs.join(" ")}`,
  );

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

  activeProcesses.set(id, ffmpeg);

  // Update status to recording
  recording.status = "recording";
  recording.outputPath = path.join(outputDir, `${sanitizedName}_${timestamp}.${settings.outputFormat}`);
  recording.pid = ffmpeg.pid;
  recording.errorMessage = undefined;
  recording.startedAt = new Date().toISOString();
  // ensure originalDuration is set
  if (!recording.originalDuration) {
    recording.originalDuration = recording.duration;
  }
  recordings[index] = recording;
  saveRecordings(recordings);

  const logFilePath = path.join(LOGS_DIR, `${id}.log`);

  ffmpeg.stdout.on("data", (data) => {
    console.log(`[${id}] stdout: ${data}`);

    try {
      // Log FFmpeg output to a file for debugging
      fs.appendFileSync(logFilePath, data.toString(), { flag: "a" });
    } catch (error) {
      console.error(`Failed to write to log file for recording ${id}:`, error);
    }
  });

  let lastErrorMessage = "";

  ffmpeg.stderr.on("data", (data: string) => {
    console.log(`[${id}] stderr: ${data}`);
    lastErrorMessage = data.toString();

    try {
      // Log FFmpeg error output to a file for debugging
      fs.appendFileSync(logFilePath, data.toString(), { flag: "a" });
    } catch (error) {
      console.error(`Failed to write to log file for recording ${id}:`, error);
    }

    const line = data.toString();

    // Parse FFmpeg progress info
    if (line.includes("frame=")) {
      const currentRecordings = loadRecordings();
      const currentIndex = currentRecordings.findIndex((r) => r.id === id);

      if (currentIndex !== -1) {
        // reset the restart count if we see progress, indicating the stream is active
        currentRecordings[currentIndex].retryCount = 0;

        const frameMatch = line.match(/frame=\s*(\d+)/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        const timeMatch = line.match(/time=\s*([\d:.]+)/);
        const bitrateMatch = line.match(/bitrate=\s*([\d.]+k?bits\/s)/);
        const speedMatch = line.match(/speed=\s*([\d.]+x)/);

        if (frameMatch) {
          currentRecordings[currentIndex].frameCount = parseInt(frameMatch[1], 10);
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
        saveRecordings(currentRecordings, false); // update cache but defer file write for performance
      }
    }
  });

  ffmpeg.on("close", (code, signal) => {
    console.log(`[${id}] FFmpeg exited with code ${code} and signal ${signal}`);
    activeProcesses.delete(id);

    if (signal === "SIGTERM") {
      console.log(`[${id}] Recording was stopped by user`);
      updateRecordingStatus(id, "cancelled", "Recording stopped by user");
      return;
    }

    // Reload and update status
    const currentRecordings = loadRecordings();
    const currentIndex = currentRecordings.findIndex((r) => r.id === id);

    if (currentIndex !== -1) {
      if (currentRecordings[currentIndex].status === "cancelled") {
        console.log(`[${id}] Recording was cancelled, no further action needed`);
        return;
      }

      // Determine how long was recorded in this attempt
      const recordedTimeStr = currentRecordings[currentIndex].time;
      const recordedSeconds = recordedTimeStr ? parseTimeToSeconds(recordedTimeStr) : 0;

      const usedDuration = recording.remainingDuration ?? recording.duration;

      const toleranceSeconds = 1; // allow small rounding differences

      // If FFmpeg exited successfully, and we recorded enough, mark as completed
      if (code === 0 && recordedSeconds + toleranceSeconds >= usedDuration) {
        currentRecordings[currentIndex].status = "completed";
        currentRecordings[currentIndex].completedAt = new Date().toISOString();
        currentRecordings[currentIndex].updatedAt = new Date().toISOString();
        cleanRecordingStats(currentRecordings[currentIndex]);

        // Clear retry metadata
        currentRecordings[currentIndex].remainingDuration = undefined;
        currentRecordings[currentIndex].retryCount = undefined;
        saveRecordings(currentRecordings);

        // Run storage cleanup after successful recording
        setTimeout(() => {
          runStorageCleanup();
        }, 1000);

        // If multiple attempt files exist, merge them into a single file
        const attempts = currentRecordings[currentIndex].attemptPaths || [];
        if (attempts.length > 1) {
          try {
            const finalPath = currentRecordings[currentIndex].outputPath!;
            mergeRecordingParts(attempts, finalPath);

            // Remove partial files after successful merge (except finalPath)
            for (const p of attempts) {
              if (p !== finalPath && fs.existsSync(p)) {
                try {
                  fs.unlinkSync(p);
                } catch (err) {
                  console.error(`Failed to delete partial file ${p}:`, err);
                }
              }
            }

            // Update recorded entry to only reference finalPath and clear attemptPaths
            currentRecordings[currentIndex].attemptPaths = [finalPath];
            saveRecordings(currentRecordings);
          } catch (err) {
            console.error(`Failed to merge partial recordings for ${id}:`, err);
          }
        }

        return;
      }

      // If we reach here, recording ended prematurely or with error
      const maxRetries = settings.reconnectAttempts ?? 0;
      const currentRetry = currentRecordings[currentIndex].retryCount || 0;
      const remaining =
        (currentRecordings[currentIndex].remainingDuration ?? currentRecordings[currentIndex].duration) -
        recordedSeconds;

      if (remaining < 1) {
        // If remaining is negligible, mark completed
        currentRecordings[currentIndex].status = "completed";
        currentRecordings[currentIndex].completedAt = new Date().toISOString();
        currentRecordings[currentIndex].updatedAt = new Date().toISOString();
        cleanRecordingStats(currentRecordings[currentIndex]);
        saveRecordings(currentRecordings);
        return;
      }

      if (currentRetry < maxRetries) {
        // Schedule a retry after reconnectDelay seconds
        currentRecordings[currentIndex].retryCount = currentRetry + 1;
        currentRecordings[currentIndex].remainingDuration = Math.ceil(remaining);
        currentRecordings[currentIndex].status = "retrying";
        currentRecordings[currentIndex].updatedAt = new Date().toISOString();
        cleanRecordingStats(currentRecordings[currentIndex]);
        // Preserve error message
        if (code !== 0) {
          currentRecordings[currentIndex].errorMessage = `FFmpeg exited with code ${code}: ${lastErrorMessage}`;
        } else {
          currentRecordings[currentIndex].errorMessage = `Premature exit after ${recordedSeconds}s, will retry`;
        }
        saveRecordings(currentRecordings);

        const delayMs = (settings.reconnectDelay || 5) * 1000;
        console.log(
          `Scheduling retry ${currentRecordings[currentIndex].retryCount} for recording ${id} in ${delayMs / 1000}s (remaining ${currentRecordings[currentIndex].remainingDuration}s)`,
        );

        // Store the retry timer so it can be cancelled if needed (eg. delete)
        const retryTimer = setTimeout(() => {
          scheduledTimers.delete(id);
          startRecording(id);
        }, delayMs);
        scheduledTimers.set(id, retryTimer);

        return;
      }

      // No retries left: mark as failed
      endRecordingAsFailed(id, `Recording failed after ${currentRetry} retries. Last error: ${lastErrorMessage}`);
      saveRecordings(currentRecordings);

      return;
    }
  });

  ffmpeg.on("error", (err) => {
    console.error(`[${id}] FFmpeg error:`, err);
    activeProcesses.delete(id);

    const currentRecordings = loadRecordings();
    const currentIndex = currentRecordings.findIndex((r) => r.id === id);

    if (currentIndex !== -1) {
      endRecordingAsFailed(id, `FFmpeg process error: ${err.message}`);
      saveRecordings(currentRecordings);
    }
  });
}

export function stopRecording(id: string): boolean {
  const process = activeProcesses.get(id);

  const recordings = loadRecordings();
  const recording = recordings.find((r) => r.id === id);

  if (recording && recording.status === "recording") {
    if (process) {
      process.kill("SIGTERM");
      console.log(`Sent stop signal to recording ${id}`);

      return true;
    }
  }

  if (recording && recording.status === "retrying") {
    // If it's retrying, we just need to cancel the scheduled retry
    clearScheduledTimer(id);
    updateRecordingStatus(id, "cancelled", "Scheduled retry cancelled by user");
    console.log(`Cancelled scheduled retry for recording ${id}`);

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
        endRecordingAsFailed(recording.id, "Missed scheduled start time");
      }
    } else if (recording.status === "recording") {
      // Mark interrupted recordings as failed
      endRecordingAsFailed(recording.id, "Recording was interrupted by server restart");
    }
  });

  saveRecordings(recordings);
}

function endRecordingAsFailed(id: string, errorMessage: string): void {
  updateRecordingStatus(id, "failed", errorMessage);
}

function updateRecordingStatus(id: string, status: Recording["status"], errorMessage?: string): void {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index !== -1) {
    recordings[index].status = status;
    recordings[index].errorMessage = errorMessage?.trim();
    recordings[index].updatedAt = new Date().toISOString();
    cleanRecordingStats(recordings[index]);
    saveRecordings(recordings);
  }
}

function cleanRecordingStats(recording: Recording): void {
  recording.pid = undefined;
  recording.fps = undefined;
  recording.frameCount = undefined;
  recording.time = undefined;
  recording.bitrate = undefined;
  recording.speed = undefined;
}

export function captureSnapshot(url: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settings = loadSettings();
    const args = generateSnapshotArgs(url, outputPath, settings);
    const ffmpeg = spawn(settings.ffmpegPath, args, { timeout: 10000 });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);

    // Timeout after 10 seconds
    setTimeout(() => {
      ffmpeg.kill();
      reject(new Error("Snapshot timeout"));
    }, 10000);
  });
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
  const cutoffDate = new Date(now.getTime() - settings.autoDeleteAfterDays * 24 * 60 * 60 * 1000);

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
            console.log(`Auto-deleted old recording: ${recording.name} (${recording.outputPath})`);
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
        console.log(`Deleted recording to free space: ${recording.name} (${fileGB.toFixed(2)} GB)`);

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

// Merge multiple partial recordings into a single file using ffmpeg concat demuxer
function mergeRecordingParts(partPaths: string[], finalPath: string): void {
  if (!partPaths || partPaths.length === 0) return;
  if (partPaths.length === 1) {
    // Nothing to merge, just ensure finalPath points to the single part
    const single = partPaths[0];
    if (single !== finalPath) {
      try {
        fs.renameSync(single, finalPath);
      } catch (err) {
        throw new Error(`Failed to move ${single} to ${finalPath}: ${err}`);
      }
    }
    return;
  }

  // Create a temporary list file with paths escaped for ffmpeg concat
  const listFile = path.join(path.dirname(finalPath), `concat_${path.basename(finalPath)}.txt`);
  const lines = partPaths.map((p) => `file '${path.basename(p).replace(/'/g, "'\\''")}'`);

  try {
    fs.writeFileSync(listFile, lines.join("\n"), { encoding: "utf-8" });
  } catch (err) {
    throw new Error(`Failed to write concat list file: ${err}`);
  }

  const settings = loadSettings();
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  // Run ffmpeg to concat
  const args = ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-y", finalPath];

  console.log(`Merging ${partPaths.length} parts into final recording: ${ffmpegPath} ${args.join(" ")}`);
  const res = spawnSync(ffmpegPath, args, { encoding: "utf-8" });
  console.log(`FFmpeg concat stdout: ${res.stdout}`);

  // Remove the list file
  try {
    fs.unlinkSync(listFile);
  } catch (err) {
    console.warn(`Failed to remove temporary concat list ${listFile}: ${err}`);
  }

  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`FFmpeg concat failed: ${res.stderr || res.stdout}`);
  }
}

// Helper: parse FFmpeg time string (HH:MM:SS.micro) into seconds
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  // Some ffmpeg time outputs may look like 00:00:05.00 or 00:00:05
  const parts = timeStr.split(":").map((p) => p.trim());
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  // fallback
  const num = parseFloat(timeStr);
  return isNaN(num) ? 0 : num;
}
