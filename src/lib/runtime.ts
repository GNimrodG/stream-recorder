import fs from "node:fs";
import { ensureAutoRecordingSchedulerInitialized } from "@/lib/autoRecordingScheduler";
import { ensureRecordingsInitialized } from "@/lib/recordings";
import { ensureSyncSchedulerInitialized } from "@/lib/sync/scheduler";

type AppRuntimeGlobal = typeof globalThis & {
  __streamRecorderRuntimeInitialized?: boolean;
};

// This must be process-wide rather than module-local. Next.js may load this
// module once for a server component bundle and again for an API route bundle.
const appRuntimeGlobal = globalThis as AppRuntimeGlobal;

export function ensureAppRuntimeInitialized() {
  if (appRuntimeGlobal.__streamRecorderRuntimeInitialized) {
    return;
  }

  ensureRecordingsInitialized();
  ensureAutoRecordingSchedulerInitialized();
  ensureSyncSchedulerInitialized();
  appRuntimeGlobal.__streamRecorderRuntimeInitialized = true;
}

/**
 * Checks if running in Docker by looking for /.dockerenv or /proc/1/cgroup
 * @returns True if running in Docker, false otherwise
 */
export function isRunningInDocker(): boolean {
  try {
    // Check for .dockerenv file
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }

    // Check /proc/1/cgroup for docker
    if (fs.existsSync("/proc/1/cgroup")) {
      const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
      return cgroup.includes("docker");
    }

    return false;
  } catch {
    return false;
  }
}
