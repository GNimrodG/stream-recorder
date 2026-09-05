import { describe, expect, it } from "vitest";
import { mergeCollection } from "@/lib/sync/merge";
import { Tombstone } from "@/types/sync";

interface TestItem {
  id: string;
  updatedAt: string;
  originInstanceId?: string;
  value: string;
}

function item(id: string, updatedAt: string, value: string, originInstanceId = "instance-a"): TestItem {
  return { id, updatedAt, value, originInstanceId };
}

function tombstone(id: string, deletedAt: string, originInstanceId = "instance-a"): Tombstone {
  return { id, collection: "recordings", deletedAt, originInstanceId };
}

describe("mergeCollection", () => {
  it("keeps the local item when it is newer than the remote item", () => {
    const result = mergeCollection("recordings", {
      localItems: [item("1", "2026-01-02T00:00:00.000Z", "local-newer")],
      localTombstones: [],
      remoteItems: [item("1", "2026-01-01T00:00:00.000Z", "remote-older")],
      remoteTombstones: [],
    });

    expect(result.items).toEqual([item("1", "2026-01-02T00:00:00.000Z", "local-newer")]);
  });

  it("takes the remote item when it is newer than the local item", () => {
    const result = mergeCollection("recordings", {
      localItems: [item("1", "2026-01-01T00:00:00.000Z", "local-older")],
      localTombstones: [],
      remoteItems: [item("1", "2026-01-02T00:00:00.000Z", "remote-newer")],
      remoteTombstones: [],
    });

    expect(result.items).toEqual([item("1", "2026-01-02T00:00:00.000Z", "remote-newer")]);
  });

  it("deletes the item when a remote tombstone is newer than the local item", () => {
    const result = mergeCollection("recordings", {
      localItems: [item("1", "2026-01-01T00:00:00.000Z", "stale")],
      localTombstones: [],
      remoteItems: [],
      remoteTombstones: [tombstone("1", "2026-01-02T00:00:00.000Z")],
    });

    expect(result.items).toEqual([]);
    expect(result.tombstones).toEqual([tombstone("1", "2026-01-02T00:00:00.000Z")]);
  });

  it("resurrects an item when it was edited after a remote delete", () => {
    const result = mergeCollection("recordings", {
      localItems: [item("1", "2026-01-03T00:00:00.000Z", "edited-after-delete")],
      localTombstones: [],
      remoteItems: [],
      remoteTombstones: [tombstone("1", "2026-01-02T00:00:00.000Z")],
    });

    expect(result.items).toEqual([item("1", "2026-01-03T00:00:00.000Z", "edited-after-delete")]);
    expect(result.tombstones).toEqual([]);
  });

  it("passes through items that only exist on one side", () => {
    const localOnly = item("local-only", "2026-01-01T00:00:00.000Z", "a");
    const remoteOnly = item("remote-only", "2026-01-01T00:00:00.000Z", "b");

    const result = mergeCollection("recordings", {
      localItems: [localOnly],
      localTombstones: [],
      remoteItems: [remoteOnly],
      remoteTombstones: [],
    });

    expect(result.items).toEqual(expect.arrayContaining([localOnly, remoteOnly]));
    expect(result.items).toHaveLength(2);
  });

  it("excludes tombstones older than the given cutoff when pruned separately", () => {
    // mergeCollection itself doesn't prune by age — this documents that pruning is a
    // separate, explicit step (see syncTombstones.pruneTombstones), not part of the merge.
    const result = mergeCollection("recordings", {
      localItems: [],
      localTombstones: [tombstone("old", "2000-01-01T00:00:00.000Z")],
      remoteItems: [],
      remoteTombstones: [],
    });

    expect(result.tombstones).toEqual([tombstone("old", "2000-01-01T00:00:00.000Z")]);
  });

  it("breaks exact-timestamp item-vs-item ties deterministically and symmetrically", () => {
    const localItem = item("1", "2026-01-01T00:00:00.000Z", "from-a", "instance-a");
    const remoteItem = item("1", "2026-01-01T00:00:00.000Z", "from-b", "instance-b");

    const fromAPerspective = mergeCollection("recordings", {
      localItems: [localItem],
      localTombstones: [],
      remoteItems: [remoteItem],
      remoteTombstones: [],
    });

    const fromBPerspective = mergeCollection("recordings", {
      localItems: [remoteItem],
      localTombstones: [],
      remoteItems: [localItem],
      remoteTombstones: [],
    });

    expect(fromAPerspective.items).toEqual(fromBPerspective.items);
  });

  it("prefers a tied item over a tied tombstone (favors keeping data)", () => {
    const result = mergeCollection("recordings", {
      localItems: [item("1", "2026-01-01T00:00:00.000Z", "kept")],
      localTombstones: [],
      remoteItems: [],
      remoteTombstones: [tombstone("1", "2026-01-01T00:00:00.000Z")],
    });

    expect(result.items).toEqual([item("1", "2026-01-01T00:00:00.000Z", "kept")]);
  });
});
