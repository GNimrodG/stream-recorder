import { SavedStream } from "@/types/stream";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isSupportedStreamUrl, normalizeStreamUrl, supportedStreamUrlError } from "@/lib/streamUrl";
import { getLocalInstanceId, isDeleteAuthoritative, shouldExecuteLocally } from "@/lib/instanceIdentity";
import { addTombstone } from "@/lib/syncTombstones";

const STREAMS_FILE = process.env.STREAMS_FILE_PATH || "./data/streams.json";

type StreamsCacheState = {
  filePath: string;
  streams: SavedStream[] | null;
  fileModifiedTime: number;
};

type StreamsCacheGlobal = typeof globalThis & {
  __streamRecorderStreamsCache?: StreamsCacheState;
};

// Mirrors recordings.ts's process-wide cache so both server component and route-handler
// bundles share the same array and modification timestamp.
const streamsCacheGlobal = globalThis as StreamsCacheGlobal;
const streamsCache =
  streamsCacheGlobal.__streamRecorderStreamsCache?.filePath === STREAMS_FILE
    ? streamsCacheGlobal.__streamRecorderStreamsCache
    : (streamsCacheGlobal.__streamRecorderStreamsCache = {
        filePath: STREAMS_FILE,
        streams: null,
        fileModifiedTime: 0,
      });

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
    streamsCache.streams = [];
    streamsCache.fileModifiedTime = 0;
    return [];
  }

  try {
    const stats = fs.statSync(STREAMS_FILE);
    const fileModifiedTime = stats.mtimeMs;

    if (streamsCache.streams && fileModifiedTime === streamsCache.fileModifiedTime) {
      return streamsCache.streams;
    }

    const data = fs.readFileSync(STREAMS_FILE, "utf-8");
    const streams = JSON.parse(data) as SavedStream[];
    streamsCache.streams = streams;
    streamsCache.fileModifiedTime = fileModifiedTime;
    return streams;
  } catch {
    streamsCache.streams = [];
    streamsCache.fileModifiedTime = 0;
    return [];
  }
}

// Save streams to file
function saveStreams(streams: SavedStream[]): void {
  streamsCache.streams = streams;

  ensureDataDir();
  fs.writeFileSync(STREAMS_FILE, JSON.stringify(streams, null, 2));

  try {
    const stats = fs.statSync(STREAMS_FILE);
    streamsCache.fileModifiedTime = stats.mtimeMs;
  } catch {
    streamsCache.fileModifiedTime = 0;
  }
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
  favorite?: boolean;
  autoRecordWhenLive?: boolean;
  executionInstanceId?: string;
}): SavedStream {
  const streams = loadStreams();
  const now = new Date().toISOString();
  const streamUrl = normalizeStreamUrl(data.rtspUrl);
  if (!isSupportedStreamUrl(streamUrl)) {
    throw new Error(supportedStreamUrlError());
  }

  const localInstanceId = getLocalInstanceId();

  const stream: SavedStream = {
    id: randomUUID(),
    name: data.name,
    rtspUrl: streamUrl,
    description: data.description,
    favorite: data.favorite ?? false,
    autoRecordWhenLive: data.autoRecordWhenLive ?? false,
    createdAt: now,
    updatedAt: now,
    originInstanceId: localInstanceId,
    executionInstanceId: data.executionInstanceId ?? localInstanceId,
  };

  streams.push(stream);
  saveStreams(streams);

  return stream;
}

/** Replaces the entire saved-streams store — used to persist the result of a sync merge. */
export function replaceAllStreams(streams: SavedStream[]): void {
  saveStreams(streams);
}

export function updateStream(id: string, data: Partial<SavedStream>): SavedStream | null {
  const streams = loadStreams();
  const index = streams.findIndex((s) => s.id === id);

  if (index === -1) {
    return null;
  }

  if (!shouldExecuteLocally(streams[index], getLocalInstanceId())) {
    throw new Error("This stream is managed by another linked instance — edit it there instead");
  }

  const stream = streams[index];
  const normalizedData = { ...data };
  if (normalizedData.rtspUrl !== undefined) {
    normalizedData.rtspUrl = normalizeStreamUrl(normalizedData.rtspUrl);
    if (!isSupportedStreamUrl(normalizedData.rtspUrl)) {
      throw new Error(supportedStreamUrlError());
    }
  }
  const updatedStream: SavedStream = {
    ...stream,
    ...normalizedData,
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

  const stream = streams[index];
  const localInstanceId = getLocalInstanceId();
  const isAuthoritative = isDeleteAuthoritative(stream, localInstanceId);

  streams.splice(index, 1);
  saveStreams(streams);

  // Only a delete this instance has delete authority over propagates as authoritative — deleting
  // a mirrored copy (or, for an "all"-instances stream, a non-origin instance's own copy) just
  // stops mirroring/running it locally (see deleteRecording for the same rule).
  if (isAuthoritative) {
    addTombstone({
      id,
      collection: "streams",
      deletedAt: new Date().toISOString(),
      originInstanceId: localInstanceId,
    });
  }

  return true;
}
