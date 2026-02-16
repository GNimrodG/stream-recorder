export interface Recording {
  id: string;
  name: string;
  rtspUrl: string;
  startTime: string; // ISO date string
  duration: number; // Duration in seconds
  status: "scheduled" | "recording" | "completed" | "failed" | "cancelled";
  outputPath?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string; // ISO date string - when recording completed
  errorMessage?: string;
  pid?: number;
  frameCount?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  speed?: number;
}

export interface CreateRecordingDto {
  name: string;
  rtspUrl: string;
  startTime: string;
  duration: number;
}

export interface UpdateRecordingDto {
  name?: string;
  rtspUrl?: string;
  startTime?: string;
  duration?: number;
}

export interface RecordingStats {
  total: number;
  scheduled: number;
  recording: number;
  completed: number;
  failed: number;
}
