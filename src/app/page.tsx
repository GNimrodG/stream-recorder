import DashboardClient from "@/app/DashboardClient";
import { getAllRecordingsWithStats, getRecordingStats } from "@/lib/recordings";
import { ensureAppRuntimeInitialized } from "@/lib/runtime";
import { getStorageStats } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  ensureAppRuntimeInitialized();

  const initialRecordings = getAllRecordingsWithStats()
    .toSorted((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 10);
  const initialStats = getRecordingStats();

  const storageStats = await getStorageStats();

  return (
    <DashboardClient initialRecordings={initialRecordings} initialStats={initialStats} storageStats={storageStats} />
  );
}
