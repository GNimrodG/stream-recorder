import fs from "fs";
import path from "path";
import { generateSnapshotArgs, loadSettings } from "@/lib/settings";
import { spawn, spawnSync } from "child_process";
import { Settings } from "@/types/settings";

/**
 * Merges multiple recording part files into a single final recording using FFmpeg's concat demuxer.
 * @param partPaths - Array of file paths to the recording parts that need to be merged
 * @param finalPath - The file path where the final merged recording should be saved
 * @throws Will throw an error if FFmpeg fails to merge the files or if file operations fail
 * @return Returns true if the merge was successful, false if the final file size is significantly smaller than the total size of the parts (indicating a potential issue with the merge)
 */
export function mergeRecordingParts(partPaths: string[], finalPath: string): boolean {
  if (!partPaths?.length) return false;
  if (partPaths.length === 1) {
    // Nothing to merge, just ensure finalPath points to the single part
    const single = partPaths[0];
    if (single !== finalPath) {
      try {
        fs.renameSync(single, finalPath);
      } catch (err) {
        throw new Error(`Failed to move ${single} to ${finalPath}: ${err}`);
      }
    }
    return true;
  }

  // Create a temporary list file with paths escaped for ffmpeg concat
  const listFile = path.join(path.dirname(finalPath), `concat_${path.basename(finalPath)}.txt`);
  const lines = partPaths
    .filter((p) => {
      const exists = fs.existsSync(p);
      if (!exists) {
        console.warn(`Warning: Part file does not exist and will be skipped in concat: ${p}`);
      }
      return exists;
    })
    .map((p) => `file '${path.basename(p).replace(/'/g, "'\\''")}'`);

  if (!lines.length) {
    throw new Error("No valid part files found to merge");
  }

  try {
    fs.writeFileSync(listFile, lines.join("\n"), { encoding: "utf-8" });
  } catch (err) {
    throw new Error(`Failed to write concat list file: ${err}`);
  }

  const settings = loadSettings();
  const ffmpegPath = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  // Run ffmpeg to concat
  const args = ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-y", finalPath];

  console.log(`Merging ${partPaths.length} parts into final recording: ${ffmpegPath} ${args.join(" ")}`);
  const res = spawnSync(ffmpegPath, args, { encoding: "utf-8" });
  console.log(`FFmpeg concat stdout: ${res.stdout}`);

  // Remove the list file
  try {
    fs.unlinkSync(listFile);
  } catch (err) {
    console.warn(`Failed to remove temporary concat list ${listFile}: ${err}`);
  }

  try {
    const finalFileStats = fs.statSync(finalPath);

    let sourceSize = 0;
    for (const part of partPaths) {
      try {
        const stats = fs.statSync(part);
        sourceSize += stats.size;
      } catch (err) {
        console.warn(`Failed to get stats for source part ${part}: ${err}`);
      }
    }

    console.log(`Total size of source parts: ${sourceSize / 1024 / 1024} MB`);

    if (res.status === 0 && finalFileStats.size < sourceSize * 0.9) {
      console.warn(
        `Warning: Final merged file size (${finalFileStats.size / 1024 / 1024} MB) is significantly smaller than total source size (${sourceSize / 1024 / 1024} MB). This may indicate a problem with the merge.`,
      );
      return false;
    } else if (res.status === 0) {
      console.log(`Merge completed successfully with final file size ${finalFileStats.size / 1024 / 1024} MB`);
      // Delete source parts after successful merge
      for (const part of partPaths) {
        try {
          fs.unlinkSync(part);
          console.log(`Deleted source part: ${part}`);
        } catch (err) {
          console.warn(`Failed to delete source part ${part}: ${err}`);
        }
      }
    }
    return true;
  } catch (err) {
    console.warn(`Failed to get stats for final merged file ${finalPath}: ${err}`);
  }

  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`FFmpeg concat failed: ${res.stderr || res.stdout}`);
  }

  return true;
}

// Build FFmpeg arguments based on settings
export function buildFFmpegArgs(rtspUrl: string, outputPath: string, duration: number): string[] {
  const settings = loadSettings();
  const args: string[] = [];

  // Hardware acceleration input options
  if (settings.hardwareAcceleration !== "none") {
    const hwAccel = getHardwareAccelArgs(settings.hardwareAcceleration);
    args.push(...hwAccel.input);
  }

  // RTSP transport
  args.push("-rtsp_transport", settings.rtspTransport);

  // RTSP-specific options for better stability
  args.push("-rtsp_flags", "prefer_tcp");

  // Input
  args.push("-i", rtspUrl);

  // Video codec
  if (settings.videoCodec === "copy") {
    args.push("-c:v", "copy");
  } else {
    const videoEncoder = getVideoEncoder(settings.videoCodec, settings.hardwareAcceleration);
    args.push("-c:v", videoEncoder);
  }

  // Audio codec
  if (settings.audioCodec === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", settings.audioCodec);
  }

  // Duration
  args.push("-t", duration.toString());

  // Output format specific options
  if (settings.outputFormat === "mp4") {
    args.push("-movflags", "+faststart");
  }

  // Overwrite output
  args.push("-y");

  // Output file
  args.push(outputPath);

  return args;
}

function getHardwareAccelArgs(hwAccel: Settings["hardwareAcceleration"]): {
  input: string[];
  output: string[];
} {
  switch (hwAccel) {
    case "nvidia":
      return {
        input: ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
        output: [],
      };
    case "intel":
      return {
        input: ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
        output: [],
      };
    case "amd":
      return {
        input: ["-hwaccel", "amf"],
        output: [],
      };
    case "auto":
      // Try CUDA first (most common), then QSV, then AMF
      return {
        input: ["-hwaccel", "auto"],
        output: [],
      };
    default:
      return { input: [], output: [] };
  }
}

function getVideoEncoder(codec: string, hwAccel: Settings["hardwareAcceleration"]): string {
  if (hwAccel === "none") {
    switch (codec) {
      case "h265":
        return "libx265";
      case "vp9":
        return "libvpx-vp9";
      case "h264":
      default:
        return "libx264";
    }
  }

  if (hwAccel === "nvidia") {
    switch (codec) {
      case "h265":
        return "hevc_nvenc";
      case "h264":
      default:
        return "h264_nvenc";
    }
  }

  if (hwAccel === "intel") {
    switch (codec) {
      case "h265":
        return "hevc_qsv";
      case "vp9":
        return "vp9_qsv";
      case "h264":
      default:
        return "h264_qsv";
    }
  }

  if (hwAccel === "amd") {
    switch (codec) {
      case "h265":
        return "hevc_amf";
      case "h264":
      default:
        return "h264_amf";
    }
  }

  // Auto mode - try to use hardware encoder
  switch (codec) {
    case "h264":
      return "h264_nvenc";
    case "h265":
      return "hevc_nvenc";
    default:
      return "libx264";
  }
}

/**
 * Captures a snapshot from the given RTSP URL and saves it to the specified output path using FFmpeg.
 * @param url The RTSP URL of the stream to capture the snapshot from
 * @param outputPath The file path where the captured snapshot should be saved
 * @returns A promise that resolves when the snapshot is successfully captured and saved, or rejects with an error if the operation fails
 */
export function captureSnapshot(url: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settings = loadSettings();
    const args = generateSnapshotArgs(url, outputPath, settings);
    const ffmpeg = spawn(settings.ffmpegPath, args, { timeout: 10000 });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);

    // Timeout after 10 seconds
    setTimeout(() => {
      ffmpeg.kill();
      reject(new Error("Snapshot timeout"));
    }, 10000);
  });
}
