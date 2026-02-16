import { NextRequest, NextResponse } from "next/server";
import { getRecordingById } from "@/lib/recordings";
import fs from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (!recording.outputPath) {
    return NextResponse.json(
      { error: "Recording has no output file" },
      { status: 404 },
    );
  }

  if (!fs.existsSync(recording.outputPath)) {
    return NextResponse.json(
      { error: "Output file not found" },
      { status: 404 },
    );
  }

  const stat = fs.statSync(recording.outputPath);
  const fileName = path.basename(recording.outputPath);

  // Stream the file
  const fileStream = fs.createReadStream(recording.outputPath);
  const chunks: Buffer[] = [];

  for await (const chunk of fileStream) {
    chunks.push(chunk as Buffer);
  }

  const buffer = Buffer.concat(chunks);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": stat.size.toString(),
    },
  });
}
