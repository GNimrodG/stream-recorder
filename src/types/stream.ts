import { StreamStatus } from "@/lib/stream";

export interface SavedStream {
  id: string;
  name: string;
  rtspUrl: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
}

export interface StreamStatusResult {
  id: string;
  status: StreamStatus;
  lastChecked: string;
}
