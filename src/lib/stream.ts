import net from "node:net";

export type StreamStatus = "live" | "not_found" | "invalid" | "timeout" | "error";

// Host-level queues to ensure only one parallel request per hostname.
const hostQueues = new Map<string, { running: boolean; queue: Array<() => void> }>();

// Single-request behavior: each _started_ checkStreamStatus creates its own socket, sends DESCRIBE and closes.
// However, only one request per host will be active at a time; additional requests are queued.
export function checkStreamStatus(url: string, timeout = 1000): Promise<StreamStatus> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = +(parsed.port || "") || 554; // Default RTSP port
  const hostKey = hostname; // concurrency is limited per hostname (ignoring port)

  return new Promise<StreamStatus>((resolve) => {
    // The actual work, executed when this request reaches the front of the host queue.
    const start = () => {
      const socket = net.createConnection(port, hostname);
      let buffer = "";
      let settled = false;

      const finalize = (status: StreamStatus) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {}
        resolve(status);

        // Trigger next queued request for this host
        const entry = hostQueues.get(hostKey);
        if (entry) {
          entry.running = false;
          // schedule to avoid reentrancy
          setImmediate(() => {
            const next = entry.queue.shift();
            if (next) {
              entry.running = true;
              next();
            } else {
              hostQueues.delete(hostKey);
            }
          });
        }
      };

      const timeoutTimer = setTimeout(() => {
        finalize("timeout");
      }, timeout);

      socket.setKeepAlive(true, 60000);
      socket.setNoDelay(true);

      socket.on("data", (data: Buffer) => {
        buffer += data.toString();

        // parse RTSP message: headers end with \r\n\r\n, optional Content-Length body
        while (true) {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) break; // need more data

          const headerBlock = buffer.slice(0, headerEnd);
          const headerLines = headerBlock.split("\r\n");

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

          let totalLength = headerEnd + 4 + contentLength;
          if (contentLength === 0 && buffer.length > headerEnd + 4) {
            const nextTwo = buffer.slice(headerEnd + 4, headerEnd + 6);
            if (nextTwo === "v=") {
              totalLength = buffer.length; // heuristic: SDP body present
            }
          }

          if (buffer.length < totalLength) break; // wait for full body

          const raw = buffer.slice(0, totalLength);
          buffer = buffer.slice(totalLength);

          const lines = raw.split("\r\n");
          const statusLine = (lines[0] || "").trim();

          // Only accept RTSP responses
          if (!statusLine.startsWith("RTSP/1.0")) {
            clearTimeout(timeoutTimer);
            finalize("invalid");
            return;
          }

          const parts = statusLine.split(" ");
          const statusCode = parseInt(parts[1], 10);
          if (isNaN(statusCode)) {
            clearTimeout(timeoutTimer);
            finalize("invalid");
            return;
          }

          clearTimeout(timeoutTimer);

          if (statusCode >= 200 && statusCode < 300) {
            finalize("live");
          } else if (statusCode === 404) {
            finalize("not_found");
          } else {
            finalize("error");
          }
        }
      });

      socket.on("error", () => {
        clearTimeout(timeoutTimer);
        finalize("error");
      });

      socket.on("close", () => {
        // If socket closed before we settled, treat as error unless already timed out/settled
        if (!settled) {
          clearTimeout(timeoutTimer);
          finalize("error");
        }
      });

      socket.on("end", () => {
        if (!settled) {
          clearTimeout(timeoutTimer);
          finalize("error");
        }
      });

      // Send DESCRIBE once connected (write will queue before connect)
      const cseq = 1;
      const describeRequest = `DESCRIBE ${url} RTSP/1.0\r\nCSeq: ${cseq}\r\n\r\n`;
      try {
        socket.write(describeRequest);
      } catch {
        clearTimeout(timeoutTimer);
        finalize("error");
      }
    };

    // Enqueue/start the request for this host
    let entry = hostQueues.get(hostKey);
    if (!entry) {
      entry = { running: false, queue: [] };
      hostQueues.set(hostKey, entry);
    }
    entry.queue.push(start);
    if (!entry.running) {
      const next = entry.queue.shift();
      if (next) {
        entry.running = true;
        next();
      }
    }
  });
}
