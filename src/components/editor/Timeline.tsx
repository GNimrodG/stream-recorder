"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { Add, Remove } from "@mui/icons-material";
import type { SceneChange, VideoSegment } from "@/types/editor";

export type HoverCursorHandle = {
  setHover: (time: number | null) => void;
};

export type TimelineProps = {
  duration: number;
  currentTime: number;
  segments: VideoSegment[];
  scenes: SceneChange[];
  onSeek: (time: number) => void;
  onAddSegment: (start?: number, end?: number) => void;
  onUpdateSegment: (id: string, update: Partial<VideoSegment>) => void;
  onRemoveSegment: (id: string) => void;
  zoom?: number;
  viewStart?: number;
  onZoomChange?: (zoom: number) => void;
  onViewStartChange?: (viewStart: number) => void;
  onHoverChange?: (time: number | null) => void;
};

type DragState = {
  segmentId: string;
  handle: "start" | "end" | "move";
  startClientX: number;
  originalStart: number;
  originalEnd: number;
} | null;

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatTimePrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00.0";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frac = Math.floor((seconds - Math.floor(seconds)) * 10); // tenths
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${frac}`;
}

const Timeline = forwardRef<HoverCursorHandle, TimelineProps>(function Timeline(
  {
    duration,
    currentTime,
    segments,
    scenes,
    onSeek,
    onAddSegment,
    onUpdateSegment,
    onRemoveSegment,
    zoom = 1,
    viewStart = 0,
    onZoomChange,
    onViewStartChange,
    onHoverChange,
  }: Readonly<TimelineProps>,
  ref,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

  const visibleDuration = duration / Math.max(1, zoom);
  const viewEnd = Math.min(duration, viewStart + visibleDuration);

  const timeToPercent = useCallback(
    (time: number) => {
      if (duration <= 0 || visibleDuration <= 0) return 0;
      return Math.max(0, Math.min(100, ((time - viewStart) / visibleDuration) * 100));
    },
    [duration, visibleDuration, viewStart],
  );

  const percentToTime = useCallback(
    (percent: number) => viewStart + (percent / 100) * visibleDuration,
    [viewStart, visibleDuration],
  );

  const xToTime = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return percentToTime(percent * 100);
    },
    [percentToTime],
  );

  const handleAddSegment = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-seg-handle]")) {
        return;
      }
      const time = xToTime(event.clientX);
      onAddSegment(time, Math.min(duration, time + Math.max(10, duration * 0.05)));
    },
    [duration, onAddSegment, xToTime],
  );

  const handleTrackClick = useCallback(
    (event: React.MouseEvent) => {
      if (dragState) return;
      if ((event.target as HTMLElement).closest("[data-seg-handle]")) return;
      onSeek(xToTime(event.clientX));
    },
    [dragState, onSeek, xToTime],
  );

  const startDrag = useCallback((event: React.MouseEvent, segment: VideoSegment, handle: "start" | "end" | "move") => {
    event.preventDefault();
    event.stopPropagation();
    setDragState({
      segmentId: segment.id,
      handle,
      startClientX: event.clientX,
      originalStart: segment.startTime,
      originalEnd: segment.endTime,
    });
  }, []);

  const updateHoverOverlay = useCallback(
    (nextTime: number | null) => {
      const line = hoverLineRef.current;
      const tooltip = hoverTooltipRef.current;
      if (!line || !tooltip) return;

      if (nextTime === null || duration <= 0) {
        line.style.display = "none";
        tooltip.style.display = "none";
        return;
      }

      const leftPercent = Math.max(0, Math.min(100, ((nextTime - viewStart) / visibleDuration) * 100));
      line.style.display = "block";
      line.style.left = `${leftPercent}%`;

      tooltip.style.display = "block";
      tooltip.style.left = `${leftPercent}%`;
      tooltip.textContent = formatTimePrecise(nextTime);
    },
    [duration, viewStart, visibleDuration],
  );

  useImperativeHandle(
    ref,
    () => ({
      setHover: updateHoverOverlay,
    }),
    [updateHoverOverlay],
  );

  useEffect(() => {
    if (!dragState) return;

    const onMove = (event: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const deltaSeconds = ((event.clientX - dragState.startClientX) / rect.width) * visibleDuration;
      if (dragState.handle === "start") {
        const nextStart = Math.max(0, Math.min(dragState.originalEnd - 0.5, dragState.originalStart + deltaSeconds));
        onUpdateSegment(dragState.segmentId, { startTime: nextStart });
      } else if (dragState.handle === "end") {
        const nextEnd = Math.min(
          duration,
          Math.max(dragState.originalStart + 0.5, dragState.originalEnd + deltaSeconds),
        );
        onUpdateSegment(dragState.segmentId, { endTime: nextEnd });
      } else {
        const length = dragState.originalEnd - dragState.originalStart;
        const nextStart = Math.max(0, Math.min(duration - length, dragState.originalStart + deltaSeconds));
        onUpdateSegment(dragState.segmentId, { startTime: nextStart, endTime: nextStart + length });
      }
    };

    const onUp = () => setDragState(null);
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
    return () => {
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    };
  }, [dragState, duration, onUpdateSegment, visibleDuration]);

  const ticks = useMemo(() => {
    if (!duration) return [] as number[];
    const tickCount = Math.max(6, Math.min(12, zoom * 4));
    const step = Math.max(1, Math.round(visibleDuration / tickCount));
    const start = Math.ceil(viewStart / step) * step;
    const values: number[] = [];
    for (let time = start; time <= viewEnd; time += step) {
      values.push(time);
    }
    return values;
  }, [duration, viewEnd, visibleDuration, viewStart, zoom]);

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
      }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => onAddSegment()}>
            Add Segment
          </Button>
          <Typography variant="caption" color="text.secondary">
            Drag the handles or double-click to create a segment
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" onClick={() => onZoomChange?.(Math.max(1, zoom / 2))}>
            <Remove fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 48, textAlign: "center" }}>
            {zoom}x
          </Typography>
          <IconButton size="small" onClick={() => onZoomChange?.(Math.min(8, zoom * 2))}>
            <Add fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {zoom > 1 && (
        <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
          <Typography variant="caption" color="text.secondary">
            Pan timeline
          </Typography>
          <input
            type="range"
            min={0}
            max={Math.max(0, duration - visibleDuration)}
            value={viewStart}
            onChange={(event) => onViewStartChange?.(Number(event.target.value))}
            style={{ width: "100%" }}
          />
        </Box>
      )}

      <Box sx={{ px: 2, pt: 2, pb: 1, position: "relative" }}>
        <Box sx={{ position: "relative", height: 24 }}>
          {ticks.map((time, i, arr) => (
            <Box
              key={time}
              sx={{
                position: "absolute",
                left: `${timeToPercent(time)}%`,
                top: 0,
                transform: "translateX(-50%)",
                width: 0,
              }}>
              <Typography
                variant="caption"
                sx={{
                  position: "absolute",
                  left: 0,
                  transform:
                    i === 0 ? "translateX(0)" : i === arr.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                  fontSize: 10,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                  textAlign: i === 0 ? "left" : i === arr.length - 1 ? "right" : "center",
                }}>
                {formatTime(time)}
              </Typography>
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  top: 16,
                  width: "1px",
                  height: 8,
                  bgcolor: "divider",
                  transform: "translateX(-50%)",
                }}
              />
            </Box>
          ))}
        </Box>

        <Box
          ref={trackRef}
          sx={{
            position: "relative",
            height: 96,
            borderRadius: 2,
            bgcolor: "grey.900",
            border: "1px solid",
            borderColor: "divider",
            overflow: "visible",
            cursor: "crosshair",
          }}
          onClick={handleTrackClick}
          onDoubleClick={handleAddSegment}
          onMouseMove={(event) => {
            const t = xToTime(event.clientX);
            updateHoverOverlay(t);
            onHoverChange?.(t);
          }}
          onMouseLeave={() => {
            updateHoverOverlay(null);
            onHoverChange?.(null);
          }}>
          <Box sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.15)" }} />

          {segments.map((segment) => {
            const left = timeToPercent(segment.startTime);
            const right = 100 - timeToPercent(segment.endTime);
            if (left >= 100 || right >= 100) return null;

            const accent = segment.enabled ? "primary.main" : "grey.600";
            const fill = segment.enabled ? "rgba(25, 118, 210, 0.24)" : "rgba(158, 158, 158, 0.16)";

            return (
              <Box
                key={segment.id}
                sx={{
                  position: "absolute",
                  top: 10,
                  bottom: 10,
                  left: `${left}%`,
                  right: `${right}%`,
                  minWidth: 12,
                  bgcolor: fill,
                  borderLeft: "2px solid",
                  borderRight: "2px solid",
                  borderColor: accent,
                  display: "flex",
                  alignItems: "center",
                  overflow: "hidden",
                }}>
                <Box
                  sx={{ position: "absolute", inset: 0 }}
                  onMouseDown={(event) => startDrag(event, segment, "move")}
                  data-seg-handle
                />
                <Box sx={{ px: 1.5, position: "relative", zIndex: 1, pointerEvents: "none" }}>
                  <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 600 }}>
                    {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                  </Typography>
                </Box>
                <Box
                  sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, cursor: "w-resize", zIndex: 2 }}
                  onMouseDown={(event) => startDrag(event, segment, "start")}
                  data-seg-handle
                />
                <Box
                  sx={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "e-resize", zIndex: 2 }}
                  onMouseDown={(event) => startDrag(event, segment, "end")}
                  data-seg-handle
                />
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveSegment(segment.id);
                  }}
                  sx={{ position: "absolute", right: 8, top: 8, minWidth: 0, p: 0.5, zIndex: 2 }}>
                  ×
                </Button>
              </Box>
            );
          })}

          {scenes.map((scene, index) => (
            <Box
              key={`${scene.timestamp}-${index}`}
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${timeToPercent(scene.timestamp)}%`,
                width: "2px",
                bgcolor: "warning.main",
                transform: "translateX(-50%)",
                opacity: 0.8,
                cursor: "pointer",
                zIndex: 3,
              }}
              title={`Scene at ${formatTime(scene.timestamp)} (${Math.round(scene.score * 100)}%)`}
              onClick={(event) => {
                event.stopPropagation();
                onSeek(scene.timestamp);
              }}
            />
          ))}

          <Box
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${timeToPercent(currentTime)}%`,
              width: 2,
              bgcolor: "secondary.main",
              transform: "translateX(-50%)",
              zIndex: 4,
              pointerEvents: "none",
            }}
          />

          <Box
            ref={hoverLineRef}
            sx={{
              display: "none",
              position: "absolute",
              top: "8%",
              bottom: "8%",
              width: "1px",
              bgcolor: "rgba(255,255,255,0.35)",
              transform: "translateX(-50%)",
              pointerEvents: "none",
              zIndex: 3,
            }}
          />

          <Box
            ref={hoverTooltipRef}
            sx={{
              display: "none",
              position: "absolute",
              top: -28,
              transform: "translateX(-50%)",
              pointerEvents: "none",
              zIndex: 6,
              bgcolor: "background.paper",
              color: "text.primary",
              px: 0.5,
              py: 0.25,
              borderRadius: 1,
              boxShadow: 1,
              fontSize: 11,
              minWidth: 56,
              textAlign: "center",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
});

export default Timeline;
