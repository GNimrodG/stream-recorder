import type { Recording, RecordingExecutionResult } from "@/types/recording";
import { ALL_INSTANCES } from "@/types/sync";

const EXECUTION_RESULT_FIELDS = [
  "success",
  "outputPath",
  "completedAt",
  "endedAt",
  "errorMessage",
  "attemptPaths",
] as const satisfies readonly (keyof RecordingExecutionResult)[];

/**
 * Every linked instance runs its own independent copy of an "all"-instances recording under the
 * same id, so a single set of top-level result fields can't describe it: whichever instance
 * finished last would overwrite the others' success/outputPath/parts via sync, pointing them at
 * files on another machine's disk. Those recordings keep each instance's outcome in
 * instanceResults instead; recordings with a single executor keep using the top-level fields.
 *
 * An "all" recording with no instanceResults at all predates this and still reads its top-level
 * fields, so recordings completed before the change keep their history.
 */
function usesInstanceResults(recording: Recording): boolean {
  return recording.executionInstanceId === ALL_INSTANCES && recording.instanceResults !== undefined;
}

export function getLocalExecutionResult(recording: Recording, localInstanceId: string): RecordingExecutionResult {
  const source = usesInstanceResults(recording) ? (recording.instanceResults?.[localInstanceId] ?? {}) : recording;

  return Object.fromEntries(EXECUTION_RESULT_FIELDS.map((field) => [field, source[field]])) as RecordingExecutionResult;
}

/** Whether this instance still has to run (or is running) the recording. */
export function isPendingLocally(recording: Recording, localInstanceId: string): boolean {
  return getLocalExecutionResult(recording, localInstanceId).success === undefined;
}

/**
 * Writes this instance's outcome into the stored recording (mutates it). Doesn't touch the
 * recording's own updatedAt — callers decide whether the change should propagate to peers.
 */
export function setLocalExecutionResult(
  recording: Recording,
  localInstanceId: string,
  result: Partial<RecordingExecutionResult>,
): void {
  if (recording.executionInstanceId !== ALL_INSTANCES) {
    Object.assign(recording, result);
    return;
  }

  const previous = recording.instanceResults?.[localInstanceId] ?? {};
  recording.instanceResults = {
    ...recording.instanceResults,
    [localInstanceId]: { ...previous, ...result, updatedAt: new Date().toISOString() },
  };
}

/** The recording as this instance sees it — top-level result fields reflect the local execution. */
export function toLocalRecordingView<T extends Recording>(recording: T, localInstanceId: string): T {
  if (!usesInstanceResults(recording)) {
    return recording;
  }

  return { ...recording, ...getLocalExecutionResult(recording, localInstanceId) };
}

/**
 * Sync merge hook: the last-write-wins winner carries only the instanceResults its writer knew
 * about, so fold in the other side's entries — each one is written only by its own instance,
 * and the newer copy of an entry wins.
 */
export function mergeInstanceResults(winner: Recording, other: Recording): Recording {
  if (!other.instanceResults) {
    return winner;
  }

  const merged: Record<string, RecordingExecutionResult> = { ...winner.instanceResults };

  for (const [instanceId, entry] of Object.entries(other.instanceResults)) {
    const current = merged[instanceId];
    if (!current || entryTime(entry) > entryTime(current)) {
      merged[instanceId] = entry;
    }
  }

  return { ...winner, instanceResults: merged };
}

function entryTime(entry: RecordingExecutionResult): number {
  return entry.updatedAt ? new Date(entry.updatedAt).getTime() : -Infinity;
}
