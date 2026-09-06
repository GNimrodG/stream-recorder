/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unused-vars */
// noinspection JSUnusedGlobalSymbols

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";

// Mocks: we'll mock modules that RecordingManager imports by specifier
// The mocks must be registered before importing the module under test.

// In-memory recordings store for getAllRecordings/saveRecordings
let recordingsStore: any[] = [];

// Mock loadSettings
const defaultTestSettings = {
  outputDirectory: "./test_recordings",
  outputFormat: "mp4",
  ffmpegPath: "ffmpeg",
  reconnectDelay: 1,
};
const loadSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

// Mock stream status checker
const checkStreamStatusMock = vi.fn();
vi.mock("@/lib/rtsp", () => ({
  checkStreamStatus: (...args: unknown[]) => checkStreamStatusMock(...(args as any)),
}));

// Mock ffmpeg helpers
vi.mock("@/lib/ffmpeg", () => {
  const build = vi.fn((url: string, out: string, duration: number) => ["-i", url, out, "-t", String(duration)]);
  const merge = vi.fn((_parts: string[], _out: string) => {
    // default merge behavior in tests is to succeed
    return true;
  });

  return {
    buildFFmpegArgs: build,
    mergeRecordingParts: merge,
  };
});

vi.mock("@/lib/ffmpegRtspTimeout", () => ({
  extractUnsupportedRtspTimeoutFlag: () => null,
  reportUnsupportedRtspTimeoutFlag: () => "-timeout",
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
    statSync: vi.fn(() => ({ size: 0 }) as ReturnType<typeof actual.statSync>),
    unlinkSync: vi.fn(() => {}),
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
  loadSettingsMock.mockReset().mockReturnValue(defaultTestSettings);

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
  it("throws when the stream URL protocol is unsupported", () => {
    expect(() => new RecordingManager("1", "Name", "ftp://not-supported", new Date().toISOString(), 10)).toThrow(
      /Invalid stream URL/,
    );
  });

  it("accepts an HTTPS live transport stream URL", () => {
    const manager = new RecordingManager(
      "https-stream",
      "HTTPS Stream",
      "https://example.test/channel.live.ts?token=secret",
      new Date(Date.now() + 60_000).toISOString(),
      10,
    );

    expect(manager.currentStatus).toBe("scheduled");
    clearTimeout((manager as { scheduledStartTimeout: NodeJS.Timeout }).scheduledStartTimeout);
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

describe("RecordingManager - server bundle registry", () => {
  it("shares manager instances across separately evaluated module bundles", async () => {
    const id = "shared-registry-test";
    const future = new Date(Date.now() + 60_000).toISOString();
    recordingsStore.push({
      id,
      name: "TestCam",
      rtspUrl: "rtsp://testcam",
      startTime: future,
      duration: 60,
    });

    const manager = new RecordingManager(id, "TestCam", "rtsp://testcam", future, 60);

    vi.resetModules();
    const separatelyLoadedModule = await import("../src/lib/RecordingManager");

    expect(separatelyLoadedModule.RecordingManager.getInstance(id)).toBe(manager);
    clearTimeout((manager as { scheduledStartTimeout: NodeJS.Timeout }).scheduledStartTimeout);
  });
});

describe("RecordingManager - ignoreDuration behavior", () => {
  it("passes -1 to buildFFmpegArgs when ignoreDuration is true", async () => {
    // arrange: create a pending recording entry so RecordingManager.start() finds it
    const id = "ignore-duration-test";
    const past = new Date(Date.now() - 2000).toISOString();

    recordingsStore.push({
      id,
      name: "TestCam",
      rtspUrl: "rtsp://testcam",
      startTime: past,
      duration: 60,
    });

    // make the stream checker report live immediately
    checkStreamStatusMock.mockResolvedValue("live");

    // arrange: spy console so we can assert on the printed ffmpeg params
    const logSpy = vi.spyOn(console, "log");

    // act: instantiate manager with ignoreDuration = true
    // noinspection JSUnusedLocalSymbols
    const mgr = new RecordingManager(id, "TestCam", "rtsp://testcam", past, 60, true);

    // allow async start path (checkStreamStatus + startRecording) to run
    await new Promise((resolve) => setImmediate(resolve));

    // assert: console was asked to print ffmpeg params and they include '-t -1'
    const called = (logSpy.mock.calls as any[])
      .map((c) => c.join(" "))
      .find((s) => s.includes("Running FFMpeg with params"));

    expect(called).toBeTruthy();
    expect(called).toContain("-t -1");
    logSpy.mockRestore();
  });
});

describe("RecordingManager - attempt recovery", () => {
  it("persists an attempt path before FFmpeg begins writing", async () => {
    const id = "persist-attempt-test";
    const past = new Date(Date.now() - 2000).toISOString();
    recordingsStore.push({
      id,
      name: "TestCam",
      rtspUrl: "rtsp://testcam",
      startTime: past,
      duration: 60,
    });
    checkStreamStatusMock.mockResolvedValue("live");

    new RecordingManager(id, "TestCam", "rtsp://testcam", past, 60);
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordingsStore[0].attemptPaths).toHaveLength(1);
    expect(recordingsStore[0].attemptPaths[0]).toContain("_attempt1.mp4");
  });

  it("hydrates saved attempts and appends the next part after restart", async () => {
    const id = "recover-attempt-test";
    const past = new Date(Date.now() - 2000).toISOString();
    const recoveredPath = "test_recordings/TestCam_previous_attempt1.mp4";
    recordingsStore.push({
      id,
      name: "TestCam",
      rtspUrl: "rtsp://testcam",
      startTime: past,
      duration: 60,
      attemptPaths: [recoveredPath],
    });
    checkStreamStatusMock.mockResolvedValue("live");

    const manager = new RecordingManager(id, "TestCam", "rtsp://testcam", past, 60, false, [recoveredPath]);
    expect(manager.lastAttemptFilePath).toBe(recoveredPath);
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordingsStore[0].attemptPaths).toHaveLength(2);
    expect(recordingsStore[0].attemptPaths).toContain(recoveredPath);
    expect(recordingsStore[0].attemptPaths[1]).toContain("_attempt2.mp4");
  });
});

describe("RecordingManager - retry backoff on repeated zero-frame failures", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("delays the retry instead of respawning FFmpeg immediately", async () => {
    const id = "backoff-test";
    const past = new Date(Date.now() - 2000).toISOString();
    recordingsStore.push({ id, name: "TestCam", rtspUrl: "rtsp://testcam", startTime: past, duration: 6000 });
    checkStreamStatusMock.mockResolvedValue("live");
    loadSettingsMock.mockReturnValue({ ...defaultTestSettings, reconnectDelay: 1, reconnectAttempts: 5 });

    new RecordingManager(id, "TestCam", "rtsp://testcam", past, 6000);
    await flush();
    expect(spawnedProcesses).toHaveLength(1);

    spawnedProcesses[0].emit("close", 1, null); // no "frame=" was ever emitted on stderr
    await flush();
    expect(spawnedProcesses).toHaveLength(1); // must not respawn synchronously

    await wait(1200);
    expect(spawnedProcesses).toHaveLength(2); // respawns after the reconnectDelay backoff
  });

  it("gives up after reconnectAttempts consecutive zero-frame failures", async () => {
    const id = "cap-test";
    const past = new Date(Date.now() - 2000).toISOString();
    recordingsStore.push({ id, name: "TestCam", rtspUrl: "rtsp://testcam", startTime: past, duration: 6000 });
    checkStreamStatusMock.mockResolvedValue("live");
    loadSettingsMock.mockReturnValue({ ...defaultTestSettings, reconnectDelay: 1, reconnectAttempts: 2 });

    new RecordingManager(id, "TestCam", "rtsp://testcam", past, 6000);
    await flush();
    expect(spawnedProcesses).toHaveLength(1);

    spawnedProcesses[0].emit("close", 1, null);
    await wait(1200);
    expect(spawnedProcesses).toHaveLength(2);

    spawnedProcesses[1].emit("close", 1, null); // 2nd consecutive zero-frame failure hits the cap
    await wait(1200);
    expect(spawnedProcesses).toHaveLength(2); // no 3rd attempt — it gave up instead of retrying again

    expect(recordingsStore[0].success).toBe(false);
    expect(recordingsStore[0].errorMessage).toMatch(/failed to start 2 times in a row/);
  });

  it("retries immediately and resets the failure count once FFmpeg has produced a frame", async () => {
    const id = "reset-test";
    const past = new Date(Date.now() - 2000).toISOString();
    recordingsStore.push({ id, name: "TestCam", rtspUrl: "rtsp://testcam", startTime: past, duration: 6000 });
    checkStreamStatusMock.mockResolvedValue("live");
    // A cap of 1 would give up on any zero-frame failure — proves this path never checks it.
    loadSettingsMock.mockReturnValue({ ...defaultTestSettings, reconnectDelay: 1, reconnectAttempts: 1 });

    new RecordingManager(id, "TestCam", "rtsp://testcam", past, 6000);
    await flush();
    expect(spawnedProcesses).toHaveLength(1);

    spawnedProcesses[0].stderr.emit("data", "frame=10 fps=30 q=-1.0 size=100KiB time=00:00:01.00 bitrate=100kbits/s speed=1x");
    spawnedProcesses[0].emit("close", 1, null);
    await flush();

    expect(spawnedProcesses).toHaveLength(2); // retried immediately, no backoff wait needed
  });
});
