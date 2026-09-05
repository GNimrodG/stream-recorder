import { StreamStatus } from "@/lib/rtsp";

export interface SavedStream {
  id: string;
  name: string;
  rtspUrl: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
  autoRecordWhenLive?: boolean;
  originInstanceId?: string; // Instance that created this stream (attribution only)
  executionInstanceId?: string; // Instance that should auto-record this stream, or the literal "all"
}

export interface StreamStatusResult {
  id: string;
  status: StreamStatus;
  lastChecked: string;
  httpStatus?: number;
}
