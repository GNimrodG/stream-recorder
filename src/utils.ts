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
