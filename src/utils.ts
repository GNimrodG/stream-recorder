import { Recording } from "@/types/recording";

/**
 * Formats a duration in seconds into a human-readable string.
 * @param seconds - Duration in seconds
 * @returns A formatted string like "1h 30m" or "45m"
 */
export const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  const remainingSeconds = seconds % 60;

  if (remainingSeconds > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m`;
};

/**
 * Formats an ISO date string into a more readable format.
 * @param dateString - An ISO date string
 * @returns A formatted date string like "9/1/2024, 10:00:00 AM"
 */
export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

/**
 * Calculates the actual duration of a recording based on its start time and either completedAt or endedAt timestamps.
 * @param recording - A recording object
 * @returns The actual duration in seconds, or the original duration if completedAt and endedAt are not available
 */
export const getActualDuration = (recording: Recording) => {
  if (recording.completedAt) {
    return Math.round((new Date(recording.completedAt).getTime() - new Date(recording.startTime).getTime()) / 1000);
  }

  if (recording.endedAt) {
    return Math.round((new Date(recording.endedAt).getTime() - new Date(recording.startTime).getTime()) / 1000);
  }

  return recording.duration;
};
