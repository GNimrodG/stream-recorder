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
  sourceStreamId?: string;
  autoStopWhenStreamOffline?: boolean;
  success?: boolean;
  outputPath?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string; // ISO date string - when recording completed
  endedAt?: string; // ISO date string - when the actual recording ended (stopped or completed)
  errorMessage?: string;
  ignoreDuration?: boolean;
  attemptPaths?: string[]; // Part files retained for retry and process-restart recovery
  originInstanceId?: string; // Instance that created this recording (attribution only)
  executionInstanceId?: string; // Instance that should run FFmpeg for this recording, or the literal "all"
}

export interface RecordingWithStatus extends Recording {
  status: RecordingStatus;
  frames?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  speed?: number;
  isIgnoringLiveStatus: boolean;
  instanceName?: string; // Resolved display name of the executing instance ("Local" or a peer's name)
  instanceUnreachable?: boolean; // Set when the executing peer couldn't be reached for a live status merge
}

export interface CreateRecordingDto {
  name: string;
  rtspUrl: string;
  startTime: string;
  duration: number;
  ignoreDuration?: boolean;
  executionInstanceId?: string;
}

export type RecordingStats = {
  [key in RecordingStatus]: number;
} & {
  total: number;
};

export type RecordingFilterStatus = RecordingStatus | "all";

export interface RecordingPaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
