import {
  Recording,
  RecordingFilterStatus,
  RecordingPaginationMeta,
  RecordingStats,
  RecordingWithStatus,
} from "@/types/recording";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { RecordingManager } from "@/lib/RecordingManager";
import { runStorageCleanup } from "@/lib/storage";

const RECORDINGS_FILE = process.env.RECORDINGS_DB_PATH || "./data/recordings.json";
const RECORDINGS_OUTPUT_DIR = process.env.RECORDINGS_OUTPUT_DIR || "./recordings";

// Cleanup scheduler
let cleanupInterval: NodeJS.Timeout | null = null;
let initialized = false;

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

// Cache for recordings to minimize file I/O
let recordingsCache: Recording[] | null = null;
let cachedFileModifiedTime: number = 0;

// Load recordings from file
function loadRecordings(): Recording[] {
  ensureDirectories();

  if (!fs.existsSync(RECORDINGS_FILE)) {
    recordingsCache = [];
    cachedFileModifiedTime = 0;
    return [];
  }

  try {
    // Check if file has been modified since last cache
    const stats = fs.statSync(RECORDINGS_FILE);
    const fileModifiedTime = stats.mtimeMs;

    // Use cache if it exists and file hasn't been modified
    if (recordingsCache && fileModifiedTime === cachedFileModifiedTime) {
      return recordingsCache;
    }

    // File has been modified or no cache exists, read from disk
    const data = fs.readFileSync(RECORDINGS_FILE, "utf-8");
    recordingsCache = JSON.parse(data);
    cachedFileModifiedTime = fileModifiedTime;
    return recordingsCache!;
  } catch {
    recordingsCache = [];
    cachedFileModifiedTime = 0;
    return [];
  }
}

/**
 * Save recordings to file and update cache. If writeToDisk is false, only update cache without writing to disk (used for performance when updating progress stats)
 * @param recordings - array of recordings to save
 * @param writeToDisk - whether to write to disk or just update in-memory cache (default: true)
 */
export function saveRecordings(recordings: Recording[], writeToDisk = true): void {
  recordingsCache = recordings;

  if (!writeToDisk) return;

  ensureDirectories();
  fs.writeFileSync(RECORDINGS_FILE, JSON.stringify(recordings, null, 2));

  // Update cached file modified time after writing
  try {
    const stats = fs.statSync(RECORDINGS_FILE);
    cachedFileModifiedTime = stats.mtimeMs;
  } catch {
    cachedFileModifiedTime = 0;
  }
}

export function getAllRecordings(): Recording[] {
  return loadRecordings();
}

function getRecordingStatus(recording: Recording): RecordingWithStatus {
  const manager = RecordingManager.getInstance(recording.id);

  if (!manager) {
    // If no manager exists, determine status based on success field
    const status = recording.success === undefined ? "scheduled" : recording.success ? "completed" : "failed";
    return {
      ...recording,
      status,
      isIgnoringLiveStatus: false,
    };
  }

  return {
    ...recording,
    status: manager.currentStatus,
    frames: manager.frames,
    fps: manager.currentFps,
    time: manager.currentTime,
    bitrate: manager.currentBitrate,
    speed: manager.currentSpeed,
    isIgnoringLiveStatus: manager.isIgnoringStreamStatus,
  };
}

export function getAllRecordingsWithStats(): RecordingWithStatus[] {
  const recordings = loadRecordings();

  return recordings.map((recording) => getRecordingStatus(recording));
}

export function getPaginatedRecordingsWithStats(options: {
  page: number;
  pageSize: number;
  status?: RecordingFilterStatus;
}): { data: RecordingWithStatus[]; pagination: RecordingPaginationMeta } {
  const page = Math.max(1, options.page);
  const pageSize = Math.max(1, options.pageSize);
  const status = options.status ?? "all";

  const sortedRecordings = getAllRecordingsWithStats().toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const filteredRecordings =
    status === "all" ? sortedRecordings : sortedRecordings.filter((recording) => recording.status === status);

  const total = filteredRecordings.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const data = filteredRecordings.slice(startIndex, startIndex + pageSize);

  return {
    data,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export function getRecordingById(id: string): Recording | undefined {
  const recordings = loadRecordings();
  return recordings.find((r) => r.id === id);
}

export function getRecordingWithStatsById(id: string): RecordingWithStatus | undefined {
  const recording = getRecordingById(id);
  if (!recording) {
    return undefined;
  }

  return getRecordingStatus(recording);
}

export function createRecording(data: {
  name: string;
  rtspUrl: string;
  startTime: string;
  duration: number;
  sourceStreamId?: string;
  autoStopWhenStreamOffline?: boolean;
}): Recording {
  const recordings = loadRecordings();
  const now = new Date().toISOString();

  const recording: Recording = {
    id: randomUUID(),
    name: data.name,
    rtspUrl: data.rtspUrl,
    startTime: data.startTime,
    duration: data.duration,
    sourceStreamId: data.sourceStreamId,
    autoStopWhenStreamOffline: data.autoStopWhenStreamOffline,
    createdAt: now,
    updatedAt: now,
  };

  recordings.push(recording);
  saveRecordings(recordings);

  new RecordingManager(recording.id, recording.name, recording.rtspUrl, recording.startTime, recording.duration);

  return recording;
}

export function updateRecording(id: string, data: Partial<Recording>): Recording | null {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    return null;
  }

  let recordingManager = RecordingManager.getInstance(id);

  if (!recordingManager) {
    if (recordings[index].success === undefined) {
      // If no manager exists but recording is pending, create a new manager to ensure it starts correctly
      recordingManager = createRecordingManager(recordings[index]);
    } else {
      throw new Error("This recording has already completed and cannot be updated");
    }
  }

  const recording = recordings[index];

  // Don't allow updating if currently recording
  if (recordingManager.hasStarted()) {
    throw new Error("Cannot update a recording in progress");
  }

  if (recordingManager.hasCompleted()) {
    throw new Error("Cannot update a recording that has already completed");
  }

  recordingManager.update(data);

  const updatedRecording: Recording = {
    ...recording,
    ...data,
    id: recording.id, // Prevent id change
    updatedAt: new Date().toISOString(),
  };

  recordings[index] = updatedRecording;
  saveRecordings(recordings);

  return updatedRecording;
}

export function deleteRecording(id: string): boolean {
  const recordings = loadRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    return false;
  }

  if (recordings[index].success === undefined) {
    const recordingManager = RecordingManager.getInstance(id);

    if (recordingManager) {
      recordingManager.stop();
    }
  }

  const recording = recordings[index];

  // Delete output file if exists
  if (recording.outputPath && fs.existsSync(recording.outputPath)) {
    fs.unlinkSync(recording.outputPath);
  }

  recordings.splice(index, 1);
  saveRecordings(recordings);

  return true;
}

export function getRecordingStats(): RecordingStats {
  const recordings = getAllRecordingsWithStats();

  const statusGroups = recordings.reduce(
    (groups, recording) => {
      const status = recording.status || "unknown";
      groups[status] ||= 0;
      groups[status]++;
      return groups;
    },
    {} as Record<string, number>,
  );

  return {
    total: recordings.length,
    ...statusGroups,
  } as RecordingStats;
}

// Initialize: reschedule any pending recordings on startup
export function initializeRecordings(): void {
  const recordings = loadRecordings();

  recordings.forEach((recording) => {
    if (recording.success === undefined) {
      createRecordingManager(recording);
    }
  });

  console.log(
    `Initialized recordings. Total: ${recordings.length}, Scheduled: ${recordings.filter((r) => r.success === undefined).length}`,
  );
}

export function ensureRecordingsInitialized(): void {
  if (initialized) {
    return;
  }

  initializeRecordings();
  startCleanupScheduler();
  initialized = true;
  console.log("Recordings initialized and cleanup scheduler started");
}

function createRecordingManager(recording: Recording): RecordingManager {
  return new RecordingManager(recording.id, recording.name, recording.rtspUrl, recording.startTime, recording.duration);
}
