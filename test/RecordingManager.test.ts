/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unused-vars */
// noinspection JSUnusedGlobalSymbols

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Mocks: we'll mock modules that RecordingManager imports by specifier
// The mocks must be registered before importing the module under test.

// In-memory recordings store for getAllRecordings/saveRecordings
let recordingsStore: any[] = [];

// Mock loadSettings
vi.mock("@/lib/settings", () => ({
  loadSettings: () => ({
    outputDirectory: "./test_recordings",
    outputFormat: "mp4",
    ffmpegPath: "ffmpeg",
    reconnectDelay: 1,
  }),
}));

// Mock stream status checker
const checkStreamStatusMock = vi.fn();
vi.mock("@/lib/stream", () => ({
  checkStreamStatus: (...args: unknown[]) => checkStreamStatusMock(...(args as any)),
}));

// Mock ffmpeg helpers
vi.mock("@/lib/ffmpeg", () => ({
  buildFFmpegArgs: (url: string, out: string, duration: number) => ["-i", url, out, "-t", String(duration)],
  mergeRecordingParts: vi.fn((_parts: string[], _out: string) => {
    // default merge behavior in tests is to succeed
    return true;
  }),
}));

// Mock recordings persistence
vi.mock("@/lib/recordings", () => ({
  getAllRecordings: () => recordingsStore,
  saveRecordings: (r: any[]) => {
    recordingsStore = r;
  },
}));

// Mock fs to avoid touching real filesystem — return actual module spread so default export exists
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(() => {}),
    appendFile: vi.fn((_p: string, _data: string, cb: (err?: Error | null) => void) => cb && cb(null)),
    writeFileSync: vi.fn(() => {}),
  };
});

// child_process.spawn mock infrastructure
const spawnedProcesses: any[] = [];
vi.mock("node:child_process", async () => {
  return {
    spawn: vi.fn((_cmd: string, _args: string[]) => {
      const proc = new EventEmitter();
      (proc as any).stdout = new EventEmitter();
      (proc as any).stderr = new EventEmitter();
      (proc as any).pid = Math.floor(Math.random() * 10000) + 1000;
      (proc as any).exitCode = null;
      // make kill a no-op to avoid test race where abort triggers an extra close event
      (proc as any).kill = vi.fn(() => {
        (proc as any).exitCode = 130;
        return true;
      });

      spawnedProcesses.push(proc);
      return proc;
    }),
  };
});

// After mocks are set up, import the module under test
let RecordingManager: any;

beforeEach(async () => {
  // reset state
  recordingsStore = [];
  spawnedProcesses.length = 0;
  checkStreamStatusMock.mockReset();

  // import fresh module to ensure static map is reset between tests
  const mod = await import("../src/lib/RecordingManager");
  RecordingManager = mod.RecordingManager;
  // clear private instances map if present
  try {
    (RecordingManager as any).instances.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecordingManager - constructor validation", () => {
  it("throws when RTSP URL is invalid", () => {
    expect(() => new RecordingManager("1", "Name", "http://not-rtsp", new Date().toISOString(), 10)).toThrow(
      /Invalid RTSP URL/,
    );
  });

  it("throws when duration is non-positive", () => {
    // constructor treats 0 as missing/falsy parameter and throws a missing params error
    expect(() => new RecordingManager("1", "Name", "rtsp://valid", new Date().toISOString(), 0)).toThrow(
      /Missing required parameters for RecordingManager/,
    );
  });

  it("throws when startTime is invalid", () => {
    expect(() => new RecordingManager("1", "Name", "rtsp://valid", "not-a-date", 10)).toThrow(/Invalid start time/);
  });
});
