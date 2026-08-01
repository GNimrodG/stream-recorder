import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureRecordingsInitializedMock, ensureAutoRecordingSchedulerInitializedMock } = vi.hoisted(() => ({
  ensureRecordingsInitializedMock: vi.fn(),
  ensureAutoRecordingSchedulerInitializedMock: vi.fn(),
}));

vi.mock("@/lib/recordings", () => ({
  ensureRecordingsInitialized: ensureRecordingsInitializedMock,
}));

vi.mock("@/lib/autoRecordingScheduler", () => ({
  ensureAutoRecordingSchedulerInitialized: ensureAutoRecordingSchedulerInitializedMock,
}));

beforeEach(() => {
  delete (globalThis as typeof globalThis & { __streamRecorderRuntimeInitialized?: boolean })
    .__streamRecorderRuntimeInitialized;
  ensureRecordingsInitializedMock.mockReset();
  ensureAutoRecordingSchedulerInitializedMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as typeof globalThis & { __streamRecorderRuntimeInitialized?: boolean })
    .__streamRecorderRuntimeInitialized;
});

describe("app runtime initialization", () => {
  it("initializes only once across separately evaluated server bundles", async () => {
    const firstBundle = await import("@/lib/runtime");
    firstBundle.ensureAppRuntimeInitialized();

    vi.resetModules();
    const secondBundle = await import("@/lib/runtime");
    secondBundle.ensureAppRuntimeInitialized();

    expect(ensureRecordingsInitializedMock).toHaveBeenCalledTimes(1);
    expect(ensureAutoRecordingSchedulerInitializedMock).toHaveBeenCalledTimes(1);
  });
});
