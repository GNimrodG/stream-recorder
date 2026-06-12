/**
 * Video editor types for handling video cuts and segments
 */

export interface VideoMetadata {
  duration: number; // in seconds
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  channels?: number;
  hasAudio?: boolean;
}

export interface VideoSegment {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  enabled: boolean; // whether this segment should be kept
}

export interface SceneChange {
  timestamp: number;
  score: number;
}

export interface SceneRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AudioPeaksResponse {
  duration: number;
  peaks: number[];
  channelPeaks?: number[][];
  channels?: number;
  hasAudio: boolean;
}

export interface CutRequest {
  recordingId: string;
  segments: VideoSegment[]; // segments to keep (other parts will be removed)
  codec?: "copy" | "h264" | "h265"; // 'copy' is fastest, uses existing codec
  outputFormat?: "mp4" | "mkv" | "mov";
}

export interface CutResponse {
  success: boolean;
  jobId?: string; // async job ID for tracking progress
  outputPath?: string; // final output path if synchronous
  error?: string;
}

export interface CutJob {
  id: string;
  recordingId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  error?: string;
  outputPath?: string;
  createdAt: string;
  updatedAt: string;
}
