import { RecordingWithStatus } from "@/types/recording";
import { ALL_INSTANCES } from "@/types/sync";
import { getAllPeers } from "@/lib/syncPeers";
import { getInstanceIdentity, getLocalInstanceId } from "@/lib/instanceIdentity";

const STATUS_CACHE_TTL_MS = 5000;
const STATUS_FETCH_TIMEOUT_MS = 3000;

interface PeerRecordingStatus {
  id: string;
  status: RecordingWithStatus["status"];
  frames?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  speed?: number;
  errorMessage?: string;
  isIgnoringLiveStatus: boolean;
}

interface PeerStatusCacheEntry {
  fetchedAt: number;
  statuses: Map<string, PeerRecordingStatus> | null; // null = peer was unreachable
}

type AggregateStatusGlobal = typeof globalThis & {
  __streamRecorderPeerStatusCache?: Map<string, PeerStatusCacheEntry>;
};

const aggregateStatusGlobal = globalThis as AggregateStatusGlobal;
const peerStatusCache =
  aggregateStatusGlobal.__streamRecorderPeerStatusCache ??
  (aggregateStatusGlobal.__streamRecorderPeerStatusCache = new Map());

async function fetchPeerStatuses(peer: { id: string; baseUrl: string; remoteApiKey: string }) {
  const cached = peerStatusCache.get(peer.id);
  if (cached && Date.now() - cached.fetchedAt < STATUS_CACHE_TTL_MS) {
    return cached.statuses;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${peer.baseUrl.replace(/\/+$/, "")}/api/sync/status`, {
      headers: { Authorization: `Bearer ${peer.remoteApiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Peer status endpoint responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { recordings: PeerRecordingStatus[] };
    const statuses = new Map(payload.recordings.map((recording) => [recording.id, recording]));
    peerStatusCache.set(peer.id, { fetchedAt: Date.now(), statuses });
    return statuses;
  } catch {
    peerStatusCache.set(peer.id, { fetchedAt: Date.now(), statuses: null });
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Merges live status from linked peers into recordings executed elsewhere, so the dashboard
 * shows one unified view. Recordings executed locally (or assigned to "all" instances, which
 * this instance also runs its own copy of) pass through untouched — they already carry live
 * status from the local RecordingManager.
 */
export async function aggregateRecordingStatuses(recordings: RecordingWithStatus[]): Promise<RecordingWithStatus[]> {
  const allPeers = getAllPeers();

  // No linked instances — leave instanceName unset so single-instance deployments see no change.
  if (allPeers.length === 0) {
    return recordings;
  }

  const localInstanceId = getLocalInstanceId();
  const localName = getInstanceIdentity().name || "This instance";
  // Keep disabled peers in the name lookup (so a temporarily-disabled instance still shows its
  // real name below) but only fetch live status from ones actually enabled.
  const peerByInstanceId = new Map(allPeers.map((peer) => [peer.instanceId, peer]));
  const enabledInstanceIds = new Set(allPeers.filter((peer) => peer.enabled).map((peer) => peer.instanceId));

  const neededInstanceIds = new Set(
    recordings
      .map((recording) => recording.executionInstanceId)
      .filter(
        (instanceId): instanceId is string =>
          !!instanceId &&
          instanceId !== ALL_INSTANCES &&
          instanceId !== localInstanceId &&
          enabledInstanceIds.has(instanceId),
      ),
  );

  const statusesByInstanceId = new Map<string, Map<string, PeerRecordingStatus> | null>();
  await Promise.allSettled(
    Array.from(neededInstanceIds).map(async (instanceId) => {
      const peer = peerByInstanceId.get(instanceId)!;
      statusesByInstanceId.set(instanceId, await fetchPeerStatuses(peer));
    }),
  );

  return recordings.map((recording) => {
    const execId = recording.executionInstanceId;

    if (!execId || execId === localInstanceId || execId === ALL_INSTANCES) {
      return { ...recording, instanceName: localName };
    }

    const peer = peerByInstanceId.get(execId);
    if (!peer) {
      return { ...recording, instanceName: "Unknown instance", instanceUnreachable: true };
    }

    const peerStatuses = statusesByInstanceId.get(execId);
    if (!peerStatuses) {
      return { ...recording, instanceName: peer.name, instanceUnreachable: true };
    }

    const live = peerStatuses.get(recording.id);
    if (!live) {
      return { ...recording, instanceName: peer.name };
    }

    return {
      ...recording,
      status: live.status,
      frames: live.frames,
      fps: live.fps,
      time: live.time,
      bitrate: live.bitrate,
      speed: live.speed,
      errorMessage: live.errorMessage ?? recording.errorMessage,
      isIgnoringLiveStatus: live.isIgnoringLiveStatus,
      instanceName: peer.name,
    };
  });
}
