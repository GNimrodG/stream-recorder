// @vitest-environment jsdom

import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecordingsPageClient from "@/app/recordings/RecordingsPageClient";
import { RecordingWithStatus } from "@/types/recording";

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/recordings",
  useSearchParams: () => new URLSearchParams(),
}));

function getActionButtonByIcon(iconTestId: string): HTMLButtonElement {
  const icon = screen.getByTestId(iconTestId);
  const button = icon.closest("button");
  if (!button) {
    throw new Error(`No button found for icon ${iconTestId}`);
  }
  return button;
}

describe("RecordingsPageClient UI", () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  it("submits edit updates for the selected recording", async () => {
    const user = userEvent.setup();
    const recording: RecordingWithStatus = {
      id: "rec-1",
      name: "Camera A",
      rtspUrl: "rtsp://example/live",
      startTime: "2026-03-19T10:00:00.000Z",
      duration: 3600,
      createdAt: "2026-03-19T09:00:00.000Z",
      updatedAt: "2026-03-19T09:00:00.000Z",
      status: "scheduled",
      isIgnoringLiveStatus: false,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/streams") {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (url === "/api/recordings/rec-1" && method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url.startsWith("/api/recordings?page=")) {
        return new Response(
          JSON.stringify({
            data: [recording],
            pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <RecordingsPageClient
        initialRecordings={[recording]}
        initialPagination={{ page: 1, pageSize: 10, total: 1, totalPages: 1 }}
        initialStatus="all"
      />,
    );

    await user.click(getActionButtonByIcon("EditIcon"));
    expect(await screen.findByRole("heading", { name: "Edit Recording" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update Recording" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/recordings/rec-1", expect.objectContaining({ method: "PATCH" }));
    });

    expect(await screen.findByText("Recording updated successfully!")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Edit Recording" })).not.toBeInTheDocument();
    });
  });
});
