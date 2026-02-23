import { useCallback, useEffect, useState } from "react";
import { RecordingWithStatus } from "@/types/recording";

export default function useRecordings(refreshInterval = 10000, recent = false) {
  const [recordings, setRecordings] = useState<RecordingWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecordings = useCallback(async () => {
    try {
      const response = await fetch("/api/recordings" + (recent ? "/recent" : ""));
      const data = await response.json();
      setRecordings(data);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
    } finally {
      setLoading(false);
    }
  }, [recent]);

  useEffect(() => {
    fetchRecordings().then();
    const interval = setInterval(fetchRecordings, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchRecordings, refreshInterval]);

  return { recordings, loading, fetchRecordings };
}
