"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { RecordingWithStatus } from "@/types/recording";
import { useLocalStorage } from "@mantine/hooks";
import {
  buildRecordingLogDisplayItems,
  LogDisplayItem,
  LogLineItem,
  LogPlaceholderItem,
  parseRecordingLogLine,
} from "@/lib/recordingLogDisplay";

type Props = {
  open: boolean;
  onCloseAction: () => void;
  recording: RecordingWithStatus | null;
};

export default function RecordingLogsDialog({ open, onCloseAction, recording }: Readonly<Props>) {
  const [logsContent, setLogsContent] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  // Persisted UI preferences (stored in localStorage)
  const [hideEmptyLines, setHideEmptyLines] = useLocalStorage<boolean>({
    key: "recordingLogs.hideEmptyLines",
    defaultValue: false,
  });

  const [hideFrameLines, setHideFrameLines] = useLocalStorage<boolean>({
    key: "recordingLogs.hideFrameLines",
    defaultValue: false,
  });

  const [hideHlsNoise, setHideHlsNoise] = useLocalStorage<boolean>({
    key: "recordingLogs.hideHlsNoise",
    defaultValue: true,
  });

  const [lineWrap, setLineWrap] = useLocalStorage<boolean>({
    key: "recordingLogs.lineWrap",
    defaultValue: false,
  });

  const [showTimestamps, setShowTimestamps] = useLocalStorage<boolean>({
    key: "recordingLogs.showTimestamps",
    defaultValue: true,
  });

  const [transition, startTransition] = useTransition();

  // When logs are very large, load only the tail by default (few thousand lines) to avoid UI freezes.
  const DEFAULT_TAIL = 2000; // lines
  const TAIL_INCREMENT = 2000;
  const [tailLines, setTailLines] = useState<number>(DEFAULT_TAIL);

  const fetchLogs = useCallback(async (id: string, tail = 0) => {
    startTransition(async () => {
      setLogsLoading(true);
      try {
        const url = `/api/recordings/${id}/logs` + (tail > 0 ? `?tail=${tail}` : "");
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load logs" }));
          throw new Error(err.error || "Failed to load logs");
        }

        const data = await res.json();
        setLogsContent(data.content ?? "");
      } catch (error) {
        setLogsContent(`Error loading logs: ${(error as Error).message}`);
      } finally {
        setLogsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (open && recording) {
      // If tailLines is 0 we request the full file (no ?tail param)
      fetchLogs(recording.id, tailLines === 0 ? 0 : tailLines);
    } else if (!open) {
      // clear when closed
      setLogsContent(null);
      // reset tail preference to default when closed so re-opening starts small again
      setTailLines(DEFAULT_TAIL);
    }
  }, [open, recording, fetchLogs, tailLines]);

  // Reset expanded placeholders whenever logs content changes
  useEffect(() => {
    setExpandedPlaceholders({});
  }, [logsContent]);

  // Build structured display items (lines and placeholders) so placeholders can be expanded
  const displayedItems = useMemo<LogDisplayItem[] | null>(() => {
    if (logsContent === null) return null;
    return buildRecordingLogDisplayItems(logsContent, {
      hideEmptyLines,
      hideFrameLines,
      hideHlsNoise: hideHlsNoise && /^https?:\/\//i.test(recording?.rtspUrl ?? ""),
    });
  }, [logsContent, hideEmptyLines, hideFrameLines, hideHlsNoise, recording?.rtspUrl]);

  // Track which placeholders are expanded (by index in displayedItems)
  const [expandedPlaceholders, setExpandedPlaceholders] = useState<Record<number, boolean>>({});
  const togglePlaceholder = (idx: number) => {
    setExpandedPlaceholders((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Helper to format timestamps (best-effort)
  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString();
    } catch {
      return ts;
    }
  };

  // Derived metrics about the current content
  const currentLineCount = useMemo(() => {
    if (!logsContent) return 0;
    return logsContent.split(/\r?\n/).length;
  }, [logsContent]);

  const isShowingTail = tailLines > 0;
  // If the server returned fewer lines than requested tail, we've likely fetched the whole file
  const canLoadMore = isShowingTail && currentLineCount >= tailLines && currentLineCount > 0;
  const likelyFullFile = isShowingTail && currentLineCount > 0 && currentLineCount < tailLines;

  return (
    <Dialog open={open} onClose={onCloseAction} maxWidth="xl" fullWidth>
      <DialogTitle>Logs: {recording?.name}</DialogTitle>
      {/* Make DialogContent a column and hide its overflow so only the inner log box scrolls */}
      <DialogContent sx={{ display: "flex", flexDirection: "column", overflow: "hidden", gap: 1 }}>
        {/* Options to filter logs */}
        <Box sx={{ display: "flex", gap: 2, mb: 1, alignItems: "center", flexWrap: "wrap" }}>
          <FormControlLabel
            control={
              <Checkbox checked={hideEmptyLines} onChange={(e) => setHideEmptyLines(e.target.checked)} size="small" />
            }
            label="Hide empty lines"
          />

          <FormControlLabel
            control={
              <Checkbox checked={hideFrameLines} onChange={(e) => setHideFrameLines(e.target.checked)} size="small" />
            }
            label="Hide frame lines"
          />

          {/^(?:https?):\/\//i.test(recording?.rtspUrl ?? "") && (
            <FormControlLabel
              control={
                <Checkbox checked={hideHlsNoise} onChange={(e) => setHideHlsNoise(e.target.checked)} size="small" />
              }
              label="Hide routine HLS lines"
            />
          )}

          <FormControlLabel
            control={<Checkbox checked={lineWrap} onChange={(e) => setLineWrap(e.target.checked)} size="small" />}
            label="Line wrap"
          />

          <FormControlLabel
            control={
              <Checkbox checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} size="small" />
            }
            label="Show timestamps"
          />
        </Box>

        {/* Tail / load controls: show when logs are potentially large or when tailing is active */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
          {isShowingTail ? (
            <Typography color="text.secondary" sx={{ mr: 1 }}>
              Showing last {tailLines} lines (retrieved {currentLineCount} lines)
            </Typography>
          ) : (
            <Typography color="text.secondary" sx={{ mr: 1 }}>
              Showing full logs ({currentLineCount} lines)
            </Typography>
          )}

          {recording && (
            <>
              <Button
                size="small"
                onClick={() => {
                  // request more lines (increase tail and refetch)
                  const next = (tailLines || DEFAULT_TAIL) + TAIL_INCREMENT;
                  setTailLines(next);
                  fetchLogs(recording.id, next);
                }}
                disabled={logsLoading || !canLoadMore}>
                Load more
              </Button>

              <Button
                size="small"
                onClick={() => {
                  // request the full logs
                  setTailLines(0);
                  fetchLogs(recording.id, 0);
                }}
                disabled={logsLoading || !isShowingTail || likelyFullFile}>
                Load full logs
              </Button>
            </>
          )}
          {likelyFullFile && (
            <Typography color="text.secondary" sx={{ ml: 1 }}>
              Full logs retrieved (file smaller than requested tail).
            </Typography>
          )}
        </Box>

        {logsLoading && !displayedItems?.length ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : displayedItems !== null ? (
          // The scrollable log area: flex:1 so it grows and is the only scrollable area
          <Box
            sx={{
              fontFamily: "monospace",
              whiteSpace: lineWrap ? "pre-wrap" : "pre",
              overflow: "auto",
              flex: 1,
              minHeight: 120,
              maxHeight: "80dvh",

              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 1,
            }}>
            {transition && (
              <Box
                sx={{
                  position: "sticky",
                  top: 0,
                }}>
                <LinearProgress sx={{ width: "100%" }} />
              </Box>
            )}
            {displayedItems.length === 0 ? (
              <Typography color="text.secondary">No logs to show after applying filters.</Typography>
            ) : (
              <Box component="div">
                {displayedItems.map((item, idx) => {
                  if (item.type === "placeholder") {
                    const ph = item as LogPlaceholderItem;
                    const start = formatTimestamp(ph.startTimestamp);
                    const end = formatTimestamp(ph.endTimestamp);
                    const description = ph.kind === "hls" ? "routine HLS lines" : "frame lines";
                    const label = `${ph.count} ${description} hidden${start || end ? ` (${start ?? "?"}${start && end ? " - " : ""}${end ?? "?"})` : ""}`;
                    const isExpanded = expandedPlaceholders[idx];

                    return (
                      <Box key={idx}>
                        <Typography
                          component="div"
                          onClick={() => togglePlaceholder(idx)}
                          sx={{
                            color: "text.secondary",
                            fontStyle: "italic",
                            fontSize: "0.95em",
                            cursor: "pointer",
                            userSelect: "none",
                            py: 0.5,
                          }}>
                          {isExpanded ? `▼ ${label}` : `▶ ${label}`}
                        </Typography>

                        {isExpanded && (
                          <Box sx={{ pl: 2 }}>
                            {ph.lines.map((rawLine, subIdx) => {
                              // parse and render the original lines when expanded
                              const parsed = parseRecordingLogLine(rawLine);
                              return (
                                <Box key={subIdx} component="div" sx={{ display: "flex", gap: 1 }}>
                                  {showTimestamps && (
                                    <Box sx={{ color: "text.secondary", minWidth: 200 }}>
                                      {parsed.timestamp ? formatTimestamp(parsed.timestamp) : ""}
                                    </Box>
                                  )}
                                  <Box sx={{ fontFamily: "monospace", whiteSpace: lineWrap ? "pre-wrap" : "pre" }}>
                                    {parsed.text}
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    );
                  }

                  // regular line rendering: split timestamp and content
                  const line = item as LogLineItem;
                  return (
                    <Box key={idx} component="div" sx={{ display: "flex", gap: 1 }}>
                      {showTimestamps && (
                        <Box sx={{ color: "text.secondary", minWidth: 200 }}>
                          {line.timestamp ? formatTimestamp(line.timestamp) : ""}
                        </Box>
                      )}
                      <Box sx={{ fontFamily: "monospace", whiteSpace: lineWrap ? "pre-wrap" : "pre" }}>{line.text}</Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        ) : (
          <Typography color="text.secondary">No logs available for this recording.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<DownloadIcon />}
          component="a"
          href={recording ? `/api/recordings/${recording.id}/logs/download` : undefined}
          disabled={!recording}>
          Download
        </Button>
        <Button onClick={onCloseAction}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
