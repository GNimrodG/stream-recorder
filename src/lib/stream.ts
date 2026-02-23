import net from "node:net";
import { LRUCache } from "lru-cache";

export type StreamStatus = "live" | "not_found" | "invalid" | "timeout" | "error";

// Connection pool keeps sockets open and reuses them. Idle sockets are closed after 10 minutes.
const IDLE_CLOSE_MS = 10 * 60 * 1000; // 10 minutes

type PendingRequest = {
  cseq: number;
  resolve: (s: StreamStatus) => void;
  reject: (err?: unknown) => void;
  timeoutTimer: NodeJS.Timeout;
};

type ConnectionEntry = {
  socket: net.Socket;
  buffer: string;
  pending: Map<number, PendingRequest>;
  nextCSeq: number;
  heartbeatTimer?: NodeJS.Timeout | null;
};

const poolKey = (hostname: string, port: number) => `${hostname}:${port}`;

// Heartbeat configuration: interval in ms and enable flag. Disabled by default in test env.
const HEARTBEAT_INTERVAL_MS = process.env.RTSP_HEARTBEAT_INTERVAL_MS
  ? parseInt(process.env.RTSP_HEARTBEAT_INTERVAL_MS, 10)
  : 60_000;
const ENABLE_HEARTBEAT = process.env.RTSP_HEARTBEAT === "1" && process.env.NODE_ENV !== "test";

// Use LRU cache to auto-evict idle sockets after IDLE_CLOSE_MS and call dispose to clean up.
const connectionCache = new LRUCache<string, ConnectionEntry>({
  ttl: IDLE_CLOSE_MS,
  ttlAutopurge: true,
  updateAgeOnGet: true,
  // dispose is called when an entry is evicted/removed; clean up socket and pending requests here
  dispose: (entry?: ConnectionEntry) => {
    if (!entry) return;
    console.log(
      `Disposing RTSP connection entry for socket ${entry.socket.remoteAddress}:${entry.socket.remotePort} due to idle timeout`,
    );

    disposeConnection(entry);
  },
});

function createConnectionEntry(hostname: string, port: number): ConnectionEntry {
  const key = poolKey(hostname, port);
  const socket = net.createConnection(port, hostname);
  const entry: ConnectionEntry = {
    socket,
    buffer: "",
    pending: new Map(),
    nextCSeq: 1,
    heartbeatTimer: null,
  };

  socket.setKeepAlive(true, 60000);
  socket.setNoDelay(true);

  socket.on("data", (data: Buffer) => {
    // Touch the cache so the TTL is refreshed for this connection
    connectionCache.get(key);

    entry.buffer += data.toString();

    // We need to parse RTSP messages properly: read headers, check for Content-Length, and wait for full body
    while (true) {
      const headerEnd = entry.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break; // need more data for headers

      const headerBlock = entry.buffer.slice(0, headerEnd);
      const headerLines = headerBlock.split("\r\n");

      // parse headers into a map
      const headers: Record<string, string> = {};
      for (let i = 1; i < headerLines.length; i++) {
        const line = headerLines[i];
        const sep = line.indexOf(":");
        if (sep === -1) continue;
        const name = line.slice(0, sep).trim().toLowerCase();
        headers[name] = line.slice(sep + 1).trim();
      }

      let contentLength = headers["content-length"] ? parseInt(headers["content-length"], 10) : 0;
      if (isNaN(contentLength)) contentLength = 0;

      // If Content-Length is missing (0) but the immediate bytes after headers look like SDP (start with 'v='),
      // treat the currently available buffer as the full body to avoid parsing the SDP body as a separate RTSP message.
      let totalLength = headerEnd + 4 + contentLength;
      if (contentLength === 0 && entry.buffer.length > headerEnd + 4) {
        const nextTwo = entry.buffer.slice(headerEnd + 4, headerEnd + 6);
        if (nextTwo === "v=") {
          // consume all currently buffered data as the message (heuristic)
          totalLength = entry.buffer.length;
        }
      }

      if (entry.buffer.length < totalLength) break; // wait for full body

      // we have a full RTSP message (headers + optional body)
      const raw = entry.buffer.slice(0, totalLength);
      entry.buffer = entry.buffer.slice(totalLength);

      const lines = raw.split("\r\n");
      const statusLine = (lines[0] || "").trim();

      // find CSeq header (case-insensitive) from parsed headers map OR fallback to scanning lines
      let parsedCSeq: number | null = null;
      if (headers["cseq"]) {
        const n = parseInt(headers["cseq"], 10);
        if (!isNaN(n)) parsedCSeq = n;
      } else {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const sep = line.indexOf(":");
          if (sep === -1) continue;
          const name = line.slice(0, sep).trim().toLowerCase();
          if (name === "cseq") {
            const val = line.slice(sep + 1).trim();
            const n = parseInt(val, 10);
            if (!isNaN(n)) parsedCSeq = n;
            break;
          }
        }
      }

      if (parsedCSeq === null) {
        // No CSeq: nothing to match. Ignore message.
        continue;
      }

      const pending = entry.pending.get(parsedCSeq);
      if (!pending) {
        // No matching pending request (maybe timed out or already handled) - ignore
        continue;
      }
      entry.pending.delete(parsedCSeq);
      clearTimeout(pending.timeoutTimer);

      if (!statusLine.startsWith("RTSP/1.0")) {
        console.warn(`Received non-RTSP response from ${hostname}:${port}: ${statusLine}`);
        pending.resolve("invalid");
        continue;
      }

      const parts = statusLine.split(" ");
      const statusCode = parseInt(parts[1], 10);
      if (isNaN(statusCode)) {
        console.warn(`Received RTSP response with invalid status code from ${hostname}:${port}: ${statusLine}`);
        pending.resolve("invalid");
        continue;
      }

      if (statusCode >= 200 && statusCode < 300) {
        pending.resolve("live");
      } else if (statusCode === 404) {
        pending.resolve("not_found");
      } else {
        pending.resolve("error");
      }
    }
  });

  // On socket errors/close/end, remove the cache entry which triggers dispose to clean up
  socket.on("error", () => {
    connectionCache.delete(key);
  });
  socket.on("close", () => {
    connectionCache.delete(key);
  });
  socket.on("end", () => {
    connectionCache.delete(key);
  });

  // Start heartbeat interval if enabled. Heartbeat sends an OPTIONS request periodically when there are
  // no pending requests for this connection. It uses the same CSeq machinery but ignores the response result.
  if (ENABLE_HEARTBEAT) {
    entry.heartbeatTimer = setInterval(() => {
      try {
        // only send heartbeat when no pending user requests to avoid interfering
        if (entry.pending.size === 0) {
          const cseq = entry.nextCSeq++;
          const req = `OPTIONS rtsp://${hostname}:${port}/ RTSP/1.0\r\nCSeq: ${cseq}\r\n\r\n`;
          // create a short-lived pending entry so responses are matched and cleared
          const timeoutTimer = setTimeout(
            () => {
              entry.pending.delete(cseq);
            },
            Math.max(2000, Math.floor(HEARTBEAT_INTERVAL_MS / 4)),
          );

          const pendingReq: PendingRequest = {
            cseq,
            resolve: () => {},
            reject: () => {},
            timeoutTimer,
          };
          entry.pending.set(cseq, pendingReq);
          entry.socket.write(req);
        }
      } catch {
        // ignore heartbeat write errors
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  console.log(`Created new RTSP connection entry for ${hostname}:${port}`);

  return entry;
}

export function checkStreamStatus(url: string, timeout = 1000): Promise<StreamStatus> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = +(parsed.port || "") || 554; // Default RTSP port
  const key = poolKey(hostname, port);

  let entry = connectionCache.get(key);
  if (!entry) {
    entry = createConnectionEntry(hostname, port);
    connectionCache.set(key, entry);
  }

  return new Promise<StreamStatus>((resolve) => {
    const cseq = entry!.nextCSeq++;
    const describeRequest = `DESCRIBE ${url} RTSP/1.0\r\nCSeq: ${cseq}\r\n\r\n`;

    const timeoutTimer = setTimeout(() => {
      // If timed out waiting for response, remove the pending request and resolve timeout
      entry!.pending.delete(cseq);
      resolve("timeout");
    }, timeout);

    const pendingReq: PendingRequest = {
      cseq,
      resolve: (s: StreamStatus) => {
        resolve(s);
      },
      reject: () => {
        // On socket error, resolve as error
        resolve("error");
      },
      timeoutTimer,
    };

    entry!.pending.set(cseq, pendingReq);

    try {
      if (entry!.socket.destroyed) {
        // recreate entry and socket
        connectionCache.delete(key);
        entry = createConnectionEntry(hostname, port);
        connectionCache.set(key, entry);
      }

      // If socket is not yet connected, write will queue until connected
      entry!.socket.write(describeRequest);
      // touch cache to update TTL when we send a request
      connectionCache.get(key);
    } catch {
      clearTimeout(timeoutTimer);
      // remove pending
      entry!.pending.delete(cseq);
      resolve("error");
    }
  });
}

function disposeConnection(entry: ConnectionEntry) {
  if (entry.heartbeatTimer) {
    try {
      clearInterval(entry.heartbeatTimer);
    } catch {
      // ignore
    }
  }
  try {
    entry.socket.destroy();
  } catch {
    // ignore
  }
  for (const req of entry.pending.values()) {
    clearTimeout(req.timeoutTimer);
    req.reject(new Error("socket closed"));
  }
  entry.pending.clear();
}

// Exported helper to clear and destroy all pooled connections (useful for tests)
export function clearConnectionPool(): void {
  for (const entry of connectionCache.values()) {
    disposeConnection(entry);
  }
  connectionCache.clear();
}
