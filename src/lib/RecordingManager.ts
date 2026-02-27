import { RecordingStatus } from "@/types/recording";
import { checkStreamStatus } from "@/lib/stream";
import { clearInterval } from "node:timers";
import { loadSettings } from "@/lib/settings";
import fs from "node:fs";
import { buildFFmpegArgs, mergeRecordingParts } from "@/lib/ffmpeg";
import path from "node:path";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { getAllRecordings, saveRecordings } from "@/lib/recordings";

export class RecordingManager {
  private static instances: Map<string, RecordingManager> = new Map();

  public static getInstance(id: string): RecordingManager | null {
    return RecordingManager.instances.get(id) || null;
  }

  private readonly OUTPUT_DIR: string;
  private readonly OUTPUT_FORMAT: string;
  private readonly FFMPEG_PATH: string;
  private readonly LOG_FILE_PATH: string;
  private readonly FINAL_FILE_PATH: string;

  private abortController: AbortController = new AbortController();
  private status: RecordingStatus = "scheduled";
  public get currentStatus(): RecordingStatus {
    return this.status;
  }

  private process: ChildProcessWithoutNullStreams | null = null;

  public get pid(): number | null {
    return this.process?.pid || null;
  }

  private frameCount: number = 0;
  public get frames(): number {
    return this.frameCount;
  }

  private fps: number = 0;
  public get currentFps(): number {
    return this.fps;
  }

  private time: string = "";
  public get currentTime(): string {
    return this.time;
  }

  private bitrate: string = "";
  public get currentBitrate(): string {
    return this.bitrate;
  }

  private speed: number = 0;
  public get currentSpeed(): number {
    return this.speed;
  }

  private ignoreStreamStatus: boolean = false;
  public get isIgnoringStreamStatus(): boolean {
    return this.ignoreStreamStatus;
  }

  public hasStarted(): boolean {
    return this.status === "recording" || this.status === "starting" || this.status === "retrying";
  }

  public hasCompleted(): boolean {
    return this.status === "completed" || this.status === "failed" || this.status === "cancelled";
  }

  private initialStartTime?: string;
  private attemptPaths: string[] = [];

  private scheduledStartTimeout: NodeJS.Timeout | null = null;
  private startWaiterTimer: NodeJS.Timeout | null = null;

  /**
   * Creates a new RecordingManager instance for a specific stream.
   * @param id - Unique identifier for the recording
   * @param name - Name of the recording (usually derived from stream name)
   * @param url - RTSP URL of the stream to record
   * @param startTime - ISO string representing when to start recording
   * @param duration - Duration to record in seconds
   */
  constructor(
    private readonly id: string,
    private name: string,
    private url: string,
    private startTime: string,
    private duration: number,
  ) {
    if (!id || !name || !url || !startTime || !duration) {
      throw new Error("Missing required parameters for RecordingManager");
    }

    if (RecordingManager.instances.has(id)) {
      throw new Error(`RecordingManager with ID ${id} already exists`);
    }

    if (!url.startsWith("rtsp://")) {
      throw new Error("Invalid RTSP URL. Must start with rtsp://");
    }

    if (duration <= 0) {
      throw new Error("Duration must be a positive number");
    }

    if (isNaN(new Date(startTime).getTime())) {
      throw new Error("Invalid start time. Must be a valid ISO date string.");
    }

    this.initialStartTime = startTime;

    const settings = loadSettings();

    this.OUTPUT_DIR = process.env.RECORDINGS_OUTPUT_DIR || settings.outputDirectory || "./recordings";

    if (!fs.existsSync(this.OUTPUT_DIR)) {
      try {
        fs.mkdirSync(this.OUTPUT_DIR, { recursive: true });
      } catch (err) {
        console.error(`Failed to create output directory at ${this.OUTPUT_DIR}:`, err);
        throw err;
      }
    }

    this.OUTPUT_FORMAT = process.env.OUTPUT_FORMAT || settings.outputFormat || "mp4";
    this.FINAL_FILE_PATH = path.join(this.OUTPUT_DIR, `${this.getSanitizedName()}_${this.id}.${this.OUTPUT_FORMAT}`);
    this.FFMPEG_PATH = process.env.FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

    const logsDir = process.env.LOGS_DIR || "./logs";

    if (!fs.existsSync(logsDir)) {
      try {
        fs.mkdirSync(logsDir, { recursive: true });
      } catch (err) {
        // If we fail to create the logs directory, we should still be able to run without logging to files
        console.error(`Failed to create logs directory at ${logsDir}:`, err);
      }
    }

    this.LOG_FILE_PATH = path.join(logsDir, `recording_${this.id}.log`);

    this.log(`Initialized recording manager for stream "${this.name}" with URL: ${this.url}`);

    if (new Date(this.startTime) <= new Date()) {
      this.log("Start time is in the past, starting recording immediately.");
      this.start();
    } else {
      this.log(
        `Recording scheduled to start at ${this.startTime} (in ${Math.round((new Date(this.startTime).getTime() - new Date().getTime()) / 1000)} seconds)`,
      );

      this.scheduledStartTimeout = setTimeout(
        () => this.start(),
        new Date(this.startTime).getTime() - new Date().getTime(),
      );
    }

    RecordingManager.instances.set(this.id, this);
  }

  public start() {
    if (this.status !== "scheduled") {
      this.log(`Cannot start recording because it is in "${this.status}" status.`);
      return;
    }

    if (this.scheduledStartTimeout) {
      clearTimeout(this.scheduledStartTimeout);
      this.scheduledStartTimeout = null;
    }

    if (this.abortController.signal.aborted) {
      this.log("Cannot start recording because it has already been aborted.");
      this.status = "cancelled";
      return;
    }

    const recordings = getAllRecordings();
    const recording = recordings.find((r) => r.id === this.id);

    if (!recording) {
      this.log(`Cannot start recording because it was not found in the recordings list.`);
      this.status = "failed";
      return;
    }

    if (this.getRemainingDuration() <= 0) {
      this.log("Cannot start recording because the scheduled duration has already elapsed.");
      this.status = "failed";
      this.finish("Recording duration has already elapsed before it could start.");
      return;
    }

    recording.startTime = new Date().toISOString();
    saveRecordings(recordings);

    this.status = "starting";

    this.log("Starting recording, checking if stream is live...");

    this._start();
  }

  public stop() {
    this.log("Stopping recording...");

    this.abortController.abort();
    this.status = "cancelled";
  }

  public disableLiveCheck() {
    this.log("Disabling live stream status check, will record regardless of stream status.");
    this.ignoreStreamStatus = true;
  }

  public enableLiveCheck() {
    this.log("Enabling live stream status check, will wait for stream to be live before recording.");
    this.ignoreStreamStatus = false;
  }

  public update(data: { name?: string; url?: string; startTime?: string; duration?: number }) {
    if (this.hasStarted()) {
      throw new Error("Cannot update recording because it has already started.");
    }

    if (this.hasCompleted()) {
      throw new Error("Cannot update recording because it has already completed.");
    }

    if (data.name) {
      this.name = data.name;
    }
    if (data.url) {
      if (!data.url.startsWith("rtsp://")) {
        throw new Error("Invalid RTSP URL provided for update. Must start with rtsp://");
      }
      this.url = data.url;
    }
    if (data.startTime) {
      if (isNaN(new Date(data.startTime).getTime())) {
        throw new Error("Invalid start time provided for update. Must be a valid ISO date string.");
      }
      this.startTime = data.startTime;
    }
    if (data.duration) {
      if (data.duration <= 0) {
        throw new Error("Invalid duration provided for update. Must be a positive number.");
      }
      this.duration = data.duration;
    }

    this.log("Recording updated with new data: " + JSON.stringify(data));

    // Reschedule start if startTime was updated
    if (data.startTime) {
      if (this.scheduledStartTimeout) {
        clearTimeout(this.scheduledStartTimeout);
      }

      if (new Date(this.startTime) <= new Date()) {
        this.log("Updated start time is in the past, starting recording immediately.");
        this.start();
      } else {
        this.log(
          `Recording rescheduled to start at ${this.startTime} (in ${Math.round((new Date(this.startTime).getTime() - new Date().getTime()) / 1000)} seconds)`,
        );

        this.scheduledStartTimeout = setTimeout(
          () => this.start(),
          new Date(this.startTime).getTime() - new Date().getTime(),
        );
      }
    }
  }

  private async _start() {
    try {
      if (this.ignoreStreamStatus) {
        this.log("Live stream status check is disabled, starting recording immediately.");
        this.startRecording().then();
        return;
      }

      const status = await checkStreamStatus(this.url);

      if (this.abortController.signal.aborted) {
        this.log("Recording start aborted before it could begin.");
        this.status = "cancelled";
        this.finish("Recording was cancelled.");
        return;
      }

      if (status === "live") {
        this.log("Stream is live, recording started.");
        this.startRecording().then();
      } else {
        this.log("Stream is not live, waiting for it to go live...");
        this.startWaiter();
      }
    } catch (error) {
      this.log(`Error checking stream status: ${(error as Error).message || error}`);
      this.status = "failed";
    }
  }

  private reconnectAttempts: number = 0;

  private startWaiter() {
    if (this.startWaiterTimer) {
      clearInterval(this.startWaiterTimer);
    }

    this.reconnectAttempts = 0;

    this.startWaiterTimer = setInterval(
      async () => {
        if (this.ignoreStreamStatus) {
          this.log("Live stream status check is disabled, skipping status check and starting recording.");
          this.startRecording().then();

          if (this.startWaiterTimer) {
            clearInterval(this.startWaiterTimer);
            this.startWaiterTimer = null;
          }
          return;
        }

        const status = await checkStreamStatus(this.url);

        this.reconnectAttempts++;
        this.log(`Stream status check #${this.reconnectAttempts}: ${status}`);

        if (this.abortController.signal.aborted) {
          this.log("Recording start aborted while waiting for stream to go live.");
          this.status = "cancelled";
          this.finish("Recording was cancelled.");
          return;
        }

        if (status === "live") {
          this.log("Stream is now live, starting recording...");
          this.startRecording().then();

          if (this.startWaiterTimer) {
            clearInterval(this.startWaiterTimer);
            this.startWaiterTimer = null;
          }
        } else if (
          loadSettings().reconnectAttempts !== -1 && // -1 means infinite attempts
          this.reconnectAttempts >= loadSettings().reconnectAttempts
        ) {
          this.log(
            `Maximum reconnect attempts (${loadSettings().reconnectAttempts}) reached while waiting for stream to go live. Cancelling recording.`,
          );
          this.status = this.attemptPaths.length > 0 ? "completed" : "failed";
          this.finish(
            `Maximum reconnect attempts reached while waiting for stream to go live.` +
              (this.attemptPaths.length > 0 ? " Recording completed with available parts." : ""),
          );
          return;
        } else if (this.getRemainingDuration() <= 0) {
          this.log("Recording duration has elapsed while waiting for stream to go live. Cancelling recording.");
          this.status = this.attemptPaths.length > 0 ? "completed" : "failed";
          this.finish("Recording time elapsed while waiting for stream to go live.");
          return;
        }
      },
      (loadSettings().reconnectDelay || 5) * 1000,
    );

    this.abortController.signal.addEventListener("abort", () => {
      if (this.startWaiterTimer) {
        clearInterval(this.startWaiterTimer);
        this.startWaiterTimer = null;
      }
    });
  }

  private async startRecording() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedName = this.getSanitizedName();
    const attempt = this.attemptPaths.length + 1;

    const outputPath = path.join(
      this.OUTPUT_DIR,
      `${sanitizedName}_${timestamp}_attempt${attempt}.${this.OUTPUT_FORMAT}`,
    );

    // Ensure output directory exists
    if (!fs.existsSync(this.OUTPUT_DIR)) {
      fs.mkdirSync(this.OUTPUT_DIR, { recursive: true });
    }

    const duration = this.getRemainingDuration();
    const ffmpegArgs = buildFFmpegArgs(this.url, outputPath, duration);

    this.log(`Recording to: ${outputPath} for duration: ${duration} seconds`);

    // Spawn FFmpeg process
    this.process = spawn(this.FFMPEG_PATH, ffmpegArgs);

    this.status = "recording";

    this.process!.stdout.on("data", (data) => this.log(`stdout: ${data}`));

    this.process!.stderr.on("data", (data) => {
      this.log(`stderr: ${data}`);

      const line = data.toString();

      if (line.includes("frame=")) {
        const frameMatch = line.match(/frame=\s*(\d+)/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        const timeMatch = line.match(/time=\s*([\d:.]+)/);
        const bitrateMatch = line.match(/bitrate=\s*([\d.]+kbits\/s)/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);

        if (frameMatch) this.frameCount = parseInt(frameMatch[1], 10);
        if (fpsMatch) this.fps = parseFloat(fpsMatch[1]);
        if (timeMatch) this.time = timeMatch[1];
        if (bitrateMatch) this.bitrate = bitrateMatch[1];
        if (speedMatch) this.speed = parseFloat(speedMatch[1]);
      }
    });

    this.process!.on("close", (code, signal) => {
      this.log(`FFmpeg process exited with code ${code} and signal ${signal || "none"}`);
      this.frameCount = 0;
      this.fps = 0;
      this.time = "";
      this.bitrate = "";
      this.speed = 0;

      if (fs.existsSync(this.OUTPUT_DIR)) this.attemptPaths.push(outputPath);

      if (this.abortController.signal.aborted) {
        this.log("Recording was aborted, not checking for completion.");
        this.status = "cancelled";
        this.finish("Recording was cancelled.");
        return;
      }

      const remaining = this.getRemainingDuration();

      if (remaining > 0) {
        this.log(`Recording stopped before completion, ${remaining} seconds remaining. Will retry...`);
        this.status = "retrying";
        this._start();
      } else {
        this.log("Recording completed successfully.");
        this.status = "completed";
        this.finish();
      }
    });

    this.process!.on("error", (err) => {
      this.log(`FFmpeg process error: ${err.message || err}`);
      this.status = "failed";
      this.finish(`Recording failed: ${err.message || err}`);
    });

    this.abortController.signal.addEventListener("abort", () => {
      if (this.process?.exitCode === null) {
        this.log("Aborting recording process...");
        this.process.kill("SIGINT");
      }
    });
  }

  private finish(errorMessage?: string) {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort();
    }

    const recordings = getAllRecordings();
    const recording = recordings.find((r) => r.id === this.id);

    if (recording?.success !== undefined) {
      this.log(`Recording is already marked as ${recording.success ? "completed" : "failed"}, skipping finish.`);
      return;
    }

    if (this.attemptPaths.length > 0) {
      try {
        mergeRecordingParts(this.attemptPaths, this.FINAL_FILE_PATH);
        this.log(`Merged ${this.attemptPaths.length} recording attempts into final file: ${this.FINAL_FILE_PATH}`);
      } catch (err) {
        this.log(`Failed to merge recording attempts: ${(err as Error).message || err}`);
        errorMessage =
          `Recording completed but failed to merge parts: ${(err as Error).message || err}` +
          (errorMessage ? ` | ${errorMessage}` : "");
        this.status = "failed";
      }
    }

    if (!recording) {
      this.log(`Could not find recording with ID ${this.id} to finish.`);
      return;
    }

    recording.success = this.status !== "failed" && this.attemptPaths.length > 0;
    recording.outputPath = recording.success ? this.FINAL_FILE_PATH : undefined;
    recording.errorMessage = errorMessage;
    recording.updatedAt = new Date().toISOString();
    recording.completedAt = new Date().toISOString();

    saveRecordings(recordings);
  }

  private getRemainingDuration(): number {
    if (!this.initialStartTime) {
      this.initialStartTime = this.startTime;
    }

    const now = new Date();
    const start = new Date(this.initialStartTime);
    const elapsed = (now.getTime() - start.getTime()) / 1000;
    return Math.max(0, this.duration - elapsed);
  }

  private log(message: string) {
    console.log(`[REC#${this.id}] ${message}`);

    const logEntry = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFile(this.LOG_FILE_PATH, logEntry, (err) => {
      if (err) {
        console.error(`Failed to write log for recording ${this.id}:`, err);
      }
    });
  }

  private getSanitizedName() {
    return this.name.replace(/[^a-zA-Z0-9]/g, "_");
  }
}
