import { spawn } from "node:child_process";
import { loadSettings } from "@/lib/settings";
import { getVideoMetadata } from "@/lib/videoMetadata";
import type { SceneRegion } from "@/types/editor";

export interface AudioPeaksResult {
  duration: number;
  peaks: number[];
  channelPeaks: number[][];
  channels: number;
  hasAudio: boolean;
}

export interface SceneChangeResult {
  timestamp: number;
  score: number;
}

export interface SceneDetectionStreamEvent {
  type: "start" | "progress" | "scene" | "done" | "error";
  progress?: number;
  fps?: number;
  speed?: string;
  frame?: number;
  message?: string;
  scene?: SceneChangeResult;
  scenes?: SceneChangeResult[];
}

function getFfmpegPath(): string {
  const settings = loadSettings();
  return process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";
}

export async function getAudioPeaks(
  filePath: string,
  targetBars = 240,
  signal?: AbortSignal,
): Promise<AudioPeaksResult> {
  const metadata = getVideoMetadata(filePath);
  if (!metadata.hasAudio || metadata.duration <= 0) {
    return { duration: metadata.duration, peaks: [], channelPeaks: [], channels: 0, hasAudio: false };
  }

  const durationBasedBars = Math.ceil(metadata.duration / 10);
  const resolvedTargetBars = Math.max(targetBars, durationBasedBars);
  const outputChannels = metadata.channels === 1 ? 1 : 2;

  const ffmpegPath = getFfmpegPath();
  const ffmpegArgs = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+genpts+discardcorrupt",
    "-flags",
    "low_delay",
    "-i",
    filePath,
    "-vn",
    "-ac",
    String(outputChannels),
    "-ar",
    "8000",
    "-af",
    "aresample=async=1:first_pts=0",
    "-f",
    "s16le",
    "pipe:1",
  ];

  return await new Promise<AudioPeaksResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      action();
    };

    const handleAbort = () => {
      if (settled) {
        return;
      }
      ffmpeg.kill("SIGINT");
      finish(() => reject(new DOMException("The operation was aborted.", "AbortError")));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    ffmpeg.on("error", (error) => {
      finish(() => reject(error));
    });

    ffmpeg.on("close", () => {
      if (signal?.aborted) {
        return;
      }

      const stdout = Buffer.concat(stdoutChunks);

      if (!stdout || stdout.byteLength === 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        finish(() => reject(new Error(stderr.trim() || "Failed to extract audio peaks")));
        return;
      }

      const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 2));
      if (samples.length === 0) {
        finish(() =>
          resolve({
            duration: metadata.duration,
            peaks: [],
            channelPeaks: [],
            channels: outputChannels,
            hasAudio: true,
          }),
        );
        return;
      }

      const bars = Math.max(48, Math.min(4096, resolvedTargetBars));
      const channelPeaks = Array.from({ length: outputChannels }, () => [] as number[]);
      const frameCount = Math.floor(samples.length / outputChannels);
      const windowSize = Math.max(1, Math.ceil(frameCount / bars));

      for (let frame = 0; frame < frameCount; frame += windowSize) {
        for (let channel = 0; channel < outputChannels; channel++) {
          let peak = 0;
          const endFrame = Math.min(frameCount, frame + windowSize);
          for (let sampleFrame = frame; sampleFrame < endFrame; sampleFrame++) {
            const amplitude = Math.abs(samples[sampleFrame * outputChannels + channel]);
            if (amplitude > peak) {
              peak = amplitude;
            }
          }
          channelPeaks[channel].push(peak / 32768);
        }
      }

      const peaks = channelPeaks.reduce<number[]>((merged, currentChannelPeaks) => {
        currentChannelPeaks.forEach((value, index) => {
          merged[index] = Math.max(merged[index] ?? 0, value);
        });
        return merged;
      }, []);

      const maxPeak = Math.max(...peaks, 0.0001);
      finish(() =>
        resolve({
          duration: metadata.duration,
          peaks: peaks.map((peak) => Math.min(1, peak / maxPeak)),
          channelPeaks: channelPeaks.map((channel) => channel.map((peak) => Math.min(1, peak / maxPeak))),
          channels: outputChannels,
          hasAudio: true,
        }),
      );
    });
  });
}

function buildSceneFilter(region: SceneRegion | null, threshold: number): string[] {
  const safeThreshold = Math.max(0.01, Math.min(1, threshold));
  const sceneSelectFilter = String.raw`select=gt(scene\,${safeThreshold.toFixed(3)})`;
  return region
    ? [
        `crop=iw*${region.w.toFixed(4)}:ih*${region.h.toFixed(4)}:iw*${region.x.toFixed(4)}:ih*${region.y.toFixed(4)}`,
        sceneSelectFilter,
        "showinfo",
      ]
    : [sceneSelectFilter, "showinfo"];
}

export async function detectSceneChangesStream(
  filePath: string,
  threshold = 0.3,
  maxScenes = 200,
  region: SceneRegion | null = null,
  signal?: AbortSignal,
  onEvent?: (event: SceneDetectionStreamEvent) => void,
): Promise<SceneChangeResult[]> {
  const metadata = getVideoMetadata(filePath);
  const ffmpegPath = getFfmpegPath();
  const filterParts = buildSceneFilter(region, threshold);
  const result = spawn(
    ffmpegPath,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "info",
      "-stats_period",
      "0.5",
      "-progress",
      "pipe:2",
      "-i",
      filePath,
      "-an",
      "-vf",
      filterParts.join(","),
      "-f",
      "null",
      "-",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const scenes: SceneChangeResult[] = [];
  const seen = new Set<number>();
  const sceneScorePattern = /scene_score[:=]\s*([0-9.]+)/i;
  const scenePattern = /scene[:=]\s*([0-9.]+)/i;
  const ptsTimePattern = /pts_time[:=]\s*([0-9.]+)/i;
  const framePattern = /frame[:=]\s*(\d+)/i;
  const fpsPattern = /fps[:=]\s*([0-9.]+)/i;
  const speedPattern = /speed[:=]\s*([0-9.]+x|N\/A)/i;
  const estimatedFps = metadata.fps && metadata.fps > 0 ? metadata.fps : 30;
  const estimatedTotalFrames = Math.max(1, Math.round(metadata.duration * estimatedFps));
  let stderrBuffer = "";
  let settled = false;
  let lastFrame = 0;
  let lastFps: number | undefined;
  let lastSpeed: string | undefined;

  onEvent?.({ type: "start", progress: 0, message: "Starting scene analysis" });

  return await new Promise<SceneChangeResult[]>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      try {
        action();
      } finally {
        signal?.removeEventListener("abort", handleAbort);
      }
    };

    const handleAbort = () => {
      if (settled) {
        return;
      }
      result.kill("SIGINT");
      finish(() => reject(new DOMException("The operation was aborted.", "AbortError")));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    const flushLine = (line: string) => {
      const sceneScoreMatch = sceneScorePattern.exec(line) ?? scenePattern.exec(line);
      const ptsTimeMatch = ptsTimePattern.exec(line);
      const frameMatch = framePattern.exec(line);
      const fpsMatch = fpsPattern.exec(line);
      const speedMatch = speedPattern.exec(line);

      if (fpsMatch) {
        const parsedFps = Number.parseFloat(fpsMatch[1]);
        if (Number.isFinite(parsedFps) && parsedFps > 0) {
          lastFps = parsedFps;
        }
      }

      if (speedMatch) {
        lastSpeed = speedMatch[1];
      }

      if (frameMatch) {
        const frame = Number.parseInt(frameMatch[1], 10);
        if (Number.isFinite(frame) && frame >= 0) {
          lastFrame = frame;
          onEvent?.({
            type: "progress",
            frame: lastFrame,
            fps: lastFps,
            speed: lastSpeed,
            progress: Math.max(0, Math.min(99.9, (lastFrame / estimatedTotalFrames) * 100)),
            message: "Analyzing video stream",
          });
        }
      }

      if (!sceneScoreMatch || !ptsTimeMatch) {
        return;
      }

      const timestamp = Number.parseFloat(ptsTimeMatch[1]);
      const score = Number.parseFloat(sceneScoreMatch[1]);

      if (!Number.isFinite(timestamp) || !Number.isFinite(score)) {
        return;
      }

      const scene = { timestamp, score };
      const key = Math.round(scene.timestamp * 10);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      scenes.push(scene);
      scenes.sort((a, b) => a.timestamp - b.timestamp);
      if (scenes.length > maxScenes) {
        scenes.length = maxScenes;
      }
      onEvent?.({
        type: "scene",
        scene,
        progress:
          metadata.duration > 0 ? Math.max(0, Math.min(99.9, (timestamp / metadata.duration) * 100)) : undefined,
        message: `Detected scene at ${timestamp.toFixed(1)}s`,
      });
    };

    result.stderr.on("data", (chunk: Buffer) => {
      if (signal?.aborted || settled) {
        return;
      }

      stderrBuffer += chunk.toString("utf-8");
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";

      for (const line of lines) {
        flushLine(line);
      }
    });

    result.on("error", (error) => {
      finish(() => reject(error));
    });

    result.on("close", () => {
      if (signal?.aborted) {
        return;
      }

      if (stderrBuffer.trim()) {
        flushLine(stderrBuffer);
      }

      const finalScenes = scenes.slice(0, maxScenes).sort((a, b) => a.timestamp - b.timestamp);

      onEvent?.({
        type: "progress",
        progress: 100,
        frame: estimatedTotalFrames,
        fps: lastFps,
        speed: lastSpeed,
        message: "Scene analysis complete",
      });
      onEvent?.({
        type: "done",
        progress: 100,
        scenes: finalScenes,
      });

      finish(() => resolve(finalScenes));
    });
  });
}

export async function detectSceneChanges(
  filePath: string,
  threshold = 0.3,
  maxScenes = 200,
  region: SceneRegion | null = null,
  signal?: AbortSignal,
): Promise<SceneChangeResult[]> {
  return detectSceneChangesStream(filePath, threshold, maxScenes, region, signal);
}
