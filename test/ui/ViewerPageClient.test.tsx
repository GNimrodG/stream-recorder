// @vitest-environment jsdom

import "./setup";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ViewerPageClient from "@/app/viewer/ViewerPageClient";
import type { RecordingWithStatus } from "@/types/recording";

const recording: RecordingWithStatus = {
  id: "rec-1",
  name: "Recorded Session",
  rtspUrl: "rtsp://example/live",
  startTime: "2026-03-19T10:00:00.000Z",
  duration: 3600,
  createdAt: "2026-03-19T09:00:00.000Z",
  updatedAt: "2026-03-19T09:00:00.000Z",
  status: "completed",
  outputPath: "/recordings/rec-1.mp4",
  isIgnoringLiveStatus: false,
};

const { replaceMock, fetchRecordingsMock, searchParams } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  fetchRecordingsMock: vi.fn(),
  searchParams: new URLSearchParams("recordingId=rec-1"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/viewer",
  useSearchParams: () => searchParams,
}));

vi.mock("@/hooks/useRecordings", () => ({
  default: () => ({ recordings: [recording], loading: false, fetchRecordings: fetchRecordingsMock }),
}));

describe("ViewerPageClient deep-link handling", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    fetchRecordingsMock.mockReset();
    searchParams.set("recordingId", "rec-1");
  });

  it("handles recordingId once and does not reopen after closing", async () => {
    const user = userEvent.setup();

    render(<ViewerPageClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith("/viewer", { scroll: false });
    });

    const closeIcon = screen.getByTestId("CloseIcon");
    const closeButton = closeIcon.closest("button");
    if (!closeButton) {
      throw new Error("Close button was not found");
    }

    await user.click(closeButton);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });
  });
});
