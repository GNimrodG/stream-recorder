import { NextRequest } from "next/server";
import { getStreamById } from "@/lib/streams";
import { checkStreamStatus } from "@/lib/stream";
import { StreamStatusResult } from "@/types/stream";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const stream = getStreamById(id);

  if (!stream) {
    return new Response(JSON.stringify({ error: "Stream not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = await checkStreamStatus(stream.rtspUrl);

  return new Response(
    JSON.stringify({ id: stream.id, status, lastChecked: new Date().toISOString() } satisfies StreamStatusResult),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
