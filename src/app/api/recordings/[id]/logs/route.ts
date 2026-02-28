import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getRecordingById } from "@/lib/recordings";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const stats = fs.statSync(logPath);
    const raw = request.nextUrl.searchParams.get("raw") === "true";
    const tailParam = request.nextUrl.searchParams.get("tail");
    const tail = tailParam ? Math.max(0, parseInt(tailParam, 10) || 0) : 0;

    let content = fs.readFileSync(logPath, "utf-8");

    if (tail > 0) {
      const lines = content.split(/\r?\n/);
      content = lines.slice(-tail).join("\n");
    }

    if (raw) {
      return new NextResponse(content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({
      path: logPath,
      size: stats.size,
      mtime: stats.mtime,
      content,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || String(err) }, { status: 500 });
  }
}
