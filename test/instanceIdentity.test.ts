import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const hostname = vi.fn(() => "test-host");
  // Cover both the named export and the default-export (CJS interop) shapes, since
  // src/lib/instanceIdentity.ts uses `import os from "node:os"`.
  return { ...actual, hostname, default: { ...actual, hostname } };
});

let temporaryDirectory: string;
let previousInstanceFilePath: string | undefined;
let previousInstanceName: string | undefined;
let previousSyncPeersFilePath: string | undefined;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "stream-recorder-instance-identity-"));
  previousInstanceFilePath = process.env.INSTANCE_FILE_PATH;
  previousInstanceName = process.env.INSTANCE_NAME;
  previousSyncPeersFilePath = process.env.SYNC_PEERS_FILE_PATH;
  process.env.INSTANCE_FILE_PATH = path.join(temporaryDirectory, "instance.json");
  process.env.SYNC_PEERS_FILE_PATH = path.join(temporaryDirectory, "sync-peers.json");
  delete process.env.INSTANCE_NAME;
  vi.resetModules();
});

afterEach(() => {
  if (previousInstanceFilePath === undefined) {
    delete process.env.INSTANCE_FILE_PATH;
  } else {
    process.env.INSTANCE_FILE_PATH = previousInstanceFilePath;
  }
  if (previousInstanceName === undefined) {
    delete process.env.INSTANCE_NAME;
  } else {
    process.env.INSTANCE_NAME = previousInstanceName;
  }
  if (previousSyncPeersFilePath === undefined) {
    delete process.env.SYNC_PEERS_FILE_PATH;
  } else {
    process.env.SYNC_PEERS_FILE_PATH = previousSyncPeersFilePath;
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

function seedOnePeer() {
  fs.writeFileSync(
    process.env.SYNC_PEERS_FILE_PATH!,
    JSON.stringify([
      {
        id: "peer-row-1",
        instanceId: "peer-instance",
        name: "Peer",
        baseUrl: "http://peer.test",
        remoteApiKey: "key",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
}

describe("instance name defaults", () => {
  it("defaults a freshly-created instance's name to the machine hostname", async () => {
    const { getInstanceIdentity } = await import("@/lib/instanceIdentity");
    expect(getInstanceIdentity().name).toBe("test-host");
  });

  it("uses INSTANCE_NAME instead of the hostname when creating a new instance", async () => {
    process.env.INSTANCE_NAME = "Home Base";
    const { getInstanceIdentity } = await import("@/lib/instanceIdentity");
    expect(getInstanceIdentity().name).toBe("Home Base");
  });

  it("INSTANCE_NAME overrides an already-stored name on every read", async () => {
    const { getInstanceIdentity, updateInstanceIdentity } = await import("@/lib/instanceIdentity");
    updateInstanceIdentity({ name: "Custom Stored Name" });

    process.env.INSTANCE_NAME = "Env Override";
    expect(getInstanceIdentity().name).toBe("Env Override");

    delete process.env.INSTANCE_NAME;
    expect(getInstanceIdentity().name).toBe("Custom Stored Name");
  });

  it("persists a name set via updateInstanceIdentity when no env override is set", async () => {
    const { getInstanceIdentity, updateInstanceIdentity } = await import("@/lib/instanceIdentity");
    updateInstanceIdentity({ name: "Renamed Instance" });
    expect(getInstanceIdentity().name).toBe("Renamed Instance");
  });
});

describe("isDeleteAuthoritative", () => {
  it("gives the origin instance delete authority even when a linked peer executes the item", async () => {
    seedOnePeer();
    const { isDeleteAuthoritative } = await import("@/lib/instanceIdentity");

    const item = { id: "1", updatedAt: "2026-01-01T00:00:00.000Z", originInstanceId: "local", executionInstanceId: "peer-instance" };

    // Sanity check this scenario actually exercises the gap the origin check exists for:
    // without it, a coordinator-only node that never executes anything would never be
    // authoritative over its own creations.
    const { shouldExecuteLocally } = await import("@/lib/instanceIdentity");
    expect(shouldExecuteLocally(item, "local")).toBe(false);

    expect(isDeleteAuthoritative(item, "local")).toBe(true);
  });

  it("denies delete authority to an instance that neither originated nor executes the item", async () => {
    seedOnePeer();
    const { isDeleteAuthoritative } = await import("@/lib/instanceIdentity");

    const item = { id: "1", updatedAt: "2026-01-01T00:00:00.000Z", originInstanceId: "peer-instance", executionInstanceId: "peer-instance" };

    expect(isDeleteAuthoritative(item, "local")).toBe(false);
  });

  it("gives the executing instance delete authority when it isn't the origin", async () => {
    seedOnePeer();
    const { isDeleteAuthoritative } = await import("@/lib/instanceIdentity");

    const item = { id: "1", updatedAt: "2026-01-01T00:00:00.000Z", originInstanceId: "peer-instance", executionInstanceId: "local" };

    expect(isDeleteAuthoritative(item, "local")).toBe(true);
  });

  it("only the origin instance may delete an \"all\"-scoped item", async () => {
    seedOnePeer();
    const { isDeleteAuthoritative } = await import("@/lib/instanceIdentity");

    const ownItem = { id: "1", updatedAt: "2026-01-01T00:00:00.000Z", originInstanceId: "local", executionInstanceId: "all" };
    const foreignItem = { id: "2", updatedAt: "2026-01-01T00:00:00.000Z", originInstanceId: "peer-instance", executionInstanceId: "all" };

    expect(isDeleteAuthoritative(ownItem, "local")).toBe(true);
    expect(isDeleteAuthoritative(foreignItem, "local")).toBe(false);
  });
});
