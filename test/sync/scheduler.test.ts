import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getEnabledPeersMock, pushToPeerMock, pruneTombstonesMock } = vi.hoisted(() => ({
  getEnabledPeersMock: vi.fn(),
  pushToPeerMock: vi.fn(),
  pruneTombstonesMock: vi.fn(),
}));

vi.mock("@/lib/syncPeers", () => ({
  getEnabledPeers: getEnabledPeersMock,
}));

vi.mock("@/lib/syncTombstones", () => ({
  pruneTombstones: pruneTombstonesMock,
}));

vi.mock("@/lib/sync/client", () => ({
  pushToPeer: pushToPeerMock,
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  getEnabledPeersMock.mockReset();
  pushToPeerMock.mockReset();
  pruneTombstonesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sync scheduler", () => {
  it("only registers its interval once across repeated init calls", async () => {
    getEnabledPeersMock.mockReturnValue([]);
    const { ensureSyncSchedulerInitialized } = await import("@/lib/sync/scheduler");

    ensureSyncSchedulerInitialized();
    ensureSyncSchedulerInitialized();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(getEnabledPeersMock).toHaveBeenCalledTimes(1);
  });

  it("pushes to every enabled peer sequentially and keeps going if one fails", async () => {
    const peerA = { id: "a", name: "A" };
    const peerB = { id: "b", name: "B" };
    getEnabledPeersMock.mockReturnValue([peerA, peerB]);
    pushToPeerMock.mockImplementation(async (peer: { id: string }) => {
      if (peer.id === "a") throw new Error("unreachable");
    });

    const { runSyncTick } = await import("@/lib/sync/scheduler");
    await runSyncTick();

    expect(pushToPeerMock).toHaveBeenNthCalledWith(1, peerA);
    expect(pushToPeerMock).toHaveBeenNthCalledWith(2, peerB);
    expect(pruneTombstonesMock).toHaveBeenCalledTimes(1);
  });

  it("skips a tick that starts while the previous one is still running", async () => {
    let resolveFirstPush: () => void = () => {};
    getEnabledPeersMock.mockReturnValue([{ id: "a", name: "A" }]);
    pushToPeerMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstPush = resolve;
        }),
    );

    const { runSyncTick } = await import("@/lib/sync/scheduler");
    const firstTick = runSyncTick();
    const secondTick = runSyncTick();

    resolveFirstPush();
    await Promise.all([firstTick, secondTick]);

    expect(pushToPeerMock).toHaveBeenCalledTimes(1);
  });
});
