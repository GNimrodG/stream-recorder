import { execSync } from "node:child_process";
import { VideoMetadata } from "@/types/editor";

/**
 * Extract video metadata using ffprobe
 */
export function getVideoMetadata(filePath: string): VideoMetadata {
  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";

  try {
    const output = execSync(
      `"${ffprobePath}" -v quiet -show_entries format=duration -show_entries stream=width,height,r_frame_rate,codec_name,bit_rate,channels -show_entries stream=codec_type -of json "${filePath}"`,
      { encoding: "utf-8" },
    );

    const data = JSON.parse(output);
    const format = data.format || {};
    const videoStream = data.streams?.find((s: Record<string, unknown>) => s.codec_type === "video") || {};
    const audioStream = data.streams?.find((s: Record<string, unknown>) => s.codec_type === "audio");

    // Parse frame rate (e.g., "30/1" -> 30)
    let fps: number | undefined;
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      fps = den ? num / den : num;
    }

    return {
      duration: Number.parseFloat(format.duration) || 0,
      width: videoStream.width,
      height: videoStream.height,
      fps: Math.round(fps || 0) || undefined,
      codec: videoStream.codec_name,
      bitrate: videoStream.bit_rate ? Number.parseInt(videoStream.bit_rate) : undefined,
      channels: audioStream?.channels ? Number.parseInt(String(audioStream.channels)) : undefined,
      hasAudio: !!audioStream,
    };
  } catch (error) {
    console.error("Error extracting video metadata:", error);
    throw new Error("Failed to extract video metadata");
  }
}
