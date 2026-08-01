// @vitest-environment jsdom

import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DashboardClient from "@/app/DashboardClient";
import type { RecordingStats, RecordingWithStatus } from "@/types/recording";

describe("DashboardClient", () => {
  it("edits a scheduled recording from the dashboard", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    const now = "2026-08-01T17:00:00.000Z";
    const recording: RecordingWithStatus = {
      id: "scheduled-1",
      name: "Old name",
      rtspUrl: "https://example.test/channel.live.ts",
      startTime: "2026-08-01T20:00:00.000Z",
      duration: 3600,
      createdAt: now,
      updatedAt: now,
      status: "scheduled",
      isIgnoringLiveStatus: false,
    };
    const stats: RecordingStats = {
      total: 1,
      scheduled: 1,
      starting: 0,
      recording: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retrying: 0,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/streams") return new Response("[]", { status: 200 });
      if (url === "/api/recordings/scheduled-1" && init?.method === "PATCH") {
        return Response.json({ ...recording, name: "New name" });
      }
      if (url === "/api/recordings/recent?length=10") return Response.json([{ ...recording, name: "New name" }]);
      if (url === "/api/recordings/stats") return Response.json(stats);
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardClient
        initialRecordings={[recording]}
        initialStats={stats}
        initialNow={{ iso: now, label: "01/08/2026, 19:00:00" }}
        storageStats={{
          totalGB: 100,
          availableGB: 90,
          usedGB: 10,
          localUsedGB: 1,
          exeternalUsageGB: 9,
          percentageExternal: 9,
          maxGB: 100,
          percentage: 1,
          autoDeleteDays: 0,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Recording Name");
    expect(nameInput).toHaveValue("Old name");
    expect(screen.getByLabelText("Stream URL")).toHaveValue("https://example.test/channel.live.ts");

    await user.clear(nameInput);
    await user.type(nameInput, "New name");
    await user.click(screen.getByRole("button", { name: "Update Recording" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/recordings/scheduled-1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const patchCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/recordings/scheduled-1" && init?.method === "PATCH");
    expect(JSON.parse(patchCall?.[1]?.body as string)).toMatchObject({
      name: "New name",
      rtspUrl: "https://example.test/channel.live.ts",
    });
  });
});
