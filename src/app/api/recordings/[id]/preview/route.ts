import { NextRequest, NextResponse } from "next/server";
import { getRecordingWithStatsById } from "@/lib/recordings";
import { loadSettings } from "@/lib/settings";
import fs from "fs";
import path from "path";
import os from "os";
import { captureSnapshot } from "@/lib/ffmpeg";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = getRecordingWithStatsById(id);
  const rawFrame = request.nextUrl.searchParams.get("raw") === "true";

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (recording.status !== "recording") {
    if (rawFrame) {
      return NextResponse.json({ error: "Stream is not active" }, { status: 400 });
    }

    return new NextResponse(
      `
      <html lang="en">
        <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">
          <div style="text-align:center;">
            <p>Stream is not currently active</p>
            <p style="color:#888;font-size:14px;">Status: ${recording.status}</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  const settings = loadSettings();

  if (!settings.previewEnabled) {
    if (rawFrame) {
      return NextResponse.json({ error: "Preview is disabled in settings" }, { status: 400 });
    }

    return new NextResponse(
      `
      <html lang="en">
        <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">
          <p>Preview is disabled in settings</p>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  // Generate snapshot
  const snapshotPath = path.join(os.tmpdir(), `preview_${id}.jpg`);

  try {
    await captureSnapshot(recording.rtspUrl, snapshotPath);

    if (fs.existsSync(snapshotPath)) {
      const imageBuffer = fs.readFileSync(snapshotPath);
      fs.unlinkSync(snapshotPath); // Clean up

      if (rawFrame) {
        return new NextResponse(imageBuffer, {
          headers: { "Content-Type": "image/jpeg" },
        });
      }

      // Return HTML with auto-refreshing image
      const base64Image = imageBuffer.toString("base64");
      return new NextResponse(
        `
        <html lang="en">
          <head>
            <meta http-equiv="refresh" content="${settings.snapshotInterval}">
            <style>
              body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              .info { position: absolute; bottom: 10px; left: 10px; color: #fff; font-family: sans-serif; font-size: 12px; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 4px; }
              .live { position: absolute; top: 10px; right: 10px; background: #f44336; color: #fff; padding: 4px 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; font-weight: bold; animation: pulse 1s infinite; }
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            </style>
          </head>
          <body>
            <span class="live">● LIVE</span>
            <img src="data:image/jpeg;base64,${base64Image}" alt="Stream Preview" />
            <div class="info">
              ${recording.name} | Refreshing every ${settings.snapshotInterval}s
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    }
  } catch (error) {
    console.error("Preview error:", error);
  }

  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath); // Clean up if it exists
  }

  if (rawFrame) {
    return NextResponse.json({ error: "Failed to capture preview" }, { status: 500 });
  }

  return new NextResponse(
    `
    <html lang="en">
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">
        <div style="text-align:center;">
          <p>Failed to capture preview</p>
          <p style="color:#888;font-size:14px;">The stream may be unavailable</p>
          <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;cursor:pointer;">Retry</button>
        </div>
      </body>
    </html>
    `,
    {
      headers: { "Content-Type": "text/html" },
    },
  );
}
