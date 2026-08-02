import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAppRuntimeInitializedMock } = vi.hoisted(() => ({
  ensureAppRuntimeInitializedMock: vi.fn(),
}));

vi.mock("@/lib/runtime", () => ({
  ensureAppRuntimeInitialized: ensureAppRuntimeInitializedMock,
}));

const originalNextRuntime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  ensureAppRuntimeInitializedMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  if (originalNextRuntime === undefined) {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = originalNextRuntime;
  }
});

describe("server startup instrumentation", () => {
  it("initializes recording managers in the Node server before any request", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("@/instrumentation");

    await register();

    expect(ensureAppRuntimeInitializedMock).toHaveBeenCalledOnce();
  });

  it("does not initialize the filesystem-based runtime in an edge process", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("@/instrumentation");

    await register();

    expect(ensureAppRuntimeInitializedMock).not.toHaveBeenCalled();
  });
});
