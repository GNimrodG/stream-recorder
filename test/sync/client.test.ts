import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncPeer } from "@/types/sync";

const {
  getLocalInstanceIdMock,
  getRecordingsSinceMock,
  getStreamsSinceMock,
  applyIncomingSyncMock,
  updatePeerMock,
} = vi.hoisted(() => ({
  getLocalInstanceIdMock: vi.fn(() => "local-instance"),
  getRecordingsSinceMock: vi.fn(() => ({ items: [], tombstones: [] })),
  getStreamsSinceMock: vi.fn(() => ({ items: [], tombstones: [] })),
  applyIncomingSyncMock: vi.fn(),
  updatePeerMock: vi.fn(),
}));

vi.mock("@/lib/instanceIdentity", () => ({
  getLocalInstanceId: getLocalInstanceIdMock,
}));

vi.mock("@/lib/sync/diff", () => ({
  getRecordingsSince: getRecordingsSinceMock,
  getStreamsSince: getStreamsSinceMock,
}));

vi.mock("@/lib/sync/apply", () => ({
  applyIncomingSync: applyIncomingSyncMock,
}));

vi.mock("@/lib/syncPeers", () => ({
  updatePeer: updatePeerMock,
}));

function makePeer(overrides: Partial<SyncPeer> = {}): SyncPeer {
  return {
    id: "peer-1",
    instanceId: "remote-instance",
    name: "Remote",
    baseUrl: "http://remote.test",
    remoteApiKey: "remote-key",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  getLocalInstanceIdMock.mockClear();
  getRecordingsSinceMock.mockClear();
  getStreamsSinceMock.mockClear();
  applyIncomingSyncMock.mockClear();
  updatePeerMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushToPeer", () => {
  it("merges the peer's reply and records a successful sync", async () => {
    const peer = makePeer();
    const serverTime = "2026-01-02T00:00:00.000Z";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fromInstanceId: peer.instanceId,
          serverTime,
          recordings: { items: [], tombstones: [] },
          streams: { items: [], tombstones: [] },
        }),
      }),
    );

    const { pushToPeer } = await import("@/lib/sync/client");
    await pushToPeer(peer);

    expect(applyIncomingSyncMock).toHaveBeenCalledTimes(1);
    expect(updatePeerMock).toHaveBeenCalledWith(
      peer.id,
      expect.objectContaining({ lastSyncStatus: "success", cursor: { recordings: serverTime, streams: serverTime } }),
    );
  });

  it("records an error and leaves the cursor untouched when the peer is unreachable", async () => {
    const peer = makePeer();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { pushToPeer } = await import("@/lib/sync/client");
    await expect(pushToPeer(peer)).rejects.toThrow("network down");

    expect(applyIncomingSyncMock).not.toHaveBeenCalled();
    expect(updatePeerMock).toHaveBeenCalledWith(
      peer.id,
      expect.objectContaining({ lastSyncStatus: "error", lastSyncError: "network down" }),
    );
  });

  it("refuses to merge when the peer's identity doesn't match the configured instanceId", async () => {
    const peer = makePeer();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fromInstanceId: "someone-else",
          serverTime: "2026-01-02T00:00:00.000Z",
          recordings: { items: [], tombstones: [] },
          streams: { items: [], tombstones: [] },
        }),
      }),
    );

    const { pushToPeer } = await import("@/lib/sync/client");
    await expect(pushToPeer(peer)).rejects.toThrow(/identity mismatch/i);

    expect(applyIncomingSyncMock).not.toHaveBeenCalled();
  });
});
