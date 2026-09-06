import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultSettings, Settings } from "../../src/types/settings";

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: string;
};

function runProcess(command: string, args: string[], timeoutMs = 30_000): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, { env: process.env });
    } catch (error) {
      reject(error);
      return;
    }

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms\n${stderrText}`));
        return;
      }
      resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: stderrText });
    });
  });
}

function expectSuccess(result: ProcessResult, label: string) {
  expect(result.code, `${label} exited with signal ${result.signal ?? "none"}:\n${result.stderr}`).toBe(0);
  expect(result.stderr, `${label} used an unsupported FFmpeg option`).not.toMatch(
    /Unrecognized option|Option not found|Error parsing options/i,
  );
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP fixture server did not expose a TCP port");
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe("Docker FFmpeg generated arguments", () => {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  let workspace: string;
  let fixturePath: string;
  let streamUrl: string;
  let cmafStreamUrl: string;
  let server: Server;

  beforeAll(async () => {
    await access("/.dockerenv");

    workspace = await mkdtemp(path.join(tmpdir(), "stream-recorder-ffmpeg-"));
    fixturePath = path.join(workspace, "fixture.live.ts");

    const version = await runProcess(ffmpegPath, ["-version"]);
    expectSuccess(version, "ffmpeg -version");
    console.log(version.stdout.toString("utf8").split(/\r?\n/, 1)[0]);

    const fixtureResult = await runProcess(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=15",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "15",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "mpegts",
      "-y",
      fixturePath,
    ]);
    expectSuccess(fixtureResult, "fixture generation");

    const cmafDirectory = path.join(workspace, "cmaf");
    await mkdir(cmafDirectory, { recursive: true });
    const cmafFixtureResult = await runProcess(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=15",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "15",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "hls",
      "-hls_segment_type",
      "fmp4",
      "-hls_time",
      "1",
      "-hls_list_size",
      "0",
      "-hls_fmp4_init_filename",
      "init.mp4",
      "-hls_segment_filename",
      path.join(cmafDirectory, "segment%d.m4s"),
      "-y",
      path.join(cmafDirectory, "playlist.m3u8"),
    ]);
    expectSuccess(cmafFixtureResult, "CMAF HLS fixture generation");

    const fixture = await readFile(fixturePath);
    server = createServer(async (request, response) => {
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
      if (requestPath.startsWith("/cmaf/")) {
        const fileName = path.basename(requestPath);
        if (!/^(?:playlist\.m3u8|init\.mp4|segment\d+\.m4s)$/.test(fileName)) {
          response.writeHead(404).end();
          return;
        }

        try {
          const content = await readFile(path.join(cmafDirectory, fileName));
          const contentType = fileName.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : fileName.endsWith(".m4s")
              ? "video/iso.segment"
              : "video/mp4";
          response.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": content.length,
            "Cache-Control": "no-store",
          });
          response.end(content);
        } catch {
          response.writeHead(404).end();
        }
        return;
      }

      if (requestPath !== "/camera.live.ts") {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, {
        "Content-Type": "video/mp2t",
        "Content-Length": fixture.length,
        "Cache-Control": "no-store",
      });

      // Throttle the fixture to simulate realistic live-delivery pacing,
      // matching the network conditions buildFFmpegArgs is designed for.
      let offset = 0;
      const interval = setInterval(() => {
        if (offset >= fixture.length) {
          clearInterval(interval);
          response.end();
          return;
        }
        const nextOffset = Math.min(offset + 1316, fixture.length);
        response.write(fixture.subarray(offset, nextOffset));
        offset = nextOffset;
      }, 15);
      response.on("close", () => clearInterval(interval));
    });
    const port = await listen(server);
    streamUrl = `http://127.0.0.1:${port}/camera.live.ts`;
    cmafStreamUrl = `http://127.0.0.1:${port}/cmaf/playlist.m3u8`;

    const settingsPath = process.env.SETTINGS_FILE_PATH || path.join(workspace, "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const settings: Settings = {
      ...defaultSettings,
      ffmpegPath,
      hardwareAcceleration: "none",
      outputFormat: "mp4",
      videoCodec: "copy",
      audioCodec: "copy",
      customFFmpegArgs: "",
      logLevel: "warning",
      outputDirectory: workspace,
      reconnectDelay: 1,
    };
    await writeFile(settingsPath, JSON.stringify(settings), "utf8");
    process.env.SETTINGS_FILE_PATH = settingsPath;
  });

  afterAll(async () => {
    if (server) await closeServer(server);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("records, previews, and snapshots an HTTP transport stream with generated params", async () => {
    const { buildFFmpegArgs, buildFFmpegArgsForPreview } = await import("../../src/lib/ffmpeg");
    const { detectHttpMediaContainer } = await import("../../src/lib/httpMedia");
    const { generateSnapshotArgs, loadSettings } = await import("../../src/lib/settings");

    const recordingPath = path.join(workspace, "recording.mp4");
    const mediaContainer = await detectHttpMediaContainer(streamUrl);
    expect(mediaContainer).toBe("mpegts");
    const recordingResult = await runProcess(
      ffmpegPath,
      buildFFmpegArgs(streamUrl, recordingPath, 0.8, mediaContainer),
    );
    expectSuccess(recordingResult, "recording arguments");
    expect((await stat(recordingPath)).size).toBeGreaterThan(1024);

    const probeResult = await runProcess("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      recordingPath,
    ]);
    expectSuccess(probeResult, "recording probe");
    expect(probeResult.stdout.toString("utf8").trim()).toBe("video");

    const previewArgs = buildFFmpegArgsForPreview(streamUrl);
    previewArgs.splice(previewArgs.lastIndexOf("-f"), 0, "-t", "0.8");
    const previewResult = await runProcess(ffmpegPath, previewArgs);
    expectSuccess(previewResult, "preview arguments");
    expect(previewResult.stdout.length).toBeGreaterThan(1024);
    expect(previewResult.stdout.includes(Buffer.from("ftyp"))).toBe(true);

    const snapshotPath = path.join(workspace, "snapshot.jpg");
    const snapshotResult = await runProcess(ffmpegPath, generateSnapshotArgs(streamUrl, snapshotPath, loadSettings()));
    expectSuccess(snapshotResult, "snapshot arguments");
    expect((await stat(snapshotPath)).size).toBeGreaterThan(512);
  });

  it("records CMAF/fMP4 HLS without parsing its audio as ADTS", async () => {
    const { buildFFmpegArgs } = await import("../../src/lib/ffmpeg");
    const { detectHttpMediaContainer } = await import("../../src/lib/httpMedia");
    const recordingPath = path.join(workspace, "cmaf-recording.mp4");
    const mediaContainer = await detectHttpMediaContainer(cmafStreamUrl);
    expect(mediaContainer).toBe("fmp4");
    const args = buildFFmpegArgs(cmafStreamUrl, recordingPath, 0.8, mediaContainer);

    expect(args).not.toContain("aac_adtstoasc");

    const recordingResult = await runProcess(ffmpegPath, args);
    expectSuccess(recordingResult, "CMAF HLS recording arguments");
    expect(recordingResult.stderr).not.toMatch(/Error parsing ADTS|Multiple RDBs per frame/i);
    expect((await stat(recordingPath)).size).toBeGreaterThan(1024);
  });

  it("builds RTSP arguments FFmpeg actually accepts (regression test for the -stimeout/-timeout rename)", async () => {
    const { buildFFmpegArgs } = await import("../../src/lib/ffmpeg");
    // Port 1 has nothing listening, so this fails fast with a connection error — the
    // point is only to confirm FFmpeg gets past argument parsing on the RTSP branch.
    const args = buildFFmpegArgs("rtsp://127.0.0.1:1/does-not-exist", path.join(workspace, "rtsp-attempt.mp4"), 1);
    expect(args).not.toContain("-stimeout");

    const result = await runProcess(ffmpegPath, args, 8000);
    expect(result.stderr, `RTSP arguments used an unsupported FFmpeg option:\n${result.stderr}`).not.toMatch(
      /Unrecognized option|Option not found|Error parsing options/i,
    );
  });
});
