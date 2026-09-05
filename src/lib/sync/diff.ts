import { Recording } from "@/types/recording";
import { SavedStream } from "@/types/stream";
import { SyncCollectionPayload } from "@/types/sync";
import { getAllRecordings } from "@/lib/recordings";
import { getAllStreams } from "@/lib/streams";
import { getTombstonesForCollection } from "@/lib/syncTombstones";

function isAfter(timestamp: string, since?: string): boolean {
  if (!since) {
    return true;
  }
  return new Date(timestamp).getTime() > new Date(since).getTime();
}

/** Everything that changed since `since` (or everything, on a first sync with no cursor yet). */
export function getRecordingsSince(since?: string): SyncCollectionPayload<Recording> {
  return {
    items: getAllRecordings().filter((recording) => isAfter(recording.updatedAt, since)),
    tombstones: getTombstonesForCollection("recordings").filter((tombstone) => isAfter(tombstone.deletedAt, since)),
  };
}

export function getStreamsSince(since?: string): SyncCollectionPayload<SavedStream> {
  return {
    items: getAllStreams().filter((stream) => isAfter(stream.updatedAt, since)),
    tombstones: getTombstonesForCollection("streams").filter((tombstone) => isAfter(tombstone.deletedAt, since)),
  };
}
