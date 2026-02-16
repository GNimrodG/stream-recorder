import { SavedStream } from "@/types/stream";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const STREAMS_FILE = process.env.STREAMS_FILE_PATH || "./data/streams.json";

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(STREAMS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load saved streams from file
function loadStreams(): SavedStream[] {
  ensureDataDir();
  if (!fs.existsSync(STREAMS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(STREAMS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save streams to file
function saveStreams(streams: SavedStream[]): void {
  ensureDataDir();
  fs.writeFileSync(STREAMS_FILE, JSON.stringify(streams, null, 2));
}

export function getAllStreams(): SavedStream[] {
  return loadStreams();
}

export function getStreamById(id: string): SavedStream | undefined {
  const streams = loadStreams();
  return streams.find((s) => s.id === id);
}

export function createStream(data: {
  name: string;
  rtspUrl: string;
  description?: string;
}): SavedStream {
  const streams = loadStreams();
  const now = new Date().toISOString();

  const stream: SavedStream = {
    id: randomUUID(),
    name: data.name,
    rtspUrl: data.rtspUrl,
    description: data.description,
    createdAt: now,
    updatedAt: now,
  };

  streams.push(stream);
  saveStreams(streams);

  return stream;
}

export function updateStream(
  id: string,
  data: Partial<SavedStream>,
): SavedStream | null {
  const streams = loadStreams();
  const index = streams.findIndex((s) => s.id === id);

  if (index === -1) {
    return null;
  }

  const stream = streams[index];
  const updatedStream: SavedStream = {
    ...stream,
    ...data,
    id: stream.id, // Prevent id change
    createdAt: stream.createdAt, // Prevent createdAt change
    updatedAt: new Date().toISOString(),
  };

  streams[index] = updatedStream;
  saveStreams(streams);

  return updatedStream;
}

export function deleteStream(id: string): boolean {
  const streams = loadStreams();
  const index = streams.findIndex((s) => s.id === id);

  if (index === -1) {
    return false;
  }

  streams.splice(index, 1);
  saveStreams(streams);

  return true;
}
