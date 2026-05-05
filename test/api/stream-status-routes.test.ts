import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAllStreamsMock,
  getStreamByIdMock,
  checkMultipleStreamStatusWithCodeMock,
  checkStreamStatusWithCodeMock,
  loadSettingsMock,
} = vi.hoisted(() => ({
  getAllStreamsMock: vi.fn(),
  getStreamByIdMock: vi.fn(),
  checkMultipleStreamStatusWithCodeMock: vi.fn(),
  checkStreamStatusWithCodeMock: vi.fn(),
  loadSettingsMock: vi.fn(() => ({
    streamStatusConnectionTimeoutMs: 500,
    streamStatusResponseTimeoutMs: 4000,
  })),
}));

vi.mock("@/lib/streams", () => ({
  getAllStreams: getAllStreamsMock,
  getStreamById: getStreamByIdMock,
}));

vi.mock("@/lib/rtsp", () => ({
  checkMultipleStreamStatusWithCode: checkMultipleStreamStatusWithCodeMock,
  checkStreamStatusWithCode: checkStreamStatusWithCodeMock,
}));

vi.mock("@/lib/settings", () => ({
  loadSettings: loadSettingsMock,
}));

describe("stream status routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getAllStreamsMock.mockReset();
    getStreamByIdMock.mockReset();
    checkMultipleStreamStatusWithCodeMock.mockReset();
    checkStreamStatusWithCodeMock.mockReset();
    loadSettingsMock.mockReset();
    loadSettingsMock.mockReturnValue({
      streamStatusConnectionTimeoutMs: 500,
      streamStatusResponseTimeoutMs: 4000,
    });
  });

  it("returns bulk stream statuses as Server-Sent Events stream", async () => {
    getAllStreamsMock.mockReturnValue([
      { id: "stream-1", rtspUrl: "rtsp://example/live/one" },
      { id: "stream-2", rtspUrl: "rtsp://example/live/two" },
    ]);
    checkStreamStatusWithCodeMock
      .mockResolvedValueOnce({ status: "live" })
      .mockResolvedValueOnce({ status: "resp_timeout", httpStatus: 401 });

    const { GET } = await import("../../src/app/api/streams/status/route");
    const response = await GET();

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-store");

    // Read the streaming response
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      // Parse SSE format: "data: {...}\n\n"
      const messages = fullText.split("\n\n").filter((msg) => msg.includes("data:"));
      expect(messages).toHaveLength(2);

      const first = JSON.parse(messages[0].replace("data: ", ""));
      const second = JSON.parse(messages[1].replace("data: ", ""));

      expect(first).toMatchObject({ id: "stream-1", status: "live" });
      expect(second).toMatchObject({ id: "stream-2", status: "resp_timeout", httpStatus: 401 });
      expect(first.lastChecked).toEqual(expect.any(String));

      // Verify sequential calls
      expect(checkStreamStatusWithCodeMock).toHaveBeenCalledWith("rtsp://example/live/one", 500, 4000);
      expect(checkStreamStatusWithCodeMock).toHaveBeenCalledWith("rtsp://example/live/two", 500, 4000);
    }
  });

  it("returns a single stream status without caching", async () => {
    getStreamByIdMock.mockReturnValue({ id: "stream-1", rtspUrl: "rtsp://example/live/one" });
    checkStreamStatusWithCodeMock.mockResolvedValue({ status: "live" });

    const { GET } = await import("../../src/app/api/streams/[id]/status/route");
    const response = await GET(undefined as never, { params: Promise.resolve({ id: "stream-1" }) });
    const body = (await response.json()) as { id: string; status: string; lastChecked: string };

    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(checkStreamStatusWithCodeMock).toHaveBeenCalledWith("rtsp://example/live/one", 500, 4000);
    expect(body).toMatchObject({ id: "stream-1", status: "live" });
    expect(body.lastChecked).toEqual(expect.any(String));
  });
});
