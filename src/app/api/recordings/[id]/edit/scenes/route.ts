import { NextRequest, NextResponse } from "next/server";
import { getRecordingWithStatsById } from "@/lib/recordings";
import { detectSceneChangesStream, type SceneDetectionStreamEvent } from "@/lib/videoAnalysis";
import { resolveMergedRecordingOutputPath } from "@/lib/recordingFiles";
import { ensureInitialized } from "@/app/api/recordings/route";
import type { SceneRegion } from "@/types/editor";

function encodeSse(event: SceneDetectionStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function parseRegion(value: string | null): SceneRegion | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SceneRegion>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.w === "number" &&
      typeof parsed.h === "number"
    ) {
      return { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h };
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureInitialized();

  try {
    const { id } = await params;
    const recording = getRecordingWithStatsById(id);

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const outputPath = resolveMergedRecordingOutputPath(recording);

    if (!outputPath) {
      return NextResponse.json({ error: "Recording has no finalized merged output file" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const threshold = Number.parseFloat(searchParams.get("threshold") || "0.3");
    const region = parseRegion(searchParams.get("region"));
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (event: SceneDetectionStreamEvent) => {
          controller.enqueue(encoder.encode(encodeSse(event)));
        };

        const abortHandler = () => {
          controller.close();
        };

        request.signal.addEventListener("abort", abortHandler, { once: true });

        detectSceneChangesStream(outputPath, threshold, 200, region, request.signal, push)
          .catch((error) => {
            if (request.signal.aborted) {
              return;
            }

            push({
              type: "error",
              message: error instanceof Error ? error.message : "Failed to detect scenes",
            });
            controller.close();
          })
          .finally(() => {
            request.signal.removeEventListener("abort", abortHandler);
          });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error detecting scenes:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to detect scenes" },
      { status: 500 },
    );
  }
}
