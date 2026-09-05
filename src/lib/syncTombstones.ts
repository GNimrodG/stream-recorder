import fs from "node:fs";
import path from "node:path";
import { SyncCollection, SyncPeer, Tombstone } from "@/types/sync";
import { getEnabledPeers } from "@/lib/syncPeers";

const SYNC_TOMBSTONES_FILE = process.env.SYNC_TOMBSTONES_FILE_PATH || "./data/sync-tombstones.json";

const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function ensureDataDir() {
  const dataDir = path.dirname(SYNC_TOMBSTONES_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadTombstones(): Tombstone[] {
  ensureDataDir();
  if (!fs.existsSync(SYNC_TOMBSTONES_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(SYNC_TOMBSTONES_FILE, "utf-8");
    return JSON.parse(data) as Tombstone[];
  } catch {
    return [];
  }
}

function saveTombstones(tombstones: Tombstone[]): void {
  ensureDataDir();
  fs.writeFileSync(SYNC_TOMBSTONES_FILE, JSON.stringify(tombstones, null, 2));
}

export function getTombstonesForCollection(collection: SyncCollection): Tombstone[] {
  return loadTombstones().filter((tombstone) => tombstone.collection === collection);
}

export function addTombstone(tombstone: Tombstone): void {
  const tombstones = loadTombstones();
  const index = tombstones.findIndex((t) => t.id === tombstone.id && t.collection === tombstone.collection);
  if (index === -1) {
    tombstones.push(tombstone);
  } else {
    tombstones[index] = tombstone;
  }
  saveTombstones(tombstones);
}

export function replaceTombstonesForCollection(collection: SyncCollection, tombstones: Tombstone[]): void {
  const others = loadTombstones().filter((t) => t.collection !== collection);
  saveTombstones([...others, ...tombstones]);
}

/**
 * A tombstone is only safe to prune once every linked peer has confirmed a successful sync
 * after it was created — otherwise a peer that's been offline longer than the retention window
 * could reconnect with its own stale copy and, finding no tombstone left to compete with it,
 * have the deleted item resurrected on both sides.
 */
function seenByAllPeers(tombstone: Tombstone, peers: SyncPeer[]): boolean {
  const deletedAt = new Date(tombstone.deletedAt).getTime();
  return peers.every((peer) => !!peer.lastSyncAt && new Date(peer.lastSyncAt).getTime() > deletedAt);
}

export function pruneTombstones(maxAgeMs: number = TOMBSTONE_RETENTION_MS): void {
  const cutoff = Date.now() - maxAgeMs;
  const peers = getEnabledPeers();
  const tombstones = loadTombstones();
  const kept = tombstones.filter((t) => new Date(t.deletedAt).getTime() >= cutoff || !seenByAllPeers(t, peers));
  if (kept.length !== tombstones.length) {
    saveTombstones(kept);
  }
}
