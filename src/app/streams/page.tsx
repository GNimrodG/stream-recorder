import StreamsPageClient from "./StreamsPageClient";
import { getAllStreams } from "@/lib/streams";

export const dynamic = "force-dynamic";

export default async function StreamsPage() {
  const initialStreams = getAllStreams();

  return <StreamsPageClient initialStreams={initialStreams} />;
}
