export const ALL_INSTANCES = "all" as const;

export interface InstanceIdentity {
  instanceId: string;
  syncApiKey: string;
  name: string;
  publicUrl?: string;
  createdAt: string;
}

export interface SyncPeer {
  id: string;
  instanceId: string;
  name: string;
  baseUrl: string;
  remoteApiKey: string;
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  /** Peer-clock timestamps (from its own serverTime) — sent as `since` so the peer filters its own items by its own clock. */
  cursor?: {
    recordings?: string;
    streams?: string;
  };
  /** Local-clock timestamps — used to filter this instance's own outgoing items, so a push to
   *  this peer is never compared against a foreign clock. */
  localCursor?: {
    recordings?: string;
    streams?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** SyncPeer as sent to the browser — remoteApiKey is a push credential the UI never needs and must never leave the server. */
export type PublicSyncPeer = Omit<SyncPeer, "remoteApiKey">;

export type SyncCollection = "recordings" | "streams";

export interface Tombstone {
  id: string;
  collection: SyncCollection;
  deletedAt: string;
  originInstanceId: string;
}

export interface Syncable {
  id: string;
  updatedAt: string;
  originInstanceId?: string;
  executionInstanceId?: string;
}

export interface SyncCollectionPayload<T> {
  items: T[];
  tombstones: Tombstone[];
}

export interface SyncExchangeRequest<TRecording, TStream> {
  fromInstanceId: string;
  since: {
    recordings?: string;
    streams?: string;
  };
  recordings: SyncCollectionPayload<TRecording>;
  streams: SyncCollectionPayload<TStream>;
}

export interface SyncExchangeResponse<TRecording, TStream> {
  fromInstanceId: string;
  serverTime: string;
  recordings: SyncCollectionPayload<TRecording>;
  streams: SyncCollectionPayload<TStream>;
}
