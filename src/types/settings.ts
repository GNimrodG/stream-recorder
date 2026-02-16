export interface Settings {
  // FFmpeg Settings
  ffmpegPath: string;
  hardwareAcceleration: "auto" | "nvidia" | "intel" | "amd" | "none";
  outputFormat: "mp4" | "mkv" | "avi" | "ts";
  videoCodec: "copy" | "h264" | "h265" | "vp9";
  audioCodec: "copy" | "aac" | "mp3" | "opus";

  // Recording Settings
  defaultDuration: number; // in seconds
  rtspTransport: "tcp" | "udp" | "http";
  reconnectAttempts: number;
  reconnectDelay: number; // in seconds

  // Storage Settings
  outputDirectory: string;
  maxStorageGB: number;
  autoDeleteAfterDays: number;

  // Preview Settings
  previewEnabled: boolean;
  previewQuality: "low" | "medium" | "high";
  snapshotInterval: number; // in seconds
}

export const defaultSettings: Settings = {
  ffmpegPath: "ffmpeg",
  hardwareAcceleration: "auto",
  outputFormat: "mp4",
  videoCodec: "copy",
  audioCodec: "copy",
  defaultDuration: 3600,
  rtspTransport: "tcp",
  reconnectAttempts: 3,
  reconnectDelay: 5,
  outputDirectory: "./recordings",
  maxStorageGB: 0,
  autoDeleteAfterDays: 0,
  previewEnabled: true,
  previewQuality: "medium",
  snapshotInterval: 5,
};
