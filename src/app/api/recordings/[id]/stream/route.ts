import { NextRequest, NextResponse } from "next/server";
import { getRecordingById } from "@/lib/recordings";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (!recording.outputPath) {
    return NextResponse.json({ error: "Recording has no output file" }, { status: 404 });
  }

  if (!fs.existsSync(recording.outputPath)) {
    return NextResponse.json({ error: "Output file not found" }, { status: 404 });
  }

  const stat = fs.statSync(recording.outputPath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  // Determine content type based on file extension
  const ext = path.extname(recording.outputPath).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".ts": "video/mp2t",
    ".webm": "video/webm",
  };
  const contentType = contentTypeMap[ext] || "video/mp4";

  if (range) {
    // Handle range request for video seeking
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const fileStream = fs.createReadStream(recording.outputPath, {
      start,
      end,
    });
    const webStream: ReadableStream<Uint8Array> = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize.toString(),
        "Content-Type": contentType,
      },
    });
  }

  // No range requested - return stream directly
  // This allows proper streaming for large files without buffering
  const fileStream = fs.createReadStream(recording.outputPath);
  const webStream: ReadableStream<Uint8Array> = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileSize.toString(),
      "Accept-Ranges": "bytes",
    },
  });
}
