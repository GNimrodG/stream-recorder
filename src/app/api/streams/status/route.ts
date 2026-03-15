import { getAllStreams } from "@/lib/streams";
import { checkStreamStatus, StreamStatus } from "@/lib/stream";
import { StreamStatusResult } from "@/types/stream";

export async function GET() {
  const streams = getAllStreams();
  const urls = streams.map((stream) => stream.rtspUrl);
  const statusesByUrl = (await checkStreamStatus(urls)) as Record<string, StreamStatus>;
  const lastChecked = new Date().toISOString();

  const status: StreamStatusResult[] = streams.map((stream) => ({
    id: stream.id,
    status: statusesByUrl[stream.rtspUrl] ?? "error",
    lastChecked,
  }));

  return new Response(JSON.stringify(status), {
    headers: { "Content-Type": "application/json" },
  });
}
