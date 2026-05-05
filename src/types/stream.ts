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
}

export interface StreamStatusResult {
  id: string;
  status: StreamStatus;
  lastChecked: string;
  httpStatus?: number;
}
