import fs from "node:fs";
import { loadSettings } from "@/lib/settings";
import { getAllRecordings, saveRecordings } from "@/lib/recordings";
import { Recording } from "@/types/recording";

/**
 * Get the total size of all recordings in GB
 */
export function getTotalStorageUsed(): number {
  const recordings = getAllRecordings();
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

  // If autoDeleteAfterDays is 0 or negative, don't delete anything
  if (settings.autoDeleteAfterDays <= 0) {
    return 0;
  }

  const recordings = getAllRecordings();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - settings.autoDeleteAfterDays * 24 * 60 * 60 * 1000);

  let deletedCount = 0;
  const recordingsToKeep: Recording[] = [];

  for (const recording of recordings) {
    // Only delete completed recordings
    if (recording.completedAt) {
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

  const recordings = getAllRecordings();

  // Get completed recordings sorted by completion date (oldest first)
  const completedRecordings = recordings
    .filter((r) => r.completedAt && r.outputPath)
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
