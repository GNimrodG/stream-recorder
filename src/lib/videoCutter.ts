import { spawn } from "node:child_process";
import fs from "node:fs";
import { VideoSegment, CutJob } from "@/types/editor";
import { loadSettings } from "@/lib/settings";

// Store active cut jobs in memory
const activeCutJobs = new Map<string, CutJob>();

/**
 * Create a new cut job
 */
export function createCutJob(jobId: string, recordingId: string): CutJob {
  const job: CutJob = {
    id: jobId,
    recordingId,
    status: "pending",
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  activeCutJobs.set(jobId, job);
  return job;
}

/**
 * Get cut job status
 */
export function getCutJob(jobId: string): CutJob | undefined {
  return activeCutJobs.get(jobId);
}

/**
 * Update cut job status
 */
export function updateCutJob(jobId: string, updates: Partial<CutJob>): void {
  const job = activeCutJobs.get(jobId);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  }
}

/**
 * Cut a video file by keeping only specified segments
 * Uses FFmpeg concat demuxer to concatenate segments
 */
export function cutVideo(
  inputPath: string,
  outputPath: string,
  segments: VideoSegment[],
  jobId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      reject(new Error(`Input file not found: ${inputPath}`));
      return;
    }

    const settings = loadSettings();
    const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

    // If only one segment that spans the whole video, use -c copy for speed
    if (segments.length === 1 && segments[0].startTime === 0) {
      // Use copy codec for speed
      const args = ["-i", inputPath, "-ss", "0", "-to", String(segments[0].endTime), "-c", "copy", "-y", outputPath];

      const ffmpeg = spawn(ffmpegPath, args);

      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString();
        // Extract progress if available
        if (jobId) {
          const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);
          if (timeMatch) {
            const hours = Number.parseInt(timeMatch[1]);
            const minutes = Number.parseInt(timeMatch[2]);
            const seconds = Number.parseInt(timeMatch[3]);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;
            const progress = Math.min(100, Math.round((totalSeconds / segments[0].endTime) * 100));
            updateCutJob(jobId, { progress });
          }
        }
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          if (jobId) updateCutJob(jobId, { status: "completed", progress: 100 });
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(err);
      });
    } else {
      // Multiple segments or segment doesn't start at 0 - need to concatenate
      cutVideoWithConcat(inputPath, outputPath, segments, ffmpegPath, jobId).then(resolve).catch(reject);
    }
  });
}

/**
 * Cut video using FFmpeg's concat filter or demuxer
 */
function cutVideoWithConcat(
  inputPath: string,
  outputPath: string,
  segments: VideoSegment[],
  ffmpegPath: string,
  jobId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filterParts: string[] = [];

    // Build filter for each segment
    segments.forEach((segment, index) => {
      const start = segment.startTime;
      // trim=start=START:end=END
      filterParts.push(
        `[0:v]trim=start=${start}:end=${segment.endTime}[v${index}]`,
        `[0:a]atrim=start=${start}:end=${segment.endTime}[a${index}]`,
      );
    });

    // Concatenate segments
    const concatVideoParts = segments.map((_, i) => `[v${i}]`).join("");
    const concatAudioParts = segments.map((_, i) => `[a${i}]`).join("");
    filterParts.push(
      `${concatVideoParts}concat=n=${segments.length}[vout]`,
      `${concatAudioParts}concat=n=${segments.length}:v=0:a=1[aout]`,
    );

    const filterComplex = filterParts.join(";");

    const args = [
      "-i",
      inputPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-y",
      outputPath,
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      if (jobId) {
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);
        if (timeMatch) {
          const hours = Number.parseInt(timeMatch[1]);
          const minutes = Number.parseInt(timeMatch[2]);
          const seconds = Number.parseInt(timeMatch[3]);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          const totalDuration = segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
          const progress = Math.min(100, Math.round((totalSeconds / totalDuration) * 100));
          updateCutJob(jobId, { progress });
        }
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        if (jobId) updateCutJob(jobId, { status: "completed", progress: 100 });
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });
  });
}
