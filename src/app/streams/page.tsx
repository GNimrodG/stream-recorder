import StreamsPageClient from "./StreamsPageClient";
import { getAllStreams } from "@/lib/streams";

export default async function StreamsPage() {
  const initialStreams = getAllStreams();

  return <StreamsPageClient initialStreams={initialStreams} />;
}
