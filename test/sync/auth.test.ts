import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

let temporaryDirectory: string;
let previousInstanceFilePath: string | undefined;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "stream-recorder-sync-auth-"));
  previousInstanceFilePath = process.env.INSTANCE_FILE_PATH;
  process.env.INSTANCE_FILE_PATH = path.join(temporaryDirectory, "instance.json");
  vi.resetModules();
});

afterEach(() => {
  if (previousInstanceFilePath === undefined) {
    delete process.env.INSTANCE_FILE_PATH;
  } else {
    process.env.INSTANCE_FILE_PATH = previousInstanceFilePath;
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

function makeRequest(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/sync/exchange", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

describe("isAuthorizedSyncRequest", () => {
  it("accepts the correct sync API key", async () => {
    const { getInstanceIdentity } = await import("@/lib/instanceIdentity");
    const { isAuthorizedSyncRequest } = await import("@/lib/sync/auth");
    const identity = getInstanceIdentity();

    expect(isAuthorizedSyncRequest(makeRequest(`Bearer ${identity.syncApiKey}`))).toBe(true);
  });

  it("rejects a wrong key", async () => {
    const { isAuthorizedSyncRequest } = await import("@/lib/sync/auth");
    expect(isAuthorizedSyncRequest(makeRequest("Bearer wrong-key"))).toBe(false);
  });

  it("rejects a key of a different length", async () => {
    const { isAuthorizedSyncRequest } = await import("@/lib/sync/auth");
    expect(isAuthorizedSyncRequest(makeRequest("Bearer short"))).toBe(false);
  });

  it("rejects a missing Authorization header", async () => {
    const { isAuthorizedSyncRequest } = await import("@/lib/sync/auth");
    expect(isAuthorizedSyncRequest(makeRequest())).toBe(false);
  });
});
