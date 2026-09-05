import { Recording } from "@/types/recording";
import { SavedStream } from "@/types/stream";
import { SyncExchangeRequest, SyncExchangeResponse, SyncPeer } from "@/types/sync";
import { getLocalInstanceId } from "@/lib/instanceIdentity";
import { getRecordingsSince, getStreamsSince } from "@/lib/sync/diff";
import { applyIncomingSync } from "@/lib/sync/apply";
import { updatePeer } from "@/lib/syncPeers";

const REQUEST_TIMEOUT_MS = 15000;

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}`;
}

/** Pushes this instance's changes to a peer, merges its reply, and updates the peer's sync cursor/status. */
export async function pushToPeer(peer: SyncPeer): Promise<void> {
  const localInstanceId = getLocalInstanceId();
  // `since` (the peer's own clock, from its last serverTime) is sent to the peer so *it* can
  // filter its own items by its own clock — it must not be used to filter our own outgoing
  // items below, since our items are stamped with our clock, not the peer's.
  const since = { recordings: peer.cursor?.recordings, streams: peer.cursor?.streams };
  const localSentAt = new Date().toISOString();

  const requestBody: SyncExchangeRequest<Recording, SavedStream> = {
    fromInstanceId: localInstanceId,
    since,
    recordings: getRecordingsSince(peer.localCursor?.recordings),
    streams: getStreamsSince(peer.localCursor?.streams),
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(joinUrl(peer.baseUrl, "/api/sync/exchange"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${peer.remoteApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Peer responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as SyncExchangeResponse<Recording, SavedStream>;

    if (payload.fromInstanceId !== peer.instanceId) {
      throw new Error("Peer identity mismatch — its baseUrl may now point somewhere else. Refusing to merge.");
    }

    applyIncomingSync(payload.recordings, payload.streams, payload.fromInstanceId);

    updatePeer(peer.id, {
      cursor: { recordings: payload.serverTime, streams: payload.serverTime },
      localCursor: { recordings: localSentAt, streams: localSentAt },
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      lastSyncError: undefined,
    });
  } catch (error) {
    updatePeer(peer.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "error",
      lastSyncError: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
