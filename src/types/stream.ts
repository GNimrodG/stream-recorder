export interface SavedStream {
  id: string;
  name: string;
  rtspUrl: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
}
