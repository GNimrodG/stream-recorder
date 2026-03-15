import StreamsPageClient from "./StreamsPageClient";
import { getAllStreams } from "@/lib/streams";
import { ensureAppRuntimeInitialized } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default async function StreamsPage() {
  ensureAppRuntimeInitialized();
  const initialStreams = getAllStreams();

  return <StreamsPageClient initialStreams={initialStreams} />;
}
