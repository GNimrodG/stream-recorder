export type StreamUrlKind = "rtsp" | "http";

export function normalizeStreamUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.toLowerCase().startsWith("rtspt://")) {
    return `rtsp://${trimmed.slice("rtspt://".length)}`;
  }

  return trimmed;
}

export function getStreamUrlKind(value: string): StreamUrlKind | null {
  try {
    const parsed = new URL(normalizeStreamUrl(value));

    if (parsed.protocol === "rtsp:") return "rtsp";
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return "http";
  } catch {
    // Invalid URLs are rejected by returning null.
  }

  return null;
}

export function isSupportedStreamUrl(value: string): boolean {
  return getStreamUrlKind(value) !== null;
}

export function supportedStreamUrlError(): string {
  return "Invalid stream URL. Must use rtsp://, http://, or https://";
}
