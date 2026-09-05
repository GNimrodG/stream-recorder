import { SyncCollection, Syncable, Tombstone } from "@/types/sync";

interface Fact {
  timestamp: number;
  kind: "item" | "tombstone";
}

interface MergeInput<T extends Syncable> {
  localItems: T[];
  localTombstones: Tombstone[];
  remoteItems: T[];
  remoteTombstones: Tombstone[];
}

interface MergeContext {
  /** Used as the item-vs-item tie-break fallback when an item predates originInstanceId. */
  localInstanceId?: string;
  remoteInstanceId?: string;
}

interface MergeResult<T extends Syncable> {
  items: T[];
  tombstones: Tombstone[];
}

function newestFact<T extends Syncable>(item: T | undefined, tombstone: Tombstone | undefined): Fact | null {
  const itemTime = item ? new Date(item.updatedAt).getTime() : -Infinity;
  const tombstoneTime = tombstone ? new Date(tombstone.deletedAt).getTime() : -Infinity;

  if (itemTime === -Infinity && tombstoneTime === -Infinity) {
    return null;
  }

  if (itemTime >= tombstoneTime) {
    return { timestamp: itemTime, kind: "item" };
  }
  return { timestamp: tombstoneTime, kind: "tombstone" };
}

/**
 * Deterministic last-write-wins merge, run identically on both sides of a sync exchange
 * so both instances converge to the same result regardless of who initiated the request.
 */
export function mergeCollection<T extends Syncable>(
  collection: SyncCollection,
  input: MergeInput<T>,
  context: MergeContext = {},
): MergeResult<T> {
  const { localItems, localTombstones, remoteItems, remoteTombstones } = input;

  const localItemById = new Map(localItems.map((item) => [item.id, item]));
  const remoteItemById = new Map(remoteItems.map((item) => [item.id, item]));
  const localTombstoneById = new Map(localTombstones.map((t) => [t.id, t]));
  const remoteTombstoneById = new Map(remoteTombstones.map((t) => [t.id, t]));

  const allIds = new Set<string>([
    ...localItemById.keys(),
    ...remoteItemById.keys(),
    ...localTombstoneById.keys(),
    ...remoteTombstoneById.keys(),
  ]);

  const resultItems: T[] = [];
  const resultTombstones: Tombstone[] = [];

  for (const id of allIds) {
    const localItem = localItemById.get(id);
    const remoteItem = remoteItemById.get(id);
    const localTombstone = localTombstoneById.get(id);
    const remoteTombstone = remoteTombstoneById.get(id);

    const localFact = newestFact(localItem, localTombstone);
    const remoteFact = newestFact(remoteItem, remoteTombstone);

    let winningItem: T | undefined;
    let winningTombstone: Tombstone | undefined;

    if (localFact && (!remoteFact || localFact.timestamp > remoteFact.timestamp)) {
      winningItem = localFact.kind === "item" ? localItem : undefined;
      winningTombstone = localFact.kind === "tombstone" ? localTombstone : undefined;
    } else if (remoteFact && (!localFact || remoteFact.timestamp > localFact.timestamp)) {
      winningItem = remoteFact.kind === "item" ? remoteItem : undefined;
      winningTombstone = remoteFact.kind === "tombstone" ? remoteTombstone : undefined;
    } else if (localFact && remoteFact) {
      // Exact tie: item beats tombstone (favor keeping data); item-vs-item ties break
      // deterministically on originInstanceId so both peers compute the same winner.
      if (localFact.kind === "item" && remoteFact.kind === "tombstone") {
        winningItem = localItem;
      } else if (remoteFact.kind === "item" && localFact.kind === "tombstone") {
        winningItem = remoteItem;
      } else if (localFact.kind === "item" && remoteFact.kind === "item") {
        // originInstanceId is optional (missing on items that predate this feature); fall back
        // to the actual instance ids so two legacy items with no originInstanceId at all don't
        // both default to the same "" value and always resolve to whichever side is "local".
        const localOrigin = localItem?.originInstanceId ?? context.localInstanceId ?? "";
        const remoteOrigin = remoteItem?.originInstanceId ?? context.remoteInstanceId ?? "";
        winningItem = remoteOrigin > localOrigin ? remoteItem : localItem;
      } else {
        // Both facts are tombstones. deletedAt is already known-equal here (that's how this
        // branch was reached), so comparing it again would always resolve to "local" from each
        // side's perspective; originInstanceId is required on every tombstone and differs
        // between two genuinely independent deletes, so it's the tiebreaker that actually works.
        winningTombstone =
          (remoteTombstone?.originInstanceId ?? "") > (localTombstone?.originInstanceId ?? "")
            ? remoteTombstone
            : localTombstone;
      }
    }

    if (winningItem) {
      resultItems.push(winningItem);
    } else if (winningTombstone) {
      resultTombstones.push(winningTombstone);
    }
  }

  return { items: resultItems, tombstones: resultTombstones };
}
