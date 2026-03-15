import { describe, expect, it } from "vitest";
import { parseCustomFFmpegArgs } from "@/lib/ffmpegArgs";

describe("parseCustomFFmpegArgs", () => {
  it("returns empty array for empty input", () => {
    expect(parseCustomFFmpegArgs("")).toEqual([]);
    expect(parseCustomFFmpegArgs("   ")).toEqual([]);
    expect(parseCustomFFmpegArgs(undefined)).toEqual([]);
  });

  it("splits simple arguments", () => {
    expect(parseCustomFFmpegArgs("-fflags +nobuffer -max_delay 500000")).toEqual([
      "-fflags",
      "+nobuffer",
      "-max_delay",
      "500000",
    ]);
  });

  it("supports quoted values", () => {
    expect(parseCustomFFmpegArgs("-user_agent \"My Agent\" -metadata 'title=Live Feed'")).toEqual([
      "-user_agent",
      "My Agent",
      "-metadata",
      "title=Live Feed",
    ]);
  });

  it("supports escaped spaces", () => {
    expect(parseCustomFFmpegArgs(String.raw`-metadata title=My\ Live\ Feed`)).toEqual([
      "-metadata",
      "title=My Live Feed",
    ]);
  });
});
