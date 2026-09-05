import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PairingTestGlobal = typeof globalThis & {
  __streamRecorderPairingTokens?: unknown;
};

beforeEach(() => {
  delete (globalThis as PairingTestGlobal).__streamRecorderPairingTokens;
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as PairingTestGlobal).__streamRecorderPairingTokens;
});

describe("pairing tokens", () => {
  it("consumes a freshly created token exactly once", async () => {
    const { createPairingToken, consumePairingToken } = await import("@/lib/sync/pairing");
    const { token } = createPairingToken();

    expect(consumePairingToken(token)).toBe(true);
    expect(consumePairingToken(token)).toBe(false);
  });

  it("rejects a token that was never issued", async () => {
    const { consumePairingToken } = await import("@/lib/sync/pairing");
    expect(consumePairingToken("never-issued")).toBe(false);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    try {
      const { createPairingToken, consumePairingToken } = await import("@/lib/sync/pairing");
      const { token } = createPairingToken();

      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(consumePairingToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("round-trips a pairing code through encode/decode", async () => {
    const { encodePairingCode, decodePairingCode } = await import("@/lib/sync/pairing");
    const payload = { baseUrl: "https://example.test", token: "abc123" };

    expect(decodePairingCode(encodePairingCode(payload))).toEqual(payload);
  });
});
