import { getAllStreams } from "@/lib/streams";
import { checkStreamStatusWithCode } from "@/lib/stream";
import { StreamStatusResult } from "@/types/stream";

export const dynamic = "force-dynamic";

export async function GET() {
  const streams = getAllStreams();
  const lastChecked = new Date().toISOString();

  // Create a readable stream that sends results as Server-Sent Events
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Check streams sequentially per host, sending results as they arrive
        for (const streamData of streams) {
          try {
            const { status, httpStatus } = await checkStreamStatusWithCode(streamData.rtspUrl, 500, 4000);
            const result: StreamStatusResult = {
              id: streamData.id,
              status,
              ...(httpStatus ? { httpStatus } : {}),
              lastChecked,
            };
            const sseMessage = `data: ${JSON.stringify(result)}\n\n`;
            controller.enqueue(new TextEncoder().encode(sseMessage));
          } catch {
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
