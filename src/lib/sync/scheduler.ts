import { getEnabledPeers } from "@/lib/syncPeers";
import { pruneTombstones } from "@/lib/syncTombstones";
import { pushToPeer } from "@/lib/sync/client";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — metadata sync tolerates staleness, matches autoRecordingScheduler's cadence

let schedulerInitialized = false;
let tickInProgress = false;

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

  setInterval(() => {
    runSyncTick().catch((error) => {
      console.error("[SYNC] Sync tick failed:", error);
    });
  }, SYNC_INTERVAL_MS);
}

export { runSyncTick };
