import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getRecordingById } from "@/lib/recordings";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), "logs");
  const logPath = path.join(logsDir, `recording_${id}.log`);

  if (!fs.existsSync(logPath)) {
    return NextResponse.json({ error: "Log file not found" }, { status: 404 });
  }

  try {
    const stat = fs.statSync(logPath);
    const fileName = path.basename(logPath);
    const fileStream = fs.createReadStream(logPath);
    const chunks: Buffer[] = [];

    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }

    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": stat.size.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || String(err) }, { status: 500 });
  }
}
