// Endpoint to check if the stream is live by attempting to capture a snapshot
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getStreamById } from "@/lib/streams";
import os from "os";
import { captureSnapshot } from "@/lib/ffmpeg";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = getStreamById(id);

  if (!stream) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  const snapshotPath = path.join(os.tmpdir(), `snapshot_${id}_${Date.now()}.jpg`);

  let rawFrame = false;

  try {
    await captureSnapshot(stream.rtspUrl, snapshotPath);

    if (!fs.existsSync(snapshotPath)) {
      throw new Error("Snapshot file was not created");
    }

    const snapshotData = fs.readFileSync(snapshotPath);
    rawFrame = request.nextUrl.searchParams.get("raw") === "true";

    if (rawFrame) {
      return new NextResponse(snapshotData, {
        headers: { "Content-Type": "image/jpeg" },
      });
    }

    const base64Image = snapshotData.toString("base64");
    return NextResponse.json(
      {
        snapshot: `data:image/jpeg;base64,${base64Image}`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Error capturing snapshot:", (error as Error).message || error);
    return NextResponse.json(
      { error: "Failed to capture snapshot. Stream may not be live." },
      {
        status: 410,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
  } finally {
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  }
}
