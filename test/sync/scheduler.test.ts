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
  it("runs an immediate sync on init and does not double-register on repeated init calls", async () => {
    getEnabledPeersMock.mockReturnValue([]);
    const { ensureSyncSchedulerInitialized } = await import("@/lib/sync/scheduler");

    ensureSyncSchedulerInitialized();
    ensureSyncSchedulerInitialized();

    expect(getEnabledPeersMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(getEnabledPeersMock).toHaveBeenCalledTimes(2);
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

  describe("scheduleDebouncedSync", () => {
    it("does nothing when there are no enabled peers", async () => {
      getEnabledPeersMock.mockReturnValue([]);
      const { scheduleDebouncedSync } = await import("@/lib/sync/scheduler");

      scheduleDebouncedSync(8000);
      await vi.advanceTimersByTimeAsync(8000);

      expect(pushToPeerMock).not.toHaveBeenCalled();
    });

    it("syncs once after the debounce delay elapses", async () => {
      const peer = { id: "a", name: "A" };
      getEnabledPeersMock.mockReturnValue([peer]);
      pushToPeerMock.mockResolvedValue(undefined);
      const { scheduleDebouncedSync } = await import("@/lib/sync/scheduler");

      scheduleDebouncedSync(8000);
      await vi.advanceTimersByTimeAsync(7999);
      expect(pushToPeerMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(pushToPeerMock).toHaveBeenCalledTimes(1);
    });

    it("collapses a burst of calls within the debounce window into a single sync", async () => {
      const peer = { id: "a", name: "A" };
      getEnabledPeersMock.mockReturnValue([peer]);
      pushToPeerMock.mockResolvedValue(undefined);
      const { scheduleDebouncedSync } = await import("@/lib/sync/scheduler");

      scheduleDebouncedSync(8000);
      await vi.advanceTimersByTimeAsync(4000);
      scheduleDebouncedSync(8000);
      await vi.advanceTimersByTimeAsync(4000);
      scheduleDebouncedSync(8000);

      await vi.advanceTimersByTimeAsync(8000);

      expect(pushToPeerMock).toHaveBeenCalledTimes(1);
    });
  });
});
