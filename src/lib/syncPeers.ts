import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PublicSyncPeer, SyncPeer } from "@/types/sync";

const SYNC_PEERS_FILE = process.env.SYNC_PEERS_FILE_PATH || "./data/sync-peers.json";

function ensureDataDir() {
  const dataDir = path.dirname(SYNC_PEERS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadPeers(): SyncPeer[] {
  ensureDataDir();
  if (!fs.existsSync(SYNC_PEERS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(SYNC_PEERS_FILE, "utf-8");
    return JSON.parse(data) as SyncPeer[];
  } catch {
    return [];
  }
}

function savePeers(peers: SyncPeer[]): void {
  ensureDataDir();
  fs.writeFileSync(SYNC_PEERS_FILE, JSON.stringify(peers, null, 2));
}

export function getAllPeers(): SyncPeer[] {
  return loadPeers();
}

export function getEnabledPeers(): SyncPeer[] {
  return loadPeers().filter((peer) => peer.enabled);
}

export function getPeerById(id: string): SyncPeer | undefined {
  return loadPeers().find((peer) => peer.id === id);
}

/** Strips the peer's push credential before it's sent to the browser — the UI never needs it. */
export function toPublicPeer(peer: SyncPeer): PublicSyncPeer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { remoteApiKey, ...publicPeer } = peer;
  return publicPeer;
}

export function upsertPeerByInstanceId(data: {
  instanceId: string;
  name: string;
  baseUrl: string;
  remoteApiKey: string;
}): SyncPeer {
  const peers = loadPeers();
  const now = new Date().toISOString();
  const index = peers.findIndex((peer) => peer.instanceId === data.instanceId);

  if (index === -1) {
    const peer: SyncPeer = {
      id: randomUUID(),
      instanceId: data.instanceId,
      name: data.name,
      baseUrl: data.baseUrl,
      remoteApiKey: data.remoteApiKey,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    peers.push(peer);
    savePeers(peers);
    return peer;
  }

  const updated: SyncPeer = {
    ...peers[index],
    name: data.name,
    baseUrl: data.baseUrl,
    remoteApiKey: data.remoteApiKey,
    updatedAt: now,
  };
  peers[index] = updated;
  savePeers(peers);
  return updated;
}

export function createPeer(data: { name: string; baseUrl: string; remoteApiKey: string; instanceId: string }): SyncPeer {
  const peers = loadPeers();
  const now = new Date().toISOString();
  const peer: SyncPeer = {
    id: randomUUID(),
    instanceId: data.instanceId,
    name: data.name,
    baseUrl: data.baseUrl,
    remoteApiKey: data.remoteApiKey,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  peers.push(peer);
  savePeers(peers);
  return peer;
}

export function updatePeer(id: string, data: Partial<SyncPeer>): SyncPeer | null {
  const peers = loadPeers();
  const index = peers.findIndex((peer) => peer.id === id);
  if (index === -1) {
    return null;
  }

  const updated: SyncPeer = {
    ...peers[index],
    ...data,
    id: peers[index].id,
    createdAt: peers[index].createdAt,
    updatedAt: new Date().toISOString(),
  };
  peers[index] = updated;
  savePeers(peers);
  return updated;
}

export function deletePeer(id: string): boolean {
  const peers = loadPeers();
  const index = peers.findIndex((peer) => peer.id === id);
  if (index === -1) {
    return false;
  }
  peers.splice(index, 1);
  savePeers(peers);
  return true;
}
