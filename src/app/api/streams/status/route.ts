import { getAllStreams } from "@/lib/streams";
import { checkStreamStatusWithCode } from "@/lib/rtsp";
import { loadSettings } from "@/lib/settings";
import { StreamStatusResult } from "@/types/stream";

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  const streams = getAllStreams();
  const lastChecked = new Date().toISOString();
  const settings = loadSettings();
  const streamStatusConnectionTimeoutMs = settings.streamStatusConnectionTimeoutMs ?? 500;
  const streamStatusResponseTimeoutMs = settings.streamStatusResponseTimeoutMs ?? 4000;

  // Create a readable stream that sends results as Server-Sent Events
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the client disconnects, the request.signal will be aborted. Listen and stop work.
      const signal = request?.signal;
      const onAbort = () => {
        try {
          controller.close();
        } catch {}
      };

      signal?.addEventListener("abort", onAbort);

      try {
        // Check streams sequentially per host, sending results as they arrive
        for (const streamData of streams) {
          // stop if client disconnected
          if (signal?.aborted) break;

          try {
            const { status, httpStatus } = await checkStreamStatusWithCode(
              streamData.rtspUrl,
              streamStatusConnectionTimeoutMs,
              streamStatusResponseTimeoutMs,
            );

            if (signal?.aborted) break;

            const result: StreamStatusResult = {
              id: streamData.id,
              status,
              ...(httpStatus ? { httpStatus } : {}),
              lastChecked,
            };
            const sseMessage = `data: ${JSON.stringify(result)}\n\n`;
            controller.enqueue(new TextEncoder().encode(sseMessage));
          } catch {
            if (signal?.aborted) break;

            const result: StreamStatusResult = {
              id: streamData.id,
              status: "error",
              lastChecked,
            };
            const sseMessage = `data: ${JSON.stringify(result)}\n\n`;
            controller.enqueue(new TextEncoder().encode(sseMessage));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
