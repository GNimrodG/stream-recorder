export interface Recording {
  id: string;
  name: string;
  rtspUrl: string;
  startTime: string; // ISO date string
  duration: number; // Duration in seconds
  status: "scheduled" | "recording" | "completed" | "failed" | "cancelled" | "retrying";
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

  // Optional fields to support retries and tracking
  originalDuration?: number; // the original requested duration
  remainingDuration?: number; // remaining seconds to record (used for retries)
  retryCount?: number; // how many retry attempts have been made
  startedAt?: string; // ISO date when this attempt started
  attemptPaths?: string[]; // list of partial files created for this recording (in order)
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
