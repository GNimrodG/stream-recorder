// @vitest-environment jsdom

import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StreamsPageClient from "@/app/streams/StreamsPageClient";

describe("StreamsPageClient UI", () => {
  it("opens and submits the stream dialog", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/streams/status" && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (url === "/api/streams" && method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/streams" && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<StreamsPageClient initialStreams={[]} />);

    await user.click(screen.getByRole("button", { name: "Add Stream" }));
    await user.type(screen.getByLabelText("Stream Name"), "My Stream");
    await user.type(screen.getByLabelText("RTSP URL"), "rtsp://example/new");
    await user.click(screen.getByRole("button", { name: /Save\s*Stream/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/streams", expect.objectContaining({ method: "POST" }));
    });

    expect(await screen.findByText("Stream saved successfully!")).toBeInTheDocument();
  });
});
