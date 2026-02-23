import { getAllStreams } from "@/lib/streams";
import { checkStreamStatus } from "@/lib/stream";
import { StreamStatusResult } from "@/types/stream";

export async function GET() {
  const streams = getAllStreams();

  const status: StreamStatusResult[] = await Promise.all(
    streams.map(async (stream) => ({
      id: stream.id,
      status: await checkStreamStatus(stream.rtspUrl),
      lastChecked: new Date().toISOString(),
    })),
  );

  return new Response(JSON.stringify(status), {
    headers: { "Content-Type": "application/json" },
  });
}
