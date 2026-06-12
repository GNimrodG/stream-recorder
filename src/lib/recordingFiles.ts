import path from "node:path";
import fs from "node:fs";
import type { Recording } from "@/types/recording";

export function resolveMergedRecordingOutputPath(recording: Pick<Recording, "outputPath">): string | null {
  if (!recording.outputPath) {
    return null;
  }

  const resolvedPath = path.resolve(recording.outputPath);
  const fileName = path.basename(resolvedPath);

  if (/_attempt\d+\./i.test(fileName)) {
    return null;
  }

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  return resolvedPath;
}
