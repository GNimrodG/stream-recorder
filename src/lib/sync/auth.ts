import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getInstanceIdentity } from "@/lib/instanceIdentity";

function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf-8");
  const bufferB = Buffer.from(b, "utf-8");

  // Buffers must be equal length for timingSafeEqual; compare against a same-length
  // buffer first so a length mismatch doesn't leak timing information either.
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export function isAuthorizedSyncRequest(request: NextRequest): boolean {
  const token = extractBearerToken(request);
  if (!token) {
    return false;
  }
  const { syncApiKey } = getInstanceIdentity();
  return safeCompare(token, syncApiKey);
}
