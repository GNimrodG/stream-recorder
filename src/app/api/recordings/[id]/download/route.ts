import { NextRequest, NextResponse } from "next/server";
import { getRecordingById } from "@/lib/recordings";
import { resolveMergedRecordingOutputPath } from "@/lib/recordingFiles";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const editedFile = searchParams.get("editedFile");

  let filePath: string;

  if (editedFile) {
    // Support downloading edited/cut files
    filePath = decodeURIComponent(editedFile);

    // Security: ensure the file is within the recordings directory
    const recordingsDir = process.env.RECORDINGS_OUTPUT_DIR || "./recordings";
    const normalizedPath = path.resolve(filePath);
    const normalizedRecordingsDir = path.resolve(recordingsDir);

    if (!normalizedPath.startsWith(normalizedRecordingsDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    // Original logic: download the recording's outputPath
    const recording = getRecordingById(id);

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const resolvedOutputPath = resolveMergedRecordingOutputPath(recording);
    if (!resolvedOutputPath) {
      return NextResponse.json({ error: "Recording has no finalized merged output file" }, { status: 404 });
    }

    filePath = resolvedOutputPath;
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);

  // Stream the file directly without buffering
  const fileStream = fs.createReadStream(filePath);
  const webStream: ReadableStream<Uint8Array> = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": stat.size.toString(),
    },
  });
}
