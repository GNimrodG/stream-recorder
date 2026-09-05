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

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "stream-recorder-instance-identity-"));
  previousInstanceFilePath = process.env.INSTANCE_FILE_PATH;
  previousInstanceName = process.env.INSTANCE_NAME;
  process.env.INSTANCE_FILE_PATH = path.join(temporaryDirectory, "instance.json");
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
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

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
