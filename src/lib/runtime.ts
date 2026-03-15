import { ensureAutoRecordingSchedulerInitialized } from "@/lib/autoRecordingScheduler";
import { ensureRecordingsInitialized } from "@/lib/recordings";

let runtimeInitialized = false;

export function ensureAppRuntimeInitialized() {
  if (runtimeInitialized) {
    return;
  }

  ensureRecordingsInitialized();
  ensureAutoRecordingSchedulerInitialized();
  runtimeInitialized = true;
}
