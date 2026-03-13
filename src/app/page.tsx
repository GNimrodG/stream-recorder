import DashboardClient from "@/app/DashboardClient";
import { ensureRecordingsInitialized, getAllRecordingsWithStats, getRecordingStats } from "@/lib/recordings";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  ensureRecordingsInitialized();

  const initialRecordings = getAllRecordingsWithStats()
    .toSorted((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 10);
  const initialStats = getRecordingStats();

  return <DashboardClient initialRecordings={initialRecordings} initialStats={initialStats} />;
}
