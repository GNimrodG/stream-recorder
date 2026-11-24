import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/docker-ffmpeg.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    // Vitest 4 replaced poolOptions.forks.singleFork with these top-level options
    maxWorkers: 1,
    isolate: false,
  },
});
