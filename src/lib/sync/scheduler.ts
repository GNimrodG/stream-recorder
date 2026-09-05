import { getEnabledPeers } from "@/lib/syncPeers";
import { pruneTombstones } from "@/lib/syncTombstones";
import { pushToPeer } from "@/lib/sync/client";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — metadata sync tolerates staleness, matches autoRecordingScheduler's cadence
const DEBOUNCED_SYNC_DELAY_MS = 8000; // let a burst of edits (e.g. re-saving a form) settle into one sync

let schedulerInitialized = false;
let tickInProgress = false;
let debouncedSyncTimeout: NodeJS.Timeout | null = null;

async function runSyncTick(): Promise<void> {
  if (tickInProgress) {
    console.log("[SYNC] Skipping tick because previous tick is still running.");
    return;
  }

  tickInProgress = true;

  try {
    const peers = getEnabledPeers();

    // Sequential, not parallel — the JSON stores have no file locking, so concurrent
    // merges from multiple peers could race on the same recordings/streams files.
    for (const peer of peers) {
      try {
        await pushToPeer(peer);
      } catch (error) {
        console.error(`[SYNC] Failed to sync with peer ${peer.name} (${peer.baseUrl}):`, error);
      }
    }

    pruneTombstones();
  } finally {
    tickInProgress = false;
  }
}

export function ensureSyncSchedulerInitialized(): void {
  if (schedulerInitialized) {
    return;
  }

  schedulerInitialized = true;

  // Run a first sync right away instead of waiting a full interval — otherwise a freshly linked
  // peer (or any peer, after a restart) sits at "last sync: never" for up to SYNC_INTERVAL_MS
  // before anything happens.
  runSyncTick().catch((error) => {
    console.error("[SYNC] Initial sync tick failed:", error);
  });

  setInterval(() => {
    runSyncTick().catch((error) => {
      console.error("[SYNC] Sync tick failed:", error);
    });
  }, SYNC_INTERVAL_MS);
}

/**
 * Schedules a sync attempt shortly after a local recording/stream change instead of making
 * peers wait for the next scheduled tick — repeated calls within the debounce window (e.g. a
 * quick sequence of edits) collapse into a single sync. Safe to call often: it just resets the
 * timer, and runSyncTick's own tickInProgress guard covers overlap with the periodic tick.
 */
export function scheduleDebouncedSync(delayMs: number = DEBOUNCED_SYNC_DELAY_MS): void {
  if (getEnabledPeers().length === 0) {
    return;
  }

  if (debouncedSyncTimeout) {
    clearTimeout(debouncedSyncTimeout);
  }

  debouncedSyncTimeout = setTimeout(() => {
    debouncedSyncTimeout = null;
    runSyncTick().catch((error) => {
      console.error("[SYNC] Debounced sync tick failed:", error);
    });
  }, delayMs);
}

export { runSyncTick };
