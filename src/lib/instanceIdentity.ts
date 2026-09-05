import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { ALL_INSTANCES, InstanceIdentity, Syncable } from "@/types/sync";
import { getAllPeers } from "@/lib/syncPeers";

const INSTANCE_FILE = process.env.INSTANCE_FILE_PATH || "./data/instance.json";

function ensureDataDir() {
  const dataDir = path.dirname(INSTANCE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/** The name a freshly-created instance starts with, absent any stored override. */
function getDefaultInstanceName(): string {
  return process.env.INSTANCE_NAME || os.hostname() || "Stream Recorder";
}

function createInstanceIdentity(): InstanceIdentity {
  return {
    instanceId: randomUUID(),
    syncApiKey: randomBytes(32).toString("hex"),
    name: getDefaultInstanceName(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * INSTANCE_NAME always wins over the stored name when set, matching how other env-overridable
 * settings (e.g. FFMPEG_PATH) behave elsewhere in this app — so changing the env var takes
 * effect immediately without needing to edit the stored instance.json.
 */
function withEffectiveName(identity: InstanceIdentity): InstanceIdentity {
  return { ...identity, name: process.env.INSTANCE_NAME || identity.name || getDefaultInstanceName() };
}

export function getInstanceIdentity(): InstanceIdentity {
  ensureDataDir();

  if (!fs.existsSync(INSTANCE_FILE)) {
    const identity = createInstanceIdentity();
    saveInstanceIdentity(identity);
    return withEffectiveName(identity);
  }

  try {
    const data = fs.readFileSync(INSTANCE_FILE, "utf-8");
    const identity = JSON.parse(data) as InstanceIdentity;
    if (!identity.instanceId || !identity.syncApiKey) {
      const fresh = createInstanceIdentity();
      saveInstanceIdentity(fresh);
      return withEffectiveName(fresh);
    }
    return withEffectiveName(identity);
  } catch {
    const identity = createInstanceIdentity();
    saveInstanceIdentity(identity);
    return withEffectiveName(identity);
  }
}

export function saveInstanceIdentity(identity: InstanceIdentity): void {
  ensureDataDir();
  fs.writeFileSync(INSTANCE_FILE, JSON.stringify(identity, null, 2));
}

export function updateInstanceIdentity(updates: Partial<Pick<InstanceIdentity, "name" | "publicUrl">>): InstanceIdentity {
  const current = getInstanceIdentity();
  const updated = { ...current, ...updates };
  saveInstanceIdentity(updated);
  return updated;
}

export function getLocalInstanceId(): string {
  return getInstanceIdentity().instanceId;
}

/**
 * A missing executionInstanceId/originInstanceId means the item predates this feature and
 * should be treated as locally owned, so existing single-instance deployments keep working.
 */
export function shouldExecuteLocally(item: Syncable, localInstanceId: string): boolean {
  if (item.executionInstanceId === ALL_INSTANCES) {
    return true;
  }
  if (item.executionInstanceId) {
    if (item.executionInstanceId === localInstanceId) {
      return true;
    }
    // With no linked peers there is no other real instance this item could belong to — a
    // mismatch here can only mean this instance's own identity was reset (e.g. a lost data
    // volume), not that some other instance now owns it. Treat it as local so recordings/streams
    // don't become permanently unmanageable after an identity reset on a single-instance setup.
    return getAllPeers().length === 0;
  }
  return item.originInstanceId === undefined || item.originInstanceId === localInstanceId;
}

/**
 * Whether this instance may write an authoritative delete tombstone for `item` — i.e. whether
 * deleting it here should propagate as a real deletion to every linked instance, rather than
 * just removing this instance's own local copy. For an item assigned to a specific instance
 * that's the same as "runs here" (shouldExecuteLocally). An "all"-instances item has no single
 * executor — every instance runs its own independent copy — so only the instance that originally
 * created it may delete it everywhere; any other instance's delete just stops mirroring its own
 * copy, the same as deleting a mirrored copy of a specific-instance item.
 */
export function isDeleteAuthoritative(item: Syncable, localInstanceId: string): boolean {
  if (item.executionInstanceId === ALL_INSTANCES) {
    return item.originInstanceId === undefined || item.originInstanceId === localInstanceId;
  }
  return shouldExecuteLocally(item, localInstanceId);
}
