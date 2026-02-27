/* eslint-disable @typescript-eslint/no-explicit-any */
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

  it("resolves live for 200 responses", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/ok", 1000);
    // send a 200 OK response
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n");

    const r = await p;
    expect(r).toBe("live");
  });

  it("resolves live when SDP body is present without Content-Length", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/sdp", 1000);
    // RTSP response headers followed by SDP (starts with v=), no Content-Length
    fakeSocket.emitData!("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\nv=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n");

    const r = await p;
    expect(r).toBe("live");
  });

  it("resolves invalid for non-RTSP responses", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/bad", 1000);
    // send a response that doesn't start with RTSP/1.0
    fakeSocket.emitData!("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");

    const r = await p;
    expect(r).toBe("invalid");
  });

  it("resolves invalid for non-numeric status codes", async () => {
    const fakeSocket = await createFakeSocket();
    (net.createConnection as unknown) = vi.fn(() => fakeSocket as unknown as net.Socket);

    const mod = await import("../src/lib/stream");

    const p = mod.checkStreamStatus("rtsp://localhost/badstatus", 1000);
    // RTSP prefix but non-numeric status code
    fakeSocket.emitData!("RTSP/1.0 ABC Weird\r\nCSeq: 1\r\n\r\n");

    const r = await p;
    expect(r).toBe("invalid");
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

  it("queues requests per host so only one active at a time", async () => {
    const fakeSocket1 = await createFakeSocket();
    const fakeSocket2 = await createFakeSocket();

    let callIndex = 0;
    (net.createConnection as unknown) = vi.fn(() => {
      const s = callIndex === 0 ? fakeSocket1 : fakeSocket2;
      callIndex++;
      return s as unknown as net.Socket;
    });

    const mod = await import("../src/lib/stream");

    const p1 = mod.checkStreamStatus("rtsp://localhost/one", 1000);
    const p2 = mod.checkStreamStatus("rtsp://localhost/two", 1000);

    // Only the first request should have triggered a connection immediately
    expect(net.createConnection as unknown as any).toHaveBeenCalledTimes(1);

    // finalize first
    fakeSocket1.emitData!("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n");
    const r1 = await p1;
    expect(r1).toBe("live");

    // wait for the queued start to be scheduled
    await new Promise((res) => setImmediate(res));

    // after first finishes, second connection should have been created
    expect(net.createConnection as unknown as any).toHaveBeenCalledTimes(2);

    fakeSocket2.emitData!("RTSP/1.0 404 Not Found\r\nCSeq: 1\r\n\r\n");
    const r2 = await p2;
    expect(r2).toBe("not_found");
  });
});
