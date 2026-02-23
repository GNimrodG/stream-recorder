import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { EventEmitter } from "events";

let originalCreateConnection: typeof net.createConnection;

beforeEach(() => {
  originalCreateConnection = net.createConnection as unknown as typeof net.createConnection;
});

afterEach(() => {
  (net.createConnection as unknown) = originalCreateConnection;
  vi.restoreAllMocks();
});

afterEach(async () => {
  // Ensure the connection pool is cleared between tests to avoid CSeq and socket reuse leakage
  try {
    const mod = await import("../src/lib/stream");
    if (typeof mod.clearConnectionPool === "function") mod.clearConnectionPool();
  } catch {
    // ignore - module may not be present in some contexts
  }
});

async function createFakeSocket(): Promise<net.Socket & { emitData?: (s: string) => void }> {
  // noinspection JSUnusedGlobalSymbols
  class FakeSocket extends EventEmitter {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    write(_data?: unknown) {
      return true;
    }
    setKeepAlive() {
      return this;
    }
    setNoDelay() {
      return this;
    }
    destroy() {
      this.emit("close");
      return this;
    }
    emitData(s: string) {
      this.emit("data", Buffer.from(s));
    }
  }
  return new FakeSocket() as unknown as net.Socket & { emitData?: (s: string) => void };
}

describe("stream checkStreamStatus", () => {
  it("matches responses by CSeq and resolves live", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    // import after stubbing
    const mod = await import("../src/lib/stream");

    const p1 = mod.checkStreamStatus("rtsp://localhost/stream1", 1000);
    const p2 = mod.checkStreamStatus("rtsp://localhost/stream2", 1000);

    // Simulate responses out of order: respond to p2 first
    // send response for CSeq:2 then CSeq:1
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\nCSeq: 2\r\n\r\n");
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n");

    const r1 = await p1;
    const r2 = await p2;

    expect(r1).toBe("live");
    expect(r2).toBe("live");
  });

  it("times out when no response", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/stream1", 50);
    const r = await p;
    expect(r).toBe("timeout");
  });

  it("resolves not_found for 404 responses", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/test404", 1000);
    // send a 404 with CSeq 1
    fakeSocket.emitData!("RTSP/1.0 404 Not Found\r\nCSeq: 1\r\n\r\n");

    const r = await p;
    expect(r).toBe("not_found");
  });

  it("rejects pending requests when socket closes", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/willclose", 1000);
    // simulate socket close before any response
    fakeSocket.destroy();

    const r = await p;
    // on socket close, pending requests are rejected and treated as "error"
    expect(r).toBe("error");
  });

  it("ignores responses without CSeq until a proper response arrives", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/no-cseq", 1000);
    // send a response with no CSeq (ignored), then send the proper one
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\n\r\n");
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n");

    const r = await p;
    expect(r).toBe("live");
  });

  it("handles multiple concurrent out-of-order responses", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const promises = [] as Promise<string>[];
    for (let i = 1; i <= 5; i++) {
      promises.push(mod.checkStreamStatus(`rtsp://localhost/multi${i}`, 1000));
    }

    // emit responses in reverse order (5..1)
    for (let i = 5; i >= 1; i--) {
      fakeSocket.emitData!(`RTSP/1.0 200 OK\r\nCSeq: ${i}\r\n\r\n`);
    }

    const results = await Promise.all(promises);
    expect(results.every((r) => r === "live")).toBe(true);
  });
});
