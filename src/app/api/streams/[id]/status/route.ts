import { NextRequest } from "next/server";
import { getStreamById } from "@/lib/streams";
import { checkStreamStatusWithCode } from "@/lib/stream";
import { StreamStatusResult } from "@/types/stream";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const stream = getStreamById(id);

  if (!stream) {
    return new Response(JSON.stringify({ error: "Stream not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { status, httpStatus } = await checkStreamStatusWithCode(stream.rtspUrl, 500, 4000);

  return new Response(
    JSON.stringify({
      id: stream.id,
      status,
      lastChecked: new Date().toISOString(),
      ...(httpStatus && { httpStatus }),
    } satisfies StreamStatusResult),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
