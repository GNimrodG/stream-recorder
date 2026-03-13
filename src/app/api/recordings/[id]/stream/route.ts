import { NextRequest, NextResponse } from "next/server";
import { getRecordingById } from "@/lib/recordings";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { spawn } from "child_process";
import { RecordingManager } from "@/lib/RecordingManager";
import { loadSettings } from "@/lib/settings";
import { buildFFmpegArgsForPreview } from "@/lib/ffmpeg";

export const runtime = "nodejs";

const LIVE_STREAM_CONTENT_TYPE = "video/mp4";

const createLiveStream = (rtspUrl: string, request: NextRequest) => {
  const settings = loadSettings();
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  const ffmpegArgs = buildFFmpegArgsForPreview(rtspUrl);

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let isClosed = false;

  const killFFmpeg = () => {
    if (ffmpeg.exitCode === null && !ffmpeg.killed) {
      ffmpeg.kill("SIGINT");
    }
  };

  request.signal.addEventListener("abort", killFFmpeg, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ffmpeg.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      ffmpeg.stdout.on("end", () => {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      });

      ffmpeg.stdout.on("error", (error) => {
        if (!isClosed) {
          isClosed = true;
          controller.error(error);
        }
      });

      ffmpeg.stderr.on("data", (data: Buffer) => {
        console.error(`[recording-live-stream] ffmpeg stderr: ${data.toString().trim()}`);
      });

      ffmpeg.on("close", (code, signal) => {
        if (code !== 0 && code !== 255 && !request.signal.aborted) {
          console.error(`[recording-live-stream] ffmpeg exited with code ${code} and signal ${signal || "none"}`);
        }

        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      });

      ffmpeg.on("error", (error) => {
        if (!isClosed) {
          isClosed = true;
          controller.error(error);
        }
      });
    },
    cancel() {
      killFFmpeg();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": LIVE_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Accept-Ranges": "none",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

const streamFile = (file: string, request: NextRequest) => {
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "Output file not found" }, { status: 404 });
  }

  const stat = fs.statSync(file);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  // Determine content type based on file extension
  const ext = path.extname(file).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".ts": "video/mp2t",
    ".webm": "video/webm",
  };
  const contentType = contentTypeMap[ext] || "video/mp4";

  if (range) {
    console.log(
      `Streaming file range: ${file}, Range: ${range}, Content-Type: ${contentType}, File Size: ${fileSize} bytes`,
    );

    // Handle range request for video seeking
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (Number.isNaN(start) || start >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const end = Math.min(requestedEnd, fileSize - 1);
    const chunkSize = end - start + 1;

    const fileStream = fs.createReadStream(file, {
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

  console.log(`Streaming full file: ${file}, Content-Type: ${contentType}, File Size: ${fileSize} bytes`);

  // No range requested - return stream directly
  // This allows proper streaming for large files without buffering
  const fileStream = fs.createReadStream(file);
  const webStream: ReadableStream<Uint8Array> = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileSize.toString(),
      "Accept-Ranges": "bytes",
    },
  });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecordingById(id);

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (!recording.outputPath) {
    const manager = RecordingManager.getInstance(recording.id);

    if (manager && !manager.hasCompleted()) {
      return createLiveStream(recording.rtspUrl, request);
    }

    const lastAttemptFilePath = manager?.lastAttemptFilePath ?? null;

    if (!lastAttemptFilePath) {
      if (recording.rtspUrl) {
        return createLiveStream(recording.rtspUrl, request);
      }

      return NextResponse.json({ error: "Recording has no output file" }, { status: 404 });
    }

    return streamFile(lastAttemptFilePath, request);
  }

  return streamFile(recording.outputPath, request);
}
