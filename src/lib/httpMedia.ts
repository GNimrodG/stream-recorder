export type HttpMediaContainer = "mpegts" | "fmp4" | "unknown";

const MAX_PROBE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 4000;

function getRequestDetails(url: string): { url: URL; headers: HeadersInit } {
  const parsed = new URL(url);
  const headers: Record<string, string> = {
    Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, video/mp4, */*",
  };

  if (parsed.username || parsed.password) {
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    parsed.username = "";
    parsed.password = "";
  }

  return { url: parsed, headers };
}

function looksLikeMpegTs(data: Buffer): boolean {
  if (data.length < 376 || data[0] !== 0x47) return false;
  return data[188] === 0x47 && (data.length < 565 || data[376] === 0x47);
}

/**
 * Inspects the first few bytes of a buffer to determine if it looks like an fMP4 segment.
 * @param data The buffer to inspect.
 * @returns True if the buffer looks like an fMP4 segment, false otherwise.
 */
function looksLikeFmp4(data: Buffer): boolean {
  if (data.length < 8) return false;
  const boxType = data.toString("ascii", 4, 8);
  return boxType === "ftyp" || boxType === "styp" || boxType === "moof";
}

async function readResponsePrefix(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteCount = 0;

  try {
    while (byteCount < MAX_PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      const remaining = MAX_PROBE_BYTES - byteCount;
      const chunk = Buffer.from(value.subarray(0, remaining));
      chunks.push(chunk);
      byteCount += chunk.length;

      const prefix = Buffer.concat(chunks, byteCount);
      if (looksLikeMpegTs(prefix) || looksLikeFmp4(prefix)) break;
    }
  } catch {
    // A timeout can abort a never-ending transport stream after enough bytes
    // have already arrived. The accumulated prefix is still useful.
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks, byteCount);
}

function getPlaylistUris(playlist: string): string[] {
  return playlist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function classifyPlaylist(playlist: string): HttpMediaContainer {
  if (/^#EXT-X-MAP:/im.test(playlist)) return "fmp4";

  const referencedUris = [
    ...getPlaylistUris(playlist),
    ...Array.from(playlist.matchAll(/\bURI="([^"]+)"/gi), (match) => match[1]),
  ];

  if (referencedUris.some((uri) => /\.(?:m4s|mp4)(?:$|[?#])/i.test(uri))) return "fmp4";
  if (referencedUris.some((uri) => /\.ts(?:$|[?#])/i.test(uri))) return "mpegts";
  return "unknown";
}

/**
 * Inspects the HTTP response and, for HLS, its playlist metadata to determine
 * whether media comes from MPEG-TS/ADTS or CMAF/fMP4. This deliberately does
 * not infer the format from the URL extension: some playlist endpoints use
 * names such as `.live.ts` while returning an M3U8 manifest.
 */
export async function detectHttpMediaContainer(
  streamUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  depth = 0,
): Promise<HttpMediaContainer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  try {
    const request = getRequestDetails(streamUrl);
    const response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return "unknown";
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const prefix = await readResponsePrefix(response);

    if (looksLikeMpegTs(prefix) || contentType.includes("video/mp2t")) return "mpegts";
    if (looksLikeFmp4(prefix)) return "fmp4";

    const text = prefix.toString("utf8");
    const isPlaylist = text.trimStart().startsWith("#EXTM3U") || contentType.includes("mpegurl");
    if (!isPlaylist) return "unknown";

    const playlistContainer = classifyPlaylist(text);
    if (playlistContainer !== "unknown") return playlistContainer;

    // Follow an opaque media URI as well as a master-playlist variant. Some
    // providers do not put a useful file extension in segment URLs.
    if (depth < 2) {
      const referencedMedia = getPlaylistUris(text)[0];
      if (referencedMedia) {
        const referencedUrl = new URL(referencedMedia, response.url || streamUrl);
        const sourceUrl = new URL(streamUrl);
        if (!referencedUrl.username && sourceUrl.username) {
          referencedUrl.username = sourceUrl.username;
          referencedUrl.password = sourceUrl.password;
        }
        return detectHttpMediaContainer(referencedUrl.toString(), timeoutMs, depth + 1);
      }
    }

    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timeout);
  }
}
