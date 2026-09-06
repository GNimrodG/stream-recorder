// @vitest-environment jsdom

import "./setup";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecordingGapsDialog from "@/components/dialogs/RecordingGapsDialog";
import { RecordingWithStatus } from "@/types/recording";

describe("RecordingGapsDialog", () => {
  it("renders a summary and a row per detected connection gap", async () => {
    const logContent = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 600 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:02:00.000Z] stderr: Connection timed out",
      "[2026-08-01T10:02:00.500Z] FFmpeg process exited with code 1 and signal none",
      "[2026-08-01T10:02:00.600Z] Last error message: Connection timed out",
      "[2026-08-01T10:02:05.700Z] Recording stopped before completion, 480.0 seconds remaining. Will retry...",
      "[2026-08-01T10:02:20.700Z] Recording to: /out/cam_attempt2.mp4 for duration: 480 seconds",
      "[2026-08-01T10:02:22.000Z] Recording has started, frames are being received.",
      "[2026-08-01T10:04:00.000Z] stderr: Server returned 503 Service Unavailable",
      "[2026-08-01T10:04:00.500Z] FFmpeg process exited with code 1 and signal none",
      "[2026-08-01T10:04:00.600Z] Last error message: Server returned 503 Service Unavailable",
      "[2026-08-01T10:04:10.700Z] Recording stopped before completion, 349.0 seconds remaining. Will retry...",
      "[2026-08-01T10:04:15.700Z] Recording to: /out/cam_attempt3.mp4 for duration: 349 seconds",
      "[2026-08-01T10:04:16.000Z] Recording has started, frames are being received.",
      "[2026-08-01T10:10:00.000Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:10:00.100Z] Recording completed successfully.",
    ].join("\n");

    const recording: RecordingWithStatus = {
      id: "rec-with-gaps",
      name: "Camera A",
      rtspUrl: "rtsp://cam",
      startTime: "2026-08-01T10:00:00.000Z",
      duration: 600,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:10:00.100Z",
      status: "completed",
      isIgnoringLiveStatus: false,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === `/api/recordings/${recording.id}/logs`) {
        return new Response(JSON.stringify({ content: logContent }), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecordingGapsDialog open recording={recording} onCloseAction={() => {}} />);

    expect(await screen.findByText(/2 drops detected, totalling/)).toBeInTheDocument();

    const rows = await screen.findAllByRole("row");
    // header row + one row per gap
    expect(rows).toHaveLength(3);

    expect(within(rows[1]).getByText("Connection error")).toBeInTheDocument();
    expect(within(rows[1]).getByText("22s")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Connection error")).toBeInTheDocument();
    expect(within(rows[2]).getByText("16s")).toBeInTheDocument();
  });

  it("shows 'no drops' for a healthy single-attempt recording", async () => {
    const logContent = [
      "[2026-08-01T10:00:00.000Z] Initialized recording manager for stream \"Cam\" with URL: rtsp://cam",
      "[2026-08-01T10:00:00.200Z] Stream is live, recording started.",
      "[2026-08-01T10:00:00.300Z] Recording to: /out/cam_attempt1.mp4 for duration: 60 seconds",
      "[2026-08-01T10:00:00.900Z] Recording has started, frames are being received.",
      "[2026-08-01T10:01:00.300Z] FFmpeg process exited with code 0 and signal none",
      "[2026-08-01T10:01:00.400Z] Recording completed successfully.",
    ].join("\n");

    const recording: RecordingWithStatus = {
      id: "rec-clean",
      name: "Camera B",
      rtspUrl: "rtsp://cam",
      startTime: "2026-08-01T10:00:00.000Z",
      duration: 60,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:01:00.400Z",
      status: "completed",
      isIgnoringLiveStatus: false,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: logContent }), { status: 200 })),
    );

    render(<RecordingGapsDialog open recording={recording} onCloseAction={() => {}} />);

    expect(await screen.findByText("No connection drops detected.")).toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });
});
