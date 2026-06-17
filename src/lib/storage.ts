import fs from "node:fs/promises";
import { loadSettings } from "@/lib/settings";
import { getAllRecordings, saveRecordings } from "@/lib/recordings";
import { Recording } from "@/types/recording";

async function existsAsync(path: string): Promise<boolean> {
  try {
    await fs.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the total size of all recordings in GB
 */
export async function getTotalStorageUsed(): Promise<number> {
  const recordings = getAllRecordings();
  let totalBytes = 0;

  for (const recording of recordings) {
    if (recording.outputPath && (await existsAsync(recording.outputPath))) {
      try {
        const stats = await fs.stat(recording.outputPath);
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
 * Get the available storage in the filesystem where recordings are stored
 * @returns {{totalGB: number, availableGB: number, usedGB: number}}
 */
export async function getStorageSpaceInFS(): Promise<{ totalGB: number; availableGB: number; usedGB: number }> {
  const settings = loadSettings();

  try {
    const stats = await fs.statfs(settings.outputDirectory);
    const total = stats.blocks * stats.bsize;
    const available = stats.bavail * stats.bsize;
    const used = total - available;
    return {
      totalGB: total / 1024 ** 3,
      availableGB: available / 1024 ** 3,
      usedGB: used / 1024 ** 3,
    };
  } catch (error) {
    console.error("Failed to get available storage in filesystem:", error);
    return { totalGB: 0, availableGB: 0, usedGB: 0 };
  }
}

/**
 * Delete old recordings based on autoDeleteAfterDays setting
 * Returns the number of recordings deleted
 */
export async function cleanupOldRecordings(): Promise<number> {
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
        if (recording.outputPath && (await existsAsync(recording.outputPath))) {
          try {
            await fs.unlink(recording.outputPath);
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
export async function enforceStorageLimit(): Promise<number> {
  const settings = loadSettings();

  // If maxStorageGB is 0, don't enforce limit
  if (settings.maxStorageGB <= 0) {
    return 0;
  }

  let currentStorageGB = await getTotalStorageUsed();

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

    if (recording.outputPath && (await existsAsync(recording.outputPath))) {
      try {
        const stats = await fs.stat(recording.outputPath);
        const fileGB = stats.size / (1024 * 1024 * 1024);

        await fs.unlink(recording.outputPath);
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
export async function runStorageCleanup(): Promise<{
  deletedOld: number;
  deletedForSpace: number;
  currentStorageGB: number;
}> {
  console.log("Running storage cleanup...");

  const deletedOld = await cleanupOldRecordings();
  const deletedForSpace = await enforceStorageLimit();
  const currentStorageGB = await getTotalStorageUsed();

  console.log(
    `Cleanup complete: ${deletedOld} old recordings, ${deletedForSpace} for space, ${currentStorageGB.toFixed(2)} GB used`,
  );

  return { deletedOld, deletedForSpace, currentStorageGB };
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  const settings = loadSettings();
  const storageSpace = await getStorageSpaceInFS();
  const localUsedGB = await getTotalStorageUsed();
  const exeternalUsageGB = storageSpace.usedGB - localUsedGB; // Calculate external usage (used by other files in the output directory)
  const maxGB = settings.maxStorageGB || storageSpace.totalGB; // Adjust maxGB based on external usage
  const percentage = maxGB > 0 ? (localUsedGB / maxGB) * 100 : 0;
  const percentageExternal = storageSpace.totalGB > 0 ? (exeternalUsageGB / storageSpace.totalGB) * 100 : 0;

  // if the maxGB is set less than the total - exeternalUsageGB, then we can ignore the external usage percentage, otherwise we show it
  const shouldHideExternalUsage = maxGB < storageSpace.totalGB - exeternalUsageGB;

  return {
    ...storageSpace,
    localUsedGB,
    exeternalUsageGB: shouldHideExternalUsage ? 0 : exeternalUsageGB,
    percentageExternal: shouldHideExternalUsage ? 0 : percentageExternal,
    maxGB,
    percentage,
    autoDeleteDays: settings.autoDeleteAfterDays,
  };
}
