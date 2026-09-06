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
