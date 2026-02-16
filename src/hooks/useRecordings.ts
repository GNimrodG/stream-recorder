import { useCallback, useEffect, useState } from "react";
import { Recording } from "@/types/recording";

export default function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecordings = useCallback(async () => {
    try {
      const response = await fetch("/api/recordings");
      const data = await response.json();
      setRecordings(data);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings().then();
    const interval = setInterval(fetchRecordings, 10000);
    return () => clearInterval(interval);
  }, [fetchRecordings]);

  return { recordings, loading, fetchRecordings };
}
