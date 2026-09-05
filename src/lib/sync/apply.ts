import { Recording } from "@/types/recording";
import { SavedStream } from "@/types/stream";
import { SyncCollectionPayload } from "@/types/sync";
import { getAllRecordings, reconcileRecordingExecution, saveRecordings } from "@/lib/recordings";
import { getAllStreams, replaceAllStreams } from "@/lib/streams";
import { getTombstonesForCollection, replaceTombstonesForCollection } from "@/lib/syncTombstones";
import { mergeCollection } from "@/lib/sync/merge";
import { getLocalInstanceId } from "@/lib/instanceIdentity";

/**
 * Merges an incoming batch of recordings/streams (and their tombstones) from a peer into the
 * local stores, then re-checks whether any pending recording is now this instance's
 * responsibility to execute. Safe to call with a partial ("since"-filtered) remote payload —
 * mergeCollection only touches ids present in the remote payload, everything else in the local
 * store passes through untouched.
 */
export function applyIncomingSync(
  remoteRecordings: SyncCollectionPayload<Recording>,
  remoteStreams: SyncCollectionPayload<SavedStream>,
  remoteInstanceId: string,
): void {
  const context = { localInstanceId: getLocalInstanceId(), remoteInstanceId };

  const mergedRecordings = mergeCollection<Recording>(
    "recordings",
    {
      localItems: getAllRecordings(),
      localTombstones: getTombstonesForCollection("recordings"),
      remoteItems: remoteRecordings.items,
      remoteTombstones: remoteRecordings.tombstones,
    },
    context,
  );
  saveRecordings(mergedRecordings.items);
  replaceTombstonesForCollection("recordings", mergedRecordings.tombstones);

  const mergedStreams = mergeCollection<SavedStream>(
    "streams",
    {
      localItems: getAllStreams(),
      localTombstones: getTombstonesForCollection("streams"),
      remoteItems: remoteStreams.items,
      remoteTombstones: remoteStreams.tombstones,
    },
    context,
  );
  replaceAllStreams(mergedStreams.items);
  replaceTombstonesForCollection("streams", mergedStreams.tombstones);

  reconcileRecordingExecution();
}
