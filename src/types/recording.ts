export type RecordingStatus =
  | "scheduled"
  | "starting"
  | "recording"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export interface Recording {
  id: string;
  name: string;
  rtspUrl: string;
  startTime: string; // ISO date string
  duration: number; // Duration in seconds
  success?: boolean;
  outputPath?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string; // ISO date string - when recording completed
  endedAt?: string; // ISO date string - when the actual recording ended (stopped or completed)
  errorMessage?: string;
}

export interface RecordingWithStatus extends Recording {
  status: RecordingStatus;
  frames?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  speed?: number;
  isIgnoringLiveStatus: boolean;
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

export type RecordingStats = {
  [key in RecordingStatus]: number;
} & {
  total: number;
};
