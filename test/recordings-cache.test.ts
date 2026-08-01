import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("@/lib/RecordingManager", () => ({
  RecordingManager: class {
    static getInstance() {
      return null;
    }
  },
}));

vi.mock("@/lib/storage", () => ({
  runStorageCleanup: vi.fn(),
}));

type RecordingsCacheTestGlobal = typeof globalThis & {
  __streamRecorderRecordingsCache?: unknown;
};

let temporaryDirectory: string;
let previousDatabasePath: string | undefined;
let previousOutputDirectory: string | undefined;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "stream-recorder-cache-"));
  previousDatabasePath = process.env.RECORDINGS_DB_PATH;
  previousOutputDirectory = process.env.RECORDINGS_OUTPUT_DIR;
  process.env.RECORDINGS_DB_PATH = path.join(temporaryDirectory, "recordings.json");
  process.env.RECORDINGS_OUTPUT_DIR = path.join(temporaryDirectory, "output");
  fs.writeFileSync(process.env.RECORDINGS_DB_PATH, "[]", "utf-8");
  delete (globalThis as RecordingsCacheTestGlobal).__streamRecorderRecordingsCache;
  vi.resetModules();
});

afterEach(() => {
  if (previousDatabasePath === undefined) {
    delete process.env.RECORDINGS_DB_PATH;
  } else {
    process.env.RECORDINGS_DB_PATH = previousDatabasePath;
  }

  if (previousOutputDirectory === undefined) {
    delete process.env.RECORDINGS_OUTPUT_DIR;
  } else {
    process.env.RECORDINGS_OUTPUT_DIR = previousOutputDirectory;
  }

  delete (globalThis as RecordingsCacheTestGlobal).__streamRecorderRecordingsCache;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("recordings cache", () => {
  it("shares memory-only data across separately evaluated server bundles", async () => {
    const firstBundle = await import("@/lib/recordings");
    expect(firstBundle.getAllRecordings()).toEqual([]);

    const cachedRecordings = [
      {
        id: "recording-1",
        name: "Camera A",
        rtspUrl: "rtsp://example/live",
        startTime: "2026-08-01T12:00:00.000Z",
        duration: 60,
        createdAt: "2026-08-01T11:00:00.000Z",
        updatedAt: "2026-08-01T11:00:00.000Z",
      },
    ];
    firstBundle.saveRecordings(cachedRecordings, false);

    vi.resetModules();
    const secondBundle = await import("@/lib/recordings");

    expect(secondBundle.getAllRecordings()).toBe(cachedRecordings);
  });

  it("reloads the shared cache when the database file changes", async () => {
    const recordings = await import("@/lib/recordings");
    expect(recordings.getAllRecordings()).toEqual([]);

    const externallyWrittenRecordings = [
      {
        id: "recording-2",
        name: "Camera B",
        rtspUrl: "rtsp://example/other",
        startTime: "2026-08-01T13:00:00.000Z",
        duration: 120,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    ];
    const databasePath = process.env.RECORDINGS_DB_PATH!;
    fs.writeFileSync(databasePath, JSON.stringify(externallyWrittenRecordings), "utf-8");
    const modifiedTime = new Date(Date.now() + 5000);
    fs.utimesSync(databasePath, modifiedTime, modifiedTime);

    expect(recordings.getAllRecordings()).toEqual(externallyWrittenRecordings);
  });
});
