import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingWithStatus } from "@/types/recording";

const { getAllPeersMock, getInstanceIdentityMock, getLocalInstanceIdMock } = vi.hoisted(() => ({
  getAllPeersMock: vi.fn(),
  getInstanceIdentityMock: vi.fn(),
  getLocalInstanceIdMock: vi.fn(),
}));

vi.mock("@/lib/syncPeers", () => ({
  getAllPeers: getAllPeersMock,
}));

vi.mock("@/lib/instanceIdentity", () => ({
  getInstanceIdentity: getInstanceIdentityMock,
  getLocalInstanceId: getLocalInstanceIdMock,
}));

function recording(overrides: Partial<RecordingWithStatus> = {}): RecordingWithStatus {
  return {
    id: "rec-1",
    name: "Test",
    rtspUrl: "rtsp://example",
    startTime: "2026-01-01T00:00:00.000Z",
    duration: 60,
    attemptPaths: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "recording",
    isIgnoringLiveStatus: false,
    ...overrides,
  } as RecordingWithStatus;
}

beforeEach(() => {
  vi.resetModules();
  getAllPeersMock.mockReset();
  getInstanceIdentityMock.mockReset();
  getLocalInstanceIdMock.mockReset();
  getInstanceIdentityMock.mockReturnValue({ name: "Local Instance" });
  getLocalInstanceIdMock.mockReturnValue("local-id");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("aggregateRecordingStatuses", () => {
  it("leaves recordings untouched when there are no linked peers", async () => {
    getAllPeersMock.mockReturnValue([]);
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const input = [recording()];
    const result = await aggregateRecordingStatuses(input);

    expect(result).toEqual(input);
  });

  it("labels an unassigned or locally-executed recording with the local instance's name", async () => {
    getAllPeersMock.mockReturnValue([{ id: "p1", instanceId: "peer-1", name: "Peer One", baseUrl: "http://peer", remoteApiKey: "k", enabled: true }]);
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const [withoutExecId] = await aggregateRecordingStatuses([recording({ executionInstanceId: undefined })]);
    const [localExecId] = await aggregateRecordingStatuses([recording({ executionInstanceId: "local-id" })]);

    expect(withoutExecId.instanceName).toBe("Local Instance");
    expect(localExecId.instanceName).toBe("Local Instance");
  });

  it("labels an \"all\"-scoped recording as running on every linked instance, not just this one", async () => {
    getAllPeersMock.mockReturnValue([{ id: "p1", instanceId: "peer-1", name: "Peer One", baseUrl: "http://peer", remoteApiKey: "k", enabled: true }]);
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const [result] = await aggregateRecordingStatuses([recording({ executionInstanceId: "all" })]);

    expect(result.instanceName).toBe("All linked instances");
    expect(result.instanceUnreachable).toBeUndefined();
  });

  it("merges live status and the peer's name for a recording executed on a reachable peer", async () => {
    getAllPeersMock.mockReturnValue([
      { id: "p1", instanceId: "peer-1", name: "Peer One", baseUrl: "http://peer", remoteApiKey: "k", enabled: true },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recordings: [{ id: "rec-1", status: "recording", frames: 42, isIgnoringLiveStatus: false }],
        }),
      }),
    );
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const [result] = await aggregateRecordingStatuses([recording({ executionInstanceId: "peer-1" })]);

    expect(result.instanceName).toBe("Peer One");
    expect(result.frames).toBe(42);
    expect(result.instanceUnreachable).toBeUndefined();
  });

  it("marks a disabled peer's recording unreachable but keeps its real name", async () => {
    getAllPeersMock.mockReturnValue([
      { id: "p1", instanceId: "peer-1", name: "Peer One", baseUrl: "http://peer", remoteApiKey: "k", enabled: false },
    ]);
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const [result] = await aggregateRecordingStatuses([recording({ executionInstanceId: "peer-1" })]);

    expect(result.instanceName).toBe("Peer One");
    expect(result.instanceUnreachable).toBe(true);
  });

  it("labels a recording assigned to an unknown instance id", async () => {
    getAllPeersMock.mockReturnValue([
      { id: "p1", instanceId: "peer-1", name: "Peer One", baseUrl: "http://peer", remoteApiKey: "k", enabled: true },
    ]);
    const { aggregateRecordingStatuses } = await import("@/lib/sync/aggregateStatus");

    const [result] = await aggregateRecordingStatuses([recording({ executionInstanceId: "someone-else" })]);

    expect(result.instanceName).toBe("Unknown instance");
    expect(result.instanceUnreachable).toBe(true);
  });
});
