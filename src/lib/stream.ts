import net from "node:net";

export type StreamStatus = "live" | "not_found" | "invalid" | "timeout" | "resp_timeout" | "error";

type StreamStatusMap = Record<string, StreamStatus>;

// Host-level queues to ensure only one parallel request per hostname.
const hostQueues = new Map<string, { running: boolean; queue: Array<() => void> }>();

type ParsedResponse = {
  statusCode: number | null;
  cseq: number | null;
  isRtsp: boolean;
};

function mapStatusCode(statusCode: number): StreamStatus {
  if (statusCode >= 200 && statusCode < 300) {
    return "live";
  }

  if (statusCode === 404) {
    return "not_found";
  }

  return "error";
}

function parseRtspResponse(raw: string): ParsedResponse {
  const lines = raw.split("\r\n");
  const statusLine = (lines[0] || "").trim();

  if (!statusLine.startsWith("RTSP/1.0")) {
    return { statusCode: null, cseq: null, isRtsp: false };
  }

  const parts = statusLine.split(" ");
  const statusCode = Number.parseInt(parts[1], 10);

  const headerEnd = raw.indexOf("\r\n\r\n");
  const headerBlock = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
  const headerLines = headerBlock.split("\r\n");

  let cseq: number | null = null;

  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i];
    const sep = line.indexOf(":");
    if (sep === -1) continue;

    const name = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (name === "cseq") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        cseq = parsed;
      }
      break;
    }
  }

  return {
    statusCode: Number.isNaN(statusCode) ? null : statusCode,
    cseq,
    isRtsp: true,
  };
}

function extractRtspMessage(buffer: string): { raw: string; rest: string } | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

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

  let contentLength = headers["content-length"] ? Number.parseInt(headers["content-length"], 10) : 0;
  if (Number.isNaN(contentLength)) contentLength = 0;

  let totalLength = headerEnd + 4 + contentLength;
  if (contentLength === 0 && buffer.length > headerEnd + 4) {
    const nextTwo = buffer.slice(headerEnd + 4, headerEnd + 6);
    if (nextTwo === "v=") {
      totalLength = buffer.length;
    }
  }

  if (buffer.length < totalLength) return null;

  return {
    raw: buffer.slice(0, totalLength),
    rest: buffer.slice(totalLength),
  };
}

function checkSingleStreamStatus(url: string, connectionTimeout = 1000, responseTimeout = 1000): Promise<StreamStatus> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = +(parsed.port || "") || 554; // Default RTSP port
  const hostKey = hostname; // concurrency is limited per hostname (ignoring port)

  return new Promise<StreamStatus>((resolve) => {
    // The actual work, executed when this request reaches the front of the host queue.
    const start = () => {
      const startTime = Date.now();
      let connectTime = 0;
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

        console.log(
          `Checked ${url} - status: ${status}, connectTime: ${connectTime}ms, totalTime: ${Date.now() - startTime}ms`,
        );

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

      let timeoutTimer: NodeJS.Timeout | null = null;

      socket.setKeepAlive(true, 60000);
      socket.setNoDelay(true);
      socket.setTimeout(connectionTimeout);

      socket.on("data", (data: Buffer) => {
        buffer += data.toString();

        const message = extractRtspMessage(buffer);
        if (!message) {
          return;
        }

        buffer = message.rest;
        const parsedResponse = parseRtspResponse(message.raw);

        if (!parsedResponse.isRtsp || parsedResponse.statusCode === null) {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          finalize("invalid");
          return;
        }

        if (timeoutTimer) clearTimeout(timeoutTimer);
        finalize(mapStatusCode(parsedResponse.statusCode));
      });

      socket.on("error", () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        finalize("error");
      });

      socket.on("close", () => {
        // If socket closed before we settled, treat as error unless already timed out/settled
        if (!settled) {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          finalize("error");
        }
      });

      socket.on("end", () => {
        if (!settled) {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          finalize("error");
        }
      });

      socket.on("timeout", () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        finalize("timeout");
      });

      socket.on("connect", () => {
        connectTime = Date.now() - startTime;
      });

      // Send DESCRIBE once connected (write will queue before connect)
      const cseq = 1;
      const describeRequest = `DESCRIBE ${url} RTSP/1.0\r\nCSeq: ${cseq}\r\n\r\n`;
      try {
        socket.write(describeRequest);
        timeoutTimer = setTimeout(() => {
          finalize("resp_timeout");
        }, responseTimeout);
      } catch {
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

async function checkMultipleStreamStatus(
  urls: string[],
  connectionTimeout = 1000,
  responseTimeout = 1000,
): Promise<StreamStatusMap> {
  const results: StreamStatusMap = {};

  if (urls.length === 0) {
    return results;
  }

  const grouped = new Map<string, Array<{ url: string; hostname: string; port: number }>>();

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const port = +(parsed.port || "") || 554;
      const key = `${hostname}:${port}`;

      const group = grouped.get(key);
      if (group) {
        group.push({ url, hostname, port });
      } else {
        grouped.set(key, [{ url, hostname, port }]);
      }
    } catch {
      results[url] = "invalid";
    }
  }

  await Promise.all(
    Array.from(grouped.values()).map(async (group) => {
      await new Promise<void>((resolve) => {
        let buffer = "";
        let settled = false;
        const startTime = Date.now();
        let connectTime = 0;
        const first = group[0];
        const socket = net.createConnection(first.port, first.hostname);

        const pendingByCseq = new Map<number, { url: string; timer: NodeJS.Timeout }>();
        const completedUrls = new Set<string>();
        let nextCseq = 1;

        const finalizeRequest = (url: string, status: StreamStatus) => {
          if (completedUrls.has(url)) {
            return;
          }

          completedUrls.add(url);
          results[url] = status;

          if (completedUrls.size === group.length) {
            settled = true;
            try {
              socket.destroy();
            } catch {}

            console.log(
              `Checked ${group.length} stream(s) on ${first.hostname}:${first.port} - connectTime: ${connectTime}ms, totalTime: ${Date.now() - startTime}ms`,
            );
            resolve();
          }
        };

        const finalizePending = (status: StreamStatus) => {
          for (const [cseq, pending] of pendingByCseq.entries()) {
            clearTimeout(pending.timer);
            pendingByCseq.delete(cseq);
            finalizeRequest(pending.url, status);
          }

          for (const entry of group) {
            if (!completedUrls.has(entry.url)) {
              finalizeRequest(entry.url, status);
            }
          }
        };

        socket.setKeepAlive(true, 60000);
        socket.setNoDelay(true);
        socket.setTimeout(connectionTimeout);

        socket.on("connect", () => {
          connectTime = Date.now() - startTime;
          // Connection timeout is only needed before connection establishment.
          socket.setTimeout(0);

          for (const { url } of group) {
            const cseq = nextCseq++;
            const describeRequest = `DESCRIBE ${url} RTSP/1.0\r\nCSeq: ${cseq}\r\n\r\n`;

            try {
              socket.write(describeRequest);
              const timer = setTimeout(() => {
                pendingByCseq.delete(cseq);
                finalizeRequest(url, "resp_timeout");
              }, responseTimeout);

              pendingByCseq.set(cseq, { url, timer });
            } catch {
              finalizeRequest(url, "error");
            }
          }
        });

        socket.on("data", (data: Buffer) => {
          buffer += data.toString();

          while (true) {
            const message = extractRtspMessage(buffer);
            if (!message) break;
            buffer = message.rest;

            const parsedResponse = parseRtspResponse(message.raw);

            let cseq: number | undefined;
            if (parsedResponse.cseq !== null && pendingByCseq.has(parsedResponse.cseq)) {
              cseq = parsedResponse.cseq;
            } else {
              const iterator = pendingByCseq.keys();
              cseq = iterator.next().value;
            }

            if (cseq === undefined) {
              continue;
            }

            const pending = pendingByCseq.get(cseq);
            if (!pending) {
              continue;
            }

            pendingByCseq.delete(cseq);
            clearTimeout(pending.timer);

            if (!parsedResponse.isRtsp || parsedResponse.statusCode === null) {
              finalizeRequest(pending.url, "invalid");
            } else {
              finalizeRequest(pending.url, mapStatusCode(parsedResponse.statusCode));
            }
          }
        });

        socket.on("timeout", () => {
          if (!settled) {
            finalizePending("timeout");
          }
        });

        socket.on("error", () => {
          if (!settled) {
            finalizePending("error");
          }
        });

        socket.on("close", () => {
          if (!settled) {
            finalizePending("error");
          }
        });

        socket.on("end", () => {
          if (!settled) {
            finalizePending("error");
          }
        });
      });
    }),
  );

  return results;
}

export function checkStreamStatus(
  url: string,
  connectionTimeout?: number,
  responseTimeout?: number,
): Promise<StreamStatus>;
export function checkStreamStatus(
  urls: string[],
  connectionTimeout?: number,
  responseTimeout?: number,
): Promise<StreamStatusMap>;
export function checkStreamStatus(
  urlOrUrls: string | string[],
  connectionTimeout = 1000,
  responseTimeout = 1000,
): Promise<StreamStatus | StreamStatusMap> {
  if (Array.isArray(urlOrUrls)) {
    return checkMultipleStreamStatus(urlOrUrls, connectionTimeout, responseTimeout);
  }

  return checkSingleStreamStatus(urlOrUrls, connectionTimeout, responseTimeout);
}
