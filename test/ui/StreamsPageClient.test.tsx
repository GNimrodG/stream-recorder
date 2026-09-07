// @vitest-environment jsdom

import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StreamsPageClient from "@/app/streams/StreamsPageClient";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("StreamsPageClient UI", () => {
  it("opens and submits the stream dialog", async () => {
    const user = userEvent.setup();
    const eventSourceConstructor = vi.fn();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/streams" && method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/streams" && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (url === "/api/sync/instance") {
        return Response.json({ instanceId: "local", syncApiKey: "key", name: "Local", createdAt: "2026-01-01T00:00:00.000Z" });
      }

      if (url === "/api/sync/peers") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    // Mock EventSource for stream status checks
    class MockEventSource {
      static CLOSED = 2;
      onmessage: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = MockEventSource.CLOSED;
      close = vi.fn();

      constructor() {
        eventSourceConstructor();
      }
    }

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);

    render(<StreamsPageClient initialStreams={[]} />);

    await user.click(screen.getByRole("button", { name: "Add Stream" }));
    await user.type(screen.getByLabelText("Stream Name"), "My Stream");
    await user.type(screen.getByLabelText("Stream URL"), "https://example.test/channel.live.ts?token=abc");
    await user.click(screen.getByRole("button", { name: /Save\s*Stream/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/streams", expect.objectContaining({ method: "POST" }));
    });

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      rtspUrl: "https://example.test/channel.live.ts?token=abc",
    });

    expect(await screen.findByText("Stream saved successfully!")).toBeInTheDocument();
    expect(eventSourceConstructor).not.toHaveBeenCalled();
  });

  it("opens the quick record dialog instantly and creates a recording", async () => {
    const user = userEvent.setup();
    pushMock.mockReset();

    const savedStream = {
      id: "stream-1",
      name: "Front Door",
      rtspUrl: "rtsp://cam/front",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      favorite: false,
      autoRecordWhenLive: false,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/streams" && method === "GET") {
        return new Response(JSON.stringify([savedStream]), { status: 200 });
      }

      if (url === "/api/recordings" && method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/sync/instance") {
        return Response.json({ instanceId: "local", syncApiKey: "key", name: "Local", createdAt: "2026-01-01T00:00:00.000Z" });
      }

      if (url === "/api/sync/peers") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    class MockEventSource {
      static CLOSED = 2;
      onmessage: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = MockEventSource.CLOSED;
      close = vi.fn();
    }

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);

    render(<StreamsPageClient initialStreams={[savedStream]} />);

    const quickRecordIcon = screen.getByTestId("RadioButtonCheckedIcon");
    const quickRecordButton = quickRecordIcon.closest("button");
    if (!quickRecordButton) {
      throw new Error("No button found for RadioButtonCheckedIcon");
    }
    await user.click(quickRecordButton);

    // The dialog must be open immediately, with no network round-trip required.
    expect(screen.getByRole("heading", { name: "Schedule New Recording" })).toBeInTheDocument();
    expect(screen.getByLabelText("Recording Name")).toHaveValue("Front Door");
    expect(screen.getByLabelText("Stream URL")).toHaveValue("rtsp://cam/front");

    await waitFor(() => {
      const savedStreamCombobox = screen.getAllByRole("combobox").find((el) => el.textContent === "Front Door");
      expect(savedStreamCombobox).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Schedule Recording" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/recordings", expect.objectContaining({ method: "POST" }));
    });

    const postCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/recordings" && init?.method === "POST");
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      name: "Front Door",
      rtspUrl: "rtsp://cam/front",
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/recordings");
    });
  });
});
