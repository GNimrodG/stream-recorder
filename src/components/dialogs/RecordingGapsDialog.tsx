"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { RecordingWithStatus } from "@/types/recording";
import { analyzeRecordingGaps, RecordingGap, RecordingGapReasonKind, RecordingSegment } from "@/lib/recordingGaps";

type Props = {
  open: boolean;
  onCloseAction: () => void;
  recording: RecordingWithStatus | null;
};

const REASON_LABELS: Record<RecordingGapReasonKind, string> = {
  connecting: "Connecting",
  "waiting-for-stream": "Waiting for stream",
  "connection-error": "Connection error",
  "no-frames": "No frames received",
  "process-error": "FFmpeg error",
  unknown: "Connection lost",
};

const REASON_COLORS: Record<RecordingGapReasonKind, "default" | "warning" | "error"> = {
  connecting: "default",
  "waiting-for-stream": "warning",
  "connection-error": "error",
  "no-frames": "error",
  "process-error": "error",
  unknown: "warning",
};

function formatGapDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

function formatClock(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

type TimelineBlock =
  | { kind: "segment"; startMs: number; endMs: number; segment: RecordingSegment }
  | { kind: "gap"; startMs: number; endMs: number; gap: RecordingGap };

export default function RecordingGapsDialog({ open, onCloseAction, recording }: Readonly<Props>) {
  const [logsContent, setLogsContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNowMs(null);
      return;
    }

    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open || !recording) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogsContent(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/recordings/${recording.id}/logs`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load logs" }));
          throw new Error(err.error || "Failed to load logs");
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setLogsContent(data.content ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, recording]);

  const analysis = useMemo(() => {
    if (logsContent === null || nowMs === null) return null;
    return analyzeRecordingGaps(logsContent, nowMs);
  }, [logsContent, nowMs]);

  const timeline = useMemo(() => {
    if (!analysis || nowMs === null || (analysis.segments.length === 0 && analysis.gaps.length === 0)) return null;

    const blocks: TimelineBlock[] = [
      ...analysis.segments.map(
        (segment): TimelineBlock => ({
          kind: "segment",
          startMs: new Date(segment.startTimestamp).getTime(),
          endMs: new Date(segment.endTimestamp).getTime(),
          segment,
        }),
      ),
      ...analysis.gaps.map((gap): TimelineBlock => {
        const startMs = new Date(gap.startTimestamp).getTime();
        const endMs = gap.endTimestamp ? new Date(gap.endTimestamp).getTime() : nowMs;
        return { kind: "gap", startMs, endMs, gap };
      }),
    ].sort((a, b) => a.startMs - b.startMs);

    const minMs = Math.min(...blocks.map((b) => b.startMs));
    const maxMs = Math.max(...blocks.map((b) => b.endMs));
    const totalMs = Math.max(1, maxMs - minMs);

    return { blocks, minMs, maxMs, totalMs };
  }, [analysis, nowMs]);

  return (
    <Dialog open={open} onClose={onCloseAction} maxWidth="md" fullWidth>
      <DialogTitle>Connection timeline: {recording?.name}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && analysis && (
          <>
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Typography color="text.secondary">
                {analysis.gaps.length === 0
                  ? "No connection drops detected."
                  : `${analysis.gaps.length} drop${analysis.gaps.length === 1 ? "" : "s"} detected, totalling ${formatGapDuration(analysis.totalGapSeconds)} lost.`}
              </Typography>
            </Box>

            {timeline && (
              <Box
                sx={{
                  display: "flex",
                  height: 28,
                  borderRadius: 1,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  "@keyframes recordingGapPulse": {
                    "0%": { opacity: 1 },
                    "50%": { opacity: 0.5 },
                    "100%": { opacity: 1 },
                  },
                }}>
                {timeline.blocks.map((block, idx) => {
                  const widthPercent = (Math.max(0, block.endMs - block.startMs) / timeline.totalMs) * 100;
                  if (block.kind === "segment") {
                    const label = `Recording | ${formatClock(block.segment.startTimestamp)} - ${
                      block.segment.ongoing ? "now" : formatClock(block.segment.endTimestamp)
                    }`;
                    return (
                      <Tooltip key={idx} title={label}>
                        <Box
                          sx={{
                            width: `${widthPercent}%`,
                            minWidth: widthPercent > 0 ? 2 : 0,
                            bgcolor: "success.main",
                            ...(block.segment.ongoing
                              ? { animation: "recordingGapPulse 1.2s ease-in-out infinite" }
                              : {}),
                          }}
                        />
                      </Tooltip>
                    );
                  }

                  const label = `${REASON_LABELS[block.gap.reasonKind]} | ${formatClock(block.gap.startTimestamp)} - ${
                    block.gap.endTimestamp ? formatClock(block.gap.endTimestamp) : "ongoing"
                  } (${block.gap.durationSeconds !== null ? formatGapDuration(block.gap.durationSeconds) : "ongoing"})\n${block.gap.reason}`;
                  return (
                    <Tooltip key={idx} title={<Box sx={{ whiteSpace: "pre-line" }}>{label}</Box>}>
                      <Box
                        sx={{
                          width: `${widthPercent}%`,
                          minWidth: 2,
                          bgcolor: block.gap.reasonKind === "connecting" ? "action.disabledBackground" : "error.main",
                          ...(block.gap.endTimestamp === null
                            ? { animation: "recordingGapPulse 1.2s ease-in-out infinite" }
                            : {}),
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            )}

            {analysis.gaps.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Start</TableCell>
                    <TableCell>End</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.gaps.map((gap, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{formatClock(gap.startTimestamp)}</TableCell>
                      <TableCell>{gap.endTimestamp ? formatClock(gap.endTimestamp) : "Ongoing"}</TableCell>
                      <TableCell>
                        {gap.durationSeconds !== null ? formatGapDuration(gap.durationSeconds) : "—"}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={gap.reason}>
                          <Chip
                            size="small"
                            color={REASON_COLORS[gap.reasonKind]}
                            label={REASON_LABELS[gap.reasonKind]}
                            sx={{ maxWidth: 260 }}
                          />
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {!loading && !error && logsContent !== null && !analysis?.segments.length && !analysis?.gaps.length && (
          <Typography color="text.secondary">No recording activity found in the logs yet.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCloseAction}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
